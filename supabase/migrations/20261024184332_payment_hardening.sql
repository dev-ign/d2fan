-- Additive D1 fix: terminal full refunds and serialized entitlement decisions.
-- No catalog, asset, pricing or historical data updates.

create or replace function public.fulfill_checkout(p_event text,p_type text,p_attempt uuid,p_session text,p_intent text,p_amount integer,p_currency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a checkout_attempts; p uuid; granted integer;
begin
 -- Both payment RPCs acquire the same fan lock before locking a purchase or
 -- entitlement. Different fans remain independent; FK inserts may still proceed.
 select * into a from checkout_attempts where id=p_attempt;
 if not found then raise exception 'payment_mismatch'; end if;
 perform 1 from public.fans where id=a.fan_id and artist_id=a.artist_id for no key update;
 -- Read again after waiting: decisions must use the latest committed state.
 select * into a from checkout_attempts where id=p_attempt for update;
 if not found or a.stripe_session_id is distinct from p_session or a.amount_minor<>p_amount or a.currency<>p_currency then raise exception 'payment_mismatch'; end if;
 if exists(select 1 from webhook_events where event_id=p_event) then return (select id from purchases where checkout_attempt_id=a.id); end if;
 insert into purchases(artist_id,fan_id,checkout_attempt_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_minor,currency,purpose,vault_item_slug,status)
 values(a.artist_id,a.fan_id,a.id,p_session,p_intent,p_amount,p_currency,a.purpose,a.item_slug,'paid') on conflict(checkout_attempt_id) do nothing;
 select id into p from purchases where checkout_attempt_id=a.id;
 update checkout_attempts set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=a.id;
 -- A later success notification cannot reactivate a refunded purchase.
 if (select status from purchases where id=p)='paid' then
  if a.purpose='vault_unlock' then
   insert into vault_unlocks(artist_id,fan_id,item_slug,purchase_id) values(a.artist_id,a.fan_id,a.item_slug,p)
   on conflict(artist_id,fan_id,item_slug) do update set purchase_id=excluded.purchase_id,status='active',unlocked_at=now(),revoked_at=null where vault_unlocks.status='revoked';
   get diagnostics granted=row_count;
   if granted>0 then
    insert into fan_events(artist_id,fan_id,event_type,event_id) values(a.artist_id,a.fan_id,'vault_unlocked','unlock:'||p) on conflict do nothing;
   end if;
  end if;
  insert into fan_events(artist_id,fan_id,event_type,event_id) values(a.artist_id,a.fan_id,'checkout_completed','completed:'||a.id) on conflict do nothing;
  insert into fan_events(artist_id,fan_id,event_type,event_id,metadata) values(a.artist_id,a.fan_id,'purchase_completed','purchase:'||p,jsonb_build_object('amount_minor',p_amount,'currency',p_currency)) on conflict do nothing;
  insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(a.artist_id,a.fan_id,'purchase','purchase:'||p,jsonb_build_object('purchaseId',p)) on conflict do nothing;
  if a.analytics_consent then
   insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(a.artist_id,a.fan_id,'meta','meta:purchase:'||p,jsonb_build_object('event','Purchase','eventId','purchase:'||p,'amountMinor',p_amount,'currency',p_currency)) on conflict do nothing;
   if granted>0 then
    insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(a.artist_id,a.fan_id,'meta','meta:unlock:'||p,jsonb_build_object('event','VaultUnlock','eventId','unlock:'||p)) on conflict do nothing;
   end if;
  end if;
 end if;
 insert into webhook_events(event_id,event_type) values(p_event,p_type) on conflict do nothing;
 return p;
end $$;

create or replace function public.refund_purchase(p_event text,p_intent text,p_full boolean)
returns void language plpgsql security definer set search_path=public as $$
declare p public.purchases; replacement uuid;
begin
 if p_full is null then raise exception 'invalid_refund'; end if;
 -- Read identity without a purchase lock, then follow fulfillment's lock order.
 select * into p from public.purchases where stripe_payment_intent_id=p_intent;
 if not found then raise exception 'purchase_not_ready'; end if;
 perform 1 from public.fans where id=p.fan_id and artist_id=p.artist_id for no key update;
 select * into p from public.purchases where stripe_payment_intent_id=p_intent for update;
 if not found then raise exception 'purchase_not_ready'; end if;
 if exists(select 1 from public.webhook_events where event_id=p_event) then return; end if;

 -- Stripe state was fetched before this transaction. A delayed partial result
 -- must never downgrade a committed full refund or change its refund timestamp.
 update public.purchases
 set status=case when p_full then 'refunded' else 'partially_refunded' end,
     refunded_at=now()
 where id=p.id and status<>'refunded';

 if p.purpose='vault_unlock' and (p_full or p.status='refunded') then
  -- Under the shared fan lock, select one genuinely qualifying purchase from
  -- current committed state. Never resurrect a refunded purchase as a fallback.
  select id into replacement from public.purchases
  where artist_id=p.artist_id and fan_id=p.fan_id
    and vault_item_slug=p.vault_item_slug and purpose='vault_unlock'
    and status in ('paid','partially_refunded')
  order by paid_at desc,id desc limit 1;

  update public.vault_unlocks
  set purchase_id=coalesce(replacement,purchase_id),
      status=case when replacement is not null then 'active' else 'revoked' end,
      revoked_at=case when replacement is not null then null else coalesce(revoked_at,now()) end
  where artist_id=p.artist_id and fan_id=p.fan_id and item_slug=p.vault_item_slug;
 end if;
 insert into public.webhook_events(event_id,event_type) values(p_event,'charge.refunded');
end $$;

-- CREATE OR REPLACE preserves grants; restate the existing service-only boundary.
revoke execute on function public.fulfill_checkout(text,text,uuid,text,text,integer,text),
 public.refund_purchase(text,text,boolean) from public, anon, authenticated;
grant execute on function public.fulfill_checkout(text,text,uuid,text,text,integer,text),
 public.refund_purchase(text,text,boolean) to service_role;

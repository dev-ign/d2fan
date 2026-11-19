-- Historical attempts keep NULL payment provenance. New guest tips always bind
-- the checkout to an explicit mode and merchant and store only a retry hash.
alter table public.checkout_attempts
 alter column fan_id drop not null,
 add column payment_mode text,
 add column stripe_account_id text,
 add column guest_token_hash text,
 add constraint checkout_attempt_payment_context check (
  (payment_mode is null and stripe_account_id is null)
  or (payment_mode is not null and payment_mode in ('test', 'live')
      and stripe_account_id is not null and stripe_account_id ~ '^acct_[A-Za-z0-9]+$'
      and (stripe_session_id is null or starts_with(stripe_session_id, 'cs_' || payment_mode || '_')))
 ),
 add constraint checkout_attempt_guest_tip check (
  (fan_id is not null and guest_token_hash is null)
  or (fan_id is null and purpose='tip' and item_slug is null and not analytics_consent
      and payment_mode is not null and guest_token_hash is not null and guest_token_hash ~ '^[0-9a-f]{64}$')
 );

alter table public.purchases
 alter column fan_id drop not null,
 add constraint purchase_guest_tip check (
  fan_id is not null or (purpose='tip' and vault_item_slug is null and currency='usd'
                         and amount_minor between 500 and 100000)
 );

create or replace function public.fulfill_checkout(p_event text,p_type text,p_attempt uuid,p_session text,p_intent text,p_amount integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.checkout_attempts; p uuid; granted integer;
begin
 -- Linked purchases keep the fan → attempt lock order. Guest tips lock the attempt.
 select * into a from public.checkout_attempts where id=p_attempt;
 if not found then raise exception 'payment_mismatch'; end if;
 if a.fan_id is not null then
  perform 1 from public.fans where id=a.fan_id and artist_id=a.artist_id for no key update;
 end if;
 select * into a from public.checkout_attempts where id=p_attempt for update;
 if not found or a.stripe_session_id is distinct from p_session or a.amount_minor is distinct from p_amount or a.currency is distinct from p_currency then raise exception 'payment_mismatch'; end if;
 if exists(select 1 from public.webhook_events where event_id=p_event) then return (select id from public.purchases where checkout_attempt_id=a.id); end if;
 insert into public.purchases(artist_id,fan_id,checkout_attempt_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_minor,currency,purpose,vault_item_slug,status)
 values(a.artist_id,a.fan_id,a.id,p_session,p_intent,p_amount,p_currency,a.purpose,a.item_slug,'paid') on conflict(checkout_attempt_id) do nothing;
 select id into p from public.purchases
 where checkout_attempt_id=a.id and stripe_payment_intent_id=p_intent;
 if not found then raise exception 'payment_mismatch'; end if;
 update public.checkout_attempts set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=a.id;
 -- A later success notification cannot reactivate a refunded purchase.
 if a.fan_id is not null and (select status from public.purchases where id=p)='paid' then
  if a.purpose='vault_unlock' then
   insert into public.vault_unlocks(artist_id,fan_id,item_slug,purchase_id) values(a.artist_id,a.fan_id,a.item_slug,p)
   on conflict(artist_id,fan_id,item_slug) do update set purchase_id=excluded.purchase_id,status='active',unlocked_at=now(),revoked_at=null where vault_unlocks.status='revoked';
   get diagnostics granted=row_count;
   if granted>0 then
    insert into public.fan_events(artist_id,fan_id,event_type,event_id) values(a.artist_id,a.fan_id,'vault_unlocked','unlock:'||p) on conflict do nothing;
   end if;
  end if;
  insert into public.fan_events(artist_id,fan_id,event_type,event_id) values(a.artist_id,a.fan_id,'checkout_completed','completed:'||a.id) on conflict do nothing;
  insert into public.fan_events(artist_id,fan_id,event_type,event_id,metadata) values(a.artist_id,a.fan_id,'purchase_completed','purchase:'||p,jsonb_build_object('amount_minor',p_amount,'currency',p_currency)) on conflict do nothing;
  insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(a.artist_id,a.fan_id,'purchase','purchase:'||p,jsonb_build_object('purchaseId',p)) on conflict do nothing;
  if a.analytics_consent then
   insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(a.artist_id,a.fan_id,'meta','meta:purchase:'||p,jsonb_build_object('event','Purchase','eventId','purchase:'||p,'amountMinor',p_amount,'currency',p_currency)) on conflict do nothing;
   if granted>0 then
    insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(a.artist_id,a.fan_id,'meta','meta:unlock:'||p,jsonb_build_object('event','VaultUnlock','eventId','unlock:'||p)) on conflict do nothing;
   end if;
  end if;
 end if;
 insert into public.webhook_events(event_id,event_type) values(p_event,p_type) on conflict do nothing;
 return p;
end $$;

create or replace function public.refund_purchase(p_event text,p_intent text,p_full boolean)
returns void language plpgsql security definer set search_path='' as $$
declare p public.purchases; replacement uuid;
begin
 if p_full is null then raise exception 'invalid_refund'; end if;
 -- Follow fulfillment’s lock order before acquiring the purchase lock.
 select * into p from public.purchases where stripe_payment_intent_id=p_intent;
 if not found then raise exception 'purchase_not_ready'; end if;
 if p.fan_id is null then
  perform 1 from public.checkout_attempts where id=p.checkout_attempt_id for update;
 else
  perform 1 from public.fans where id=p.fan_id and artist_id=p.artist_id for no key update;
 end if;
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

revoke execute on function public.fulfill_checkout(text,text,uuid,text,text,integer,text),
 public.refund_purchase(text,text,boolean) from public, anon, authenticated;
grant execute on function public.fulfill_checkout(text,text,uuid,text,text,integer,text),
 public.refund_purchase(text,text,boolean) to service_role;

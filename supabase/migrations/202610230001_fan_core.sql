-- Server-mediated Phase 1. No browser grants, including RPC execution.
create extension if not exists pgcrypto;
create table public.fans (
 id uuid primary key default gen_random_uuid(), artist_id text not null,
 email_normalized text not null check (email_normalized = lower(trim(email_normalized))),
 phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
 preferred_language text not null default 'en' check (preferred_language in ('en','es')),
 email_verified_at timestamptz, country_code text,
 first_touch_source text not null, first_touch_release_slug text,
 first_touch_utm jsonb not null default '{}', last_touch_utm jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(artist_id,email_normalized), unique(artist_id,id)
);
create unique index fans_verified_phone on public.fans(artist_id,phone_e164) where phone_e164 is not null;
create table public.consent_records (
 id uuid primary key default gen_random_uuid(), artist_id text not null, fan_id uuid not null,
 channel text not null check(channel in ('email','whatsapp','analytics')),
 purpose text not null check(purpose in ('marketing','measurement')),
 status text not null check(status in ('pending','granted','revoked')),
 consent_text_version text not null, capture_source text not null,
 captured_at timestamptz not null default now(), revoked_at timestamptz,
 foreign key(artist_id,fan_id) references public.fans(artist_id,id)
);
create index consent_latest on public.consent_records(fan_id,channel,purpose,captured_at desc);
create table public.fan_events (
 id uuid primary key default gen_random_uuid(), artist_id text not null, fan_id uuid,
 event_type text not null, event_id text not null unique, release_slug text, source text,
 metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(artist_id,fan_id) references public.fans(artist_id,id)
);
create table public.checkout_attempts (
 id uuid primary key, artist_id text not null, fan_id uuid not null,
 purpose text not null check(purpose in ('tip','vault_unlock')), item_slug text,
 amount_minor integer not null check(amount_minor between 500 and 100000), currency text not null check(currency='usd'),
 status text not null default 'draft' check(status in ('draft','pending_payment','completed','expired','cancelled','failed')),
 stripe_session_id text unique, checkout_url text, analytics_consent boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '24 hours', completed_at timestamptz,
 foreign key(artist_id,fan_id) references public.fans(artist_id,id), unique(artist_id,id),
 check((purpose='tip' and item_slug is null) or (purpose='vault_unlock' and item_slug is not null))
);
create index checkout_fan on public.checkout_attempts(fan_id,created_at desc);
create table public.purchases (
 id uuid primary key default gen_random_uuid(), artist_id text not null, fan_id uuid not null,
 checkout_attempt_id uuid not null unique, stripe_checkout_session_id text not null unique,
 stripe_payment_intent_id text not null unique, amount_minor integer not null, currency text not null,
 purpose text not null, vault_item_slug text, status text not null check(status in ('paid','refunded','partially_refunded')),
 created_at timestamptz not null default now(), paid_at timestamptz not null default now(), refunded_at timestamptz,
 foreign key(artist_id,fan_id) references public.fans(artist_id,id),
 foreign key(artist_id,checkout_attempt_id) references public.checkout_attempts(artist_id,id)
);
create table public.vault_unlocks (
 id uuid primary key default gen_random_uuid(), artist_id text not null, fan_id uuid not null,
 item_slug text not null, purchase_id uuid not null references public.purchases(id),
 status text not null default 'active' check(status in ('active','revoked')),
 unlocked_at timestamptz not null default now(), revoked_at timestamptz,
 unique(artist_id,fan_id,item_slug), foreign key(artist_id,fan_id) references public.fans(artist_id,id)
);
create table public.webhook_events (event_id text primary key, event_type text not null, processed_at timestamptz not null default now());
create table public.delivery_jobs (
 id uuid primary key default gen_random_uuid(), artist_id text not null, fan_id uuid not null,
 kind text not null, dedupe_key text not null unique, payload jsonb not null default '{}',
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','skipped')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_until timestamptz, provider_id text, last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
 foreign key(artist_id,fan_id) references public.fans(artist_id,id)
);
create index jobs_pending on public.delivery_jobs(available_at) where status in ('pending','processing');
create table public.rate_limits (key text primary key, count integer not null, expires_at timestamptz not null);
create table public.capture_requests (id uuid primary key, artist_id text not null, fan_id uuid not null, fingerprint text not null, created_at timestamptz not null default now());

create function public.check_rate(p_key text, p_limit integer) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into rate_limits(key,count,expires_at) values(p_key,1,now()+interval '1 minute')
 on conflict(key) do update set count=case when rate_limits.expires_at < now() then 1 else rate_limits.count+1 end,
 expires_at=case when rate_limits.expires_at < now() then now()+interval '1 minute' else rate_limits.expires_at end returning count into n;
 return n <= p_limit;
end $$;

create function public.capture_fan(p_artist text,p_request uuid,p_email text,p_language text,p_source text,p_first jsonb,p_last jsonb,p_opt_in boolean,p_fingerprint text)
returns uuid language plpgsql security definer set search_path=public as $$
declare f uuid; prior capture_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from capture_requests where id=p_request;
 if found then
  if prior.fingerprint <> p_fingerprint or prior.artist_id <> p_artist then raise exception 'request_conflict'; end if;
  return prior.fan_id;
 end if;
 insert into fans(artist_id,email_normalized,preferred_language,first_touch_source,first_touch_release_slug,first_touch_utm,last_touch_utm)
 values(p_artist,p_email,p_language,p_source,p_first->>'release',p_first,p_last)
 on conflict(artist_id,email_normalized) do update set last_touch_utm=case when excluded.last_touch_utm='{}'::jsonb then fans.last_touch_utm else excluded.last_touch_utm end,
 first_touch_utm=case when fans.first_touch_utm='{}'::jsonb then excluded.first_touch_utm else fans.first_touch_utm end,
 first_touch_release_slug=coalesce(fans.first_touch_release_slug,excluded.first_touch_release_slug),updated_at=now()
 returning id into f;
 -- Repeated public capture does not change verified profile, revoke consent or reveal ownership.
 insert into capture_requests values(p_request,p_artist,f,p_fingerprint,now());
 insert into fan_events(artist_id,fan_id,event_type,event_id,source,release_slug) values(p_artist,f,'fan_captured','capture:'||p_request,p_source,p_first->>'release');
 if p_opt_in and not coalesce((select status='granted' from consent_records where fan_id=f and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1),false) then
  insert into consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source)
  values(p_artist,f,'email','marketing','pending','2026-10-23',p_source);
 end if;
 if p_source='stay_close' or p_opt_in then
  insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(p_artist,f,'capture','capture:'||p_request,jsonb_build_object('confirm',p_opt_in,'magnet',p_source='stay_close')) on conflict do nothing;
 end if;
 return f;
end $$;

create function public.fulfill_checkout(p_event text,p_type text,p_attempt uuid,p_session text,p_intent text,p_amount integer,p_currency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare a checkout_attempts; p uuid; granted integer;
begin
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

create function public.refund_purchase(p_event text,p_intent text,p_full boolean)
returns void language plpgsql security definer set search_path=public as $$
declare p purchases;
begin
 select * into p from purchases where stripe_payment_intent_id=p_intent for update;
 if not found then raise exception 'purchase_not_ready'; end if; -- Stripe retries out-of-order refund.
 if exists(select 1 from webhook_events where event_id=p_event) then return; end if;
 update purchases set status=case when p_full then 'refunded' else 'partially_refunded' end,refunded_at=now() where id=p.id;
 if p_full then
  update vault_unlocks u set
   purchase_id=coalesce((select p2.id from purchases p2 where p2.fan_id=p.fan_id and p2.artist_id=p.artist_id and p2.vault_item_slug=u.item_slug and p2.id<>p.id and p2.status in ('paid','partially_refunded') order by p2.paid_at desc limit 1),u.purchase_id),
   status=case when exists(select 1 from purchases p2 where p2.fan_id=p.fan_id and p2.artist_id=p.artist_id and p2.vault_item_slug=u.item_slug and p2.id<>p.id and p2.status in ('paid','partially_refunded')) then 'active' else 'revoked' end,
   revoked_at=case when exists(select 1 from purchases p2 where p2.fan_id=p.fan_id and p2.artist_id=p.artist_id and p2.vault_item_slug=u.item_slug and p2.id<>p.id and p2.status in ('paid','partially_refunded')) then null else now() end
  where u.purchase_id=p.id;
 end if;
 insert into webhook_events values(p_event,'charge.refunded',now());
end $$;

create function public.claim_jobs() returns setof delivery_jobs language sql security definer set search_path=public as $$
 update delivery_jobs set status='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes'
 where id in (select id from delivery_jobs where ((status='pending' and available_at<=now()) or (status='processing' and lease_until<now())) and attempts<6 order by available_at for update skip locked limit 10)
 returning *;
$$;
create function public.email_permission(p_fan uuid) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select status='granted' from consent_records where fan_id=p_fan and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1),false)
 and exists(select 1 from fans where id=p_fan and email_verified_at is not null);
$$;
create function public.schedule_reminders() returns void language sql security definer set search_path=public as $$
 insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload)
 select a.artist_id,a.fan_id,'reminder','reminder:'||a.id,jsonb_build_object('attemptId',a.id)
 from checkout_attempts a where a.status='expired' and a.created_at<now()-interval '24 hours' and a.created_at>now()-interval '7 days'
 and email_permission(a.fan_id)
 and not exists(select 1 from purchases p where p.fan_id=a.fan_id and p.paid_at>a.created_at)
 on conflict do nothing;
$$;
create function public.update_email_consent(p_artist text,p_fan uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_status not in ('granted','revoked') then raise exception 'invalid_status'; end if;
 perform 1 from fans where id=p_fan and artist_id=p_artist for update;
 if not found then raise exception 'invalid_fan'; end if;
 insert into consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source,revoked_at)
 values(p_artist,p_fan,'email','marketing',p_status,'2026-10-23','verified_link',case when p_status='revoked' then now() end);
 if p_status='granted' then
  update fans set email_verified_at=coalesce(email_verified_at,now()) where id=p_fan;
  insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key) values(p_artist,p_fan,'welcome','welcome:'||p_fan) on conflict do nothing;
 end if;
 insert into fan_events(artist_id,fan_id,event_type,event_id) values(p_artist,p_fan,'consent_updated',gen_random_uuid()::text);
end $$;

-- No policies = deny all to anon/authenticated. Functions are service-only.
do $$ declare t text; begin
 foreach t in array array['fans','consent_records','fan_events','checkout_attempts','purchases','vault_unlocks','webhook_events','delivery_jobs','rate_limits','capture_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke execute on function public.check_rate(text,integer),
 public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text),
 public.fulfill_checkout(text,text,uuid,text,text,integer,text),
 public.refund_purchase(text,text,boolean), public.claim_jobs(),
 public.email_permission(uuid), public.schedule_reminders(),
 public.update_email_consent(text,uuid,text) from public, anon, authenticated;
grant execute on function public.check_rate(text,integer),
 public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text),
 public.fulfill_checkout(text,text,uuid,text,text,integer,text),
 public.refund_purchase(text,text,boolean), public.claim_jobs(),
 public.email_permission(uuid), public.schedule_reminders(),
 public.update_email_consent(text,uuid,text) to service_role;
insert into storage.buckets(id,name,public) values('vault-private','vault-private',false) on conflict(id) do update set public=false;
-- No storage.objects policies grant direct access to this bucket. Signed URLs are generated server-side.

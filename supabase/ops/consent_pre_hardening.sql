-- Separate operator operation, NOT a migration. See CONSENT_PRE_HARDENING.md.
begin;
set local lock_timeout = '5s';
set local search_path = '';
lock table public.capture_requests,public.consent_records,public.fans,public.fan_events,
 public.checkout_attempts,public.purchases,public.vault_unlocks,public.webhook_events,
 public.delivery_jobs,public.delivery_job_audit,public.rate_limits
 in share update exclusive mode nowait;

do $$
declare f regprocedure; t regclass;
begin
 if exists(select 1 from pg_catalog.pg_roles where rolname='d2c_consent_grant_writer')
  or to_regnamespace('d2c_consent_private') is not null
  or to_regprocedure('public.update_email_consent(text,uuid,text,uuid)') is not null
  or to_regprocedure('public.guard_email_consent_grant()') is not null
  or to_regprocedure('public.prepare_email_revocation()') is not null
  or exists(select 1 from pg_catalog.pg_attribute where attrelid='public.capture_requests'::regclass
   and attname='email_consent_status' and not attisdropped) then
  raise exception 'unexpected_atomic_consent_capability' using errcode='55000';
 end if;
 foreach t in array array['public.capture_requests'::regclass,'public.consent_records'::regclass,
  'public.fans'::regclass,'public.fan_events'::regclass,'public.checkout_attempts'::regclass,
  'public.purchases'::regclass,'public.vault_unlocks'::regclass,'public.webhook_events'::regclass,
  'public.delivery_jobs'::regclass,'public.delivery_job_audit'::regclass,'public.rate_limits'::regclass] loop
  if not exists(select 1 from pg_catalog.pg_class where oid=t and relkind='r' and relrowsecurity
   and relowner=current_user::regrole) then
   raise exception 'unexpected_application_table' using errcode='55000';
  end if;
 end loop;
 foreach f in array array['public.check_rate(text,integer)'::regprocedure,
  'public.email_permission(uuid)'::regprocedure,'public.schedule_reminders()'::regprocedure,
  'public.fulfill_checkout(text,text,uuid,text,text,integer,text)'::regprocedure,
  'public.refund_purchase(text,text,boolean)'::regprocedure,
  'public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text)'::regprocedure,
  'public.update_email_consent(text,uuid,text)'::regprocedure,
  'public.audit_delivery_job()'::regprocedure,'public.guard_email_job()'::regprocedure] loop
  if (select proowner<>current_user::regrole from pg_catalog.pg_proc where oid=f) then
   raise exception 'unexpected_function_owner' using errcode='55000';
  end if;
 end loop;
 -- Reject altered/missing expected callbacks, not just extra trigger names.
 if (select count(*) from pg_catalog.pg_trigger where not tgisinternal
  and tgrelid='public.delivery_jobs'::regclass
  and ((tgname='delivery_job_audit' and tgfoid='public.audit_delivery_job()'::regprocedure and tgtype=21)
   or (tgname='email_job_guard' and tgfoid='public.guard_email_job()'::regprocedure and tgtype=19))
  and tgenabled='O' and tgnargs=0 and tgqual is null and tgattr=''::int2vector
  and tgconstraint=0 and not tgdeferrable and not tginitdeferred)=2 then
  null;
 else
  raise exception 'unexpected_delivery_trigger_definition' using errcode='55000';
 end if;
end $$;

-- GRANT ALL in the core migration included TRIGGER. Protect every application
-- table reachable by the privileged RPCs, including inherited permissions.
revoke trigger on public.consent_records,public.fans,public.capture_requests,
 public.fan_events,public.checkout_attempts,public.purchases,public.vault_unlocks,
 public.webhook_events,public.delivery_jobs,public.delivery_job_audit,public.rate_limits
 from public,anon,authenticated,service_role;
do $$
declare t regclass; r text;
begin
 foreach t in array array['public.consent_records'::regclass,'public.fans'::regclass,
  'public.capture_requests'::regclass,'public.fan_events'::regclass,
  'public.checkout_attempts'::regclass,'public.purchases'::regclass,
  'public.vault_unlocks'::regclass,'public.webhook_events'::regclass,
  'public.delivery_jobs'::regclass,'public.delivery_job_audit'::regclass,
  'public.rate_limits'::regclass] loop
  for r in select rolname from pg_catalog.pg_roles
   where rolname in ('anon','authenticated','service_role','authenticator') loop
   if has_table_privilege(r,t,'TRIGGER') then
    raise exception 'retained_application_trigger_privilege' using errcode='42501';
   end if;
  end loop;
  -- Revocation does not remove triggers installed earlier. Fail closed rather
  -- than retaining an unknown callback or deleting somebody else's object.
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid=t and not tgisinternal
   and not (tgrelid='public.delivery_jobs'::regclass and
    ((tgname='delivery_job_audit' and tgfoid='public.audit_delivery_job()'::regprocedure)
     or (tgname='email_job_guard' and tgfoid='public.guard_email_job()'::regprocedure)))) then
   raise exception 'unexpected_application_trigger' using errcode='55000';
  end if;
 end loop;
end $$;

-- Replace only object resolution in existing RPCs; CREATE OR REPLACE retains
-- their owners, signatures and ACLs. Previously applied migrations stay intact.
create or replace function public.check_rate(p_key text, p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into public.rate_limits(key,count,expires_at) values(p_key,1,now()+interval '1 minute')
 on conflict(key) do update set count=case when rate_limits.expires_at < now() then 1 else rate_limits.count+1 end,
 expires_at=case when rate_limits.expires_at < now() then now()+interval '1 minute' else rate_limits.expires_at end returning count into n;
 return n <= p_limit;
end $$;

create or replace function public.email_permission(p_fan uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select status='granted' from public.consent_records where fan_id=p_fan and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1),false)
 and exists(select 1 from public.fans where id=p_fan and email_verified_at is not null);
$$;
create or replace function public.schedule_reminders() returns void language sql security definer set search_path='' as $$
 insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload)
 select a.artist_id,a.fan_id,'reminder','reminder:'||a.id,jsonb_build_object('attemptId',a.id)
 from public.checkout_attempts a where a.status='expired' and a.created_at<now()-interval '24 hours' and a.created_at>now()-interval '7 days'
 and public.email_permission(a.fan_id)
 and not exists(select 1 from public.purchases p where p.fan_id=a.fan_id and p.paid_at>a.created_at)
 on conflict do nothing;
$$;

create or replace function public.fulfill_checkout(p_event text,p_type text,p_attempt uuid,p_session text,p_intent text,p_amount integer,p_currency text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.checkout_attempts; p uuid; granted integer;
begin
 -- Keep the existing shared fan lock and re-read before payment decisions.
 select * into a from public.checkout_attempts where id=p_attempt;
 if not found then raise exception 'payment_mismatch'; end if;
 perform 1 from public.fans where id=a.fan_id and artist_id=a.artist_id for no key update;
 select * into a from public.checkout_attempts where id=p_attempt for update;
 if not found or a.stripe_session_id is distinct from p_session or a.amount_minor<>p_amount or a.currency<>p_currency then raise exception 'payment_mismatch'; end if;
 if exists(select 1 from public.webhook_events where event_id=p_event) then return (select id from public.purchases where checkout_attempt_id=a.id); end if;
 insert into public.purchases(artist_id,fan_id,checkout_attempt_id,stripe_checkout_session_id,stripe_payment_intent_id,amount_minor,currency,purpose,vault_item_slug,status)
 values(a.artist_id,a.fan_id,a.id,p_session,p_intent,p_amount,p_currency,a.purpose,a.item_slug,'paid') on conflict(checkout_attempt_id) do nothing;
 select id into p from public.purchases where checkout_attempt_id=a.id;
 update public.checkout_attempts set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=a.id;
 -- A later success notification cannot reactivate a refunded purchase.
 if (select status from public.purchases where id=p)='paid' then
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
-- Refund already qualifies every application relation; change only its path.
alter function public.refund_purchase(text,text,boolean) set search_path='';

create or replace function public.audit_delivery_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Check context before reading or serializing any caller-supplied row type.
 if tg_relid<>'public.delivery_jobs'::regclass or tg_name<>'delivery_job_audit'
  or tg_level<>'ROW' or tg_when<>'AFTER' or tg_op not in ('INSERT','UPDATE') or tg_nargs<>0 then
  raise exception 'invalid_delivery_audit_context' using errcode='42501';
 end if;
 insert into public.delivery_job_audit(job_id,action,snapshot)
 values(new.id,case when TG_OP='INSERT' then 'created' else 'updated' end,
 jsonb_build_object('before',case when TG_OP='UPDATE' then to_jsonb(old) else null end,
 'after',to_jsonb(new),'reason',current_setting('phase1.email_audit_reason',true)));
 return new;
end $$;
revoke all on function public.audit_delivery_job(),public.guard_email_job() from public,anon,authenticated,service_role;

create or replace function public.capture_fan(p_artist text,p_request uuid,p_email text,p_language text,p_source text,p_first jsonb,p_last jsonb,p_opt_in boolean,p_fingerprint text)
returns uuid language plpgsql security definer set search_path='' as $$
declare f uuid; prior public.capture_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.capture_requests where id=p_request;
 if found then
  if prior.fingerprint <> p_fingerprint or prior.artist_id <> p_artist then raise exception 'request_conflict'; end if;
  return prior.fan_id;
 end if;
 insert into public.fans(artist_id,email_normalized,preferred_language,first_touch_source,first_touch_release_slug,first_touch_utm,last_touch_utm)
 values(p_artist,p_email,p_language,p_source,p_first->>'release',p_first,p_last)
 on conflict(artist_id,email_normalized) do update set last_touch_utm=case when excluded.last_touch_utm='{}'::jsonb then fans.last_touch_utm else excluded.last_touch_utm end,
 first_touch_utm=case when fans.first_touch_utm='{}'::jsonb then excluded.first_touch_utm else fans.first_touch_utm end,
 first_touch_release_slug=coalesce(fans.first_touch_release_slug,excluded.first_touch_release_slug),updated_at=now()
 returning id into f;
 -- Repeated public capture does not change verified profile, revoke consent or reveal ownership.
 insert into public.capture_requests values(p_request,p_artist,f,p_fingerprint,now());
 insert into public.fan_events(artist_id,fan_id,event_type,event_id,source,release_slug) values(p_artist,f,'fan_captured','capture:'||p_request,p_source,p_first->>'release');
 if p_opt_in and not coalesce((select status='granted' from public.consent_records where fan_id=f and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1),false) then
  insert into public.consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source)
  values(p_artist,f,'email','marketing','pending','2026-10-23',p_source);
 end if;
 if p_source='stay_close' or p_opt_in then
  insert into public.delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload) values(p_artist,f,'capture','capture:'||p_request,jsonb_build_object('confirm',p_opt_in,'magnet',p_source='stay_close')) on conflict do nothing;
 end if;
 return f;
end $$;

-- Keep the legacy unsubscribe contract without introducing the new RPC.
create or replace function public.update_email_consent(p_artist text,p_fan uuid,p_status text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status is distinct from 'revoked' then
  raise exception 'unauthorized' using errcode='42501';
 end if;
 perform 1 from public.fans where id=p_fan and artist_id=p_artist for update;
 if not found then raise exception 'invalid_fan'; end if;
 insert into public.consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source,revoked_at)
 values(p_artist,p_fan,'email','marketing','revoked','2026-10-23','verified_link',now());
 insert into public.fan_events(artist_id,fan_id,event_type,event_id)
 values(p_artist,p_fan,'consent_updated',gen_random_uuid()::text);
end $$;

do $$
declare r text; f regprocedure;
begin
 for r in select rolname from pg_catalog.pg_roles
  where rolname in ('anon','authenticated','service_role','authenticator') loop
  if has_function_privilege(r,'public.audit_delivery_job()','EXECUTE')
   or has_function_privilege(r,'public.guard_email_job()','EXECUTE')
   or pg_has_role(r,current_user,'MEMBER') then
   raise exception 'retained_private_function_privilege' using errcode='42501';
  end if;
 end loop;
 foreach f in array array['public.check_rate(text,integer)'::regprocedure,
  'public.email_permission(uuid)'::regprocedure,'public.schedule_reminders()'::regprocedure,
  'public.fulfill_checkout(text,text,uuid,text,text,integer,text)'::regprocedure,
  'public.refund_purchase(text,text,boolean)'::regprocedure,
  'public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text)'::regprocedure,
  'public.update_email_consent(text,uuid,text)'::regprocedure] loop
  if has_function_privilege('anon',f,'EXECUTE') or has_function_privilege('authenticated',f,'EXECUTE')
   or not has_function_privilege('service_role',f,'EXECUTE') then
   raise exception 'unexpected_application_function_privilege' using errcode='42501';
  end if;
 end loop;
end $$;
commit;

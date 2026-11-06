-- LOCAL PROPOSAL ONLY. Apply to the hosted project only after owner approval.
-- Existing rows get version 0 and cannot enter the new email claim path.
alter table public.delivery_jobs add column email_policy_version smallint not null default 0;
alter table public.delivery_jobs alter column email_policy_version set default 1;
alter table public.delivery_jobs add column first_provider_attempt_at timestamptz;
alter table public.delivery_jobs add column retry_deadline_at timestamptz;
alter table public.delivery_jobs add column email_links_expire_at timestamptz;
alter table public.delivery_jobs add column lease_token uuid;
alter table public.delivery_jobs add column quarantined_at timestamptz;
alter table public.delivery_jobs add column quarantine_reason text;
-- Controlled test jobs have no fan, purchase or consent side effects.
alter table public.delivery_jobs alter column fan_id drop not null;
alter table public.delivery_jobs add constraint delivery_fan_or_owner_test check (
 (fan_id is not null and kind <> 'transactional_test') or
 (fan_id is null and kind = 'transactional_test' and artist_id = 'jona-ferreira')
);
alter table public.delivery_jobs add constraint email_deadline_pair check (
 (first_provider_attempt_at is null and retry_deadline_at is null) or
 (first_provider_attempt_at is not null and retry_deadline_at is not null
  and retry_deadline_at = first_provider_attempt_at + interval '23 hours')
);

create table public.delivery_job_audit (
 id bigint generated always as identity primary key,
 job_id uuid not null references public.delivery_jobs(id),
 occurred_at timestamptz not null default clock_timestamp(),
 action text not null, snapshot jsonb not null
);
alter table public.delivery_job_audit enable row level security;
revoke all on public.delivery_job_audit from public, anon, authenticated, service_role;
grant select on public.delivery_job_audit to service_role;
revoke all on sequence public.delivery_job_audit_id_seq from public,anon,authenticated,service_role;

create function public.audit_delivery_job() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.delivery_job_audit(job_id,action,snapshot)
 values(new.id,case when TG_OP='INSERT' then 'created' else 'updated' end,
 jsonb_build_object('before',case when TG_OP='UPDATE' then to_jsonb(old) else null end,
 'after',to_jsonb(new),'reason',current_setting('phase1.email_audit_reason',true)));
 return new;
end $$;
create trigger delivery_job_audit after insert or update on public.delivery_jobs
for each row execute function public.audit_delivery_job();
insert into public.delivery_job_audit(job_id,action,snapshot)
select id,'migration_snapshot',to_jsonb(j) from public.delivery_jobs j;

create function public.guard_email_job() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.kind <> 'meta' then
  if new.dedupe_key is distinct from old.dedupe_key or new.kind<>old.kind
   or new.artist_id<>old.artist_id or new.fan_id is distinct from old.fan_id
   or new.attempts<old.attempts
   or new.email_policy_version<>old.email_policy_version
   or (old.quarantined_at is not null and (new.quarantined_at is distinct from old.quarantined_at or new.status not in ('failed','skipped')))
   or (old.first_provider_attempt_at is not null and (
    new.first_provider_attempt_at is distinct from old.first_provider_attempt_at
    or new.retry_deadline_at is distinct from old.retry_deadline_at
    or new.email_links_expire_at is distinct from old.email_links_expire_at
    or new.payload->'emailBody' is distinct from old.payload->'emailBody'))
   or (old.status in ('sent','failed','skipped') and new.status<>old.status)
  then raise exception 'immutable_email_lifecycle'; end if;
 end if;
 return new;
end $$;
create trigger email_job_guard before update on public.delivery_jobs
for each row execute function public.guard_email_job();

-- The old deployed worker can no longer claim any email during rollout.
create or replace function public.claim_jobs() returns setof public.delivery_jobs
language sql security definer set search_path='' as $$
 update public.delivery_jobs set status='processing',attempts=attempts+1,lease_until=clock_timestamp()+interval '2 minutes'
 where id in (select id from public.delivery_jobs where kind='meta'
 and ((status='pending' and available_at<=clock_timestamp()) or (status='processing' and lease_until<clock_timestamp()))
 and attempts<6 order by available_at for update skip locked limit 10) returning *;
$$;

create function public.claim_email_jobs(p_job uuid default null,p_marketing boolean default false)
returns setof public.delivery_jobs language plpgsql security definer set search_path='' as $$
begin
 -- Terminal quarantine never resets keys, payloads or timestamps.
 update public.delivery_jobs set status='failed',quarantined_at=clock_timestamp(),
 quarantine_reason=case when attempts>=6 then 'attempt_limit' else 'retry_or_link_deadline' end,
 last_error=case when attempts>=6 then 'attempt_limit' else 'retry_or_link_deadline' end,
 lease_until=null,lease_token=null
 where email_policy_version=1 and kind<>'meta' and quarantined_at is null
 and status in ('pending','processing') and (status='pending' or lease_until<clock_timestamp())
 and (attempts>=6 or retry_deadline_at<=clock_timestamp()+interval '30 seconds'
 or email_links_expire_at<=clock_timestamp()+interval '30 seconds')
 and ((p_job is null and kind<>'transactional_test') or id=p_job);
 return query
 update public.delivery_jobs set status='processing',attempts=attempts+1,
 lease_until=clock_timestamp()+interval '2 minutes',lease_token=gen_random_uuid()
 where id in (
  select id from public.delivery_jobs
  where email_policy_version=1 and quarantined_at is null and kind in ('capture','purchase','recovery','welcome','reminder','transactional_test')
  and ((p_job is null and kind<>'transactional_test') or (id=p_job and kind='transactional_test'))
  and (p_marketing or kind not in ('welcome','reminder')) and attempts<6
  and ((status='pending' and available_at<=clock_timestamp()) or (status='processing' and lease_until<clock_timestamp()))
  and (retry_deadline_at is null or retry_deadline_at>clock_timestamp()+interval '30 seconds')
  order by available_at,id for update skip locked limit case when p_job is null then 10 else 1 end
 ) returning *;
end $$;

create function public.begin_email_dispatch(p_job uuid,p_lease uuid,p_body jsonb,p_links_expire timestamptz,p_marketing boolean default false)
returns setof public.delivery_jobs language plpgsql security definer set search_path='' as $$
declare j public.delivery_jobs; t timestamptz:=clock_timestamp();
begin
 select * into j from public.delivery_jobs where id=p_job for update;
 t:=clock_timestamp();
 if not found or j.status<>'processing' or j.lease_token is distinct from p_lease
  or j.lease_until<=t or j.email_policy_version<>1 or j.quarantined_at is not null then return; end if;
 if j.kind not in ('capture','purchase','recovery','welcome','reminder','transactional_test')
  or (j.kind='capture' and not (coalesce(j.payload->>'magnet','false')='true' or coalesce(j.payload->>'confirm','false')='true'))
 then raise exception 'unsupported_email'; end if;
 if j.kind in ('welcome','reminder') and (not p_marketing or not public.email_permission(j.fan_id)) then
  update public.delivery_jobs set status='skipped',last_error='marketing_permission',lease_until=null,lease_token=null where id=j.id;
  return;
 end if;
 if coalesce(j.retry_deadline_at,t+interval '23 hours')<=t+interval '30 seconds'
  or coalesce(j.email_links_expire_at,p_links_expire)<=t+interval '30 seconds'
 then
  update public.delivery_jobs set status='failed',quarantined_at=t,quarantine_reason='retry_or_link_deadline',last_error='retry_or_link_deadline',lease_until=null,lease_token=null where id=j.id;
  return;
 end if;
 if jsonb_typeof(p_body->'to')<>'array' or jsonb_array_length(p_body->'to')<>1
  or coalesce(p_body->>'subject','')='' or coalesce(p_body->>'text','')='' or p_links_expire is null
 then raise exception 'invalid_email_body'; end if;
 if j.first_provider_attempt_at is not null and (j.payload->'emailBody' is distinct from p_body or j.email_links_expire_at is distinct from p_links_expire) then
  raise exception 'frozen_email_mismatch';
 end if;
 -- Commit this earliest possible send time and frozen bytes BEFORE any HTTP call.
 return query update public.delivery_jobs set
  payload=case when first_provider_attempt_at is null then payload||jsonb_build_object('emailBody',p_body) else payload end,
  first_provider_attempt_at=coalesce(first_provider_attempt_at,t),
  retry_deadline_at=coalesce(retry_deadline_at,t+interval '23 hours'),
  email_links_expire_at=coalesce(email_links_expire_at,p_links_expire)
 where id=j.id returning *;
end $$;

create function public.finish_email_dispatch(p_job uuid,p_lease uuid,p_outcome text,p_provider text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.delivery_jobs; t timestamptz:=clock_timestamp(); terminal boolean;
begin
 if p_outcome not in ('accepted','retry','failed','skipped') then raise exception 'invalid_outcome'; end if;
 select * into j from public.delivery_jobs where id=p_job for update;
 t:=clock_timestamp();
 if not found then return false; end if;
 insert into public.delivery_job_audit(job_id,action,snapshot) values(j.id,'provider_'||p_outcome,
  jsonb_build_object('lease',p_lease,'provider_id',p_provider,'error',p_error,'current_lease',j.lease_token));
 -- A stale worker records its result but cannot clobber the new lease/result.
 if j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=t then return false; end if;
 terminal:=p_outcome='failed' or (p_outcome='retry' and (j.attempts>=6 or j.retry_deadline_at<=t+interval '30 seconds'));
 if p_outcome='accepted' and coalesce(p_provider,'')='' then raise exception 'invalid_receipt'; end if;
 update public.delivery_jobs set
  status=case when p_outcome='accepted' then 'sent' when p_outcome='skipped' then 'skipped' when terminal then 'failed' else 'pending' end,
  provider_id=case when p_outcome='accepted' then p_provider else provider_id end,
  sent_at=case when p_outcome='accepted' then t else sent_at end,
  last_error=p_error,lease_until=null,lease_token=null,
  available_at=t+make_interval(secs=>least(3600,30*power(2,j.attempts))::integer),
  quarantined_at=case when terminal then t else quarantined_at end,
  quarantine_reason=case when terminal then coalesce(p_error,'attempt_or_retry_limit') else quarantine_reason end
 where id=j.id;
 if j.fan_id is not null and p_outcome='accepted' then
  insert into public.fan_events(artist_id,fan_id,event_type,event_id)
  values(j.artist_id,j.fan_id,case when j.kind='capture' and j.payload->>'magnet'='true' then 'lead_magnet_delivered' else 'email_sent' end,'sent:'||j.id)
  on conflict(event_id) do nothing;
 elsif j.fan_id is not null and p_outcome in ('retry','failed') then
  insert into public.fan_events(artist_id,fan_id,event_type,event_id,metadata)
  values(j.artist_id,j.fan_id,'email_delivery_failed','failed:'||j.id||':'||j.attempts,jsonb_build_object('attempt',j.attempts))
  on conflict(event_id) do nothing;
 end if;
 return true;
end $$;

create function public.quarantine_legacy_email_jobs(p_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare j public.delivery_jobs; n integer:=0;
begin
 if cardinality(p_ids)<>6 or (select count(distinct x) from unnest(p_ids) x)<>6 then raise exception 'expected_six_unique_jobs'; end if;
 for j in select * from public.delivery_jobs where id=any(p_ids) order by id for update loop
  if j.email_policy_version<>0 or j.kind not in ('capture','purchase') or j.attempts<>0
   or j.status<>'pending' or j.payload ? 'emailBody' or j.created_at>=timestamptz '2026-10-26 00:00:00+00'
  then raise exception 'historical_snapshot_changed'; end if;
  n:=n+1;
 end loop;
 if n<>6 then raise exception 'historical_snapshot_changed'; end if;
 perform set_config('phase1.email_audit_reason','owner_approved_historical_backlog_quarantine',true);
 update public.delivery_jobs set status='failed',quarantined_at=clock_timestamp(),quarantine_reason='historical_unsent_backlog',last_error='historical_unsent_backlog',lease_until=null,lease_token=null where id=any(p_ids);
 return n;
end $$;

create function public.create_controlled_email_test(p_run uuid,p_recipient text,p_language text)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.delivery_jobs;
begin
 if p_language not in ('en','es') or p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_request'; end if;
 insert into public.delivery_jobs(artist_id,kind,dedupe_key,payload)
 values('jona-ferreira','transactional_test','owner-test:'||p_run,
 jsonb_build_object('recipient',p_recipient,'language',p_language,'ownerRunId',p_run)) on conflict(dedupe_key) do nothing;
 select * into j from public.delivery_jobs where dedupe_key='owner-test:'||p_run;
 if j.kind<>'transactional_test' or j.payload->>'recipient'<>p_recipient or j.payload->>'language'<>p_language then raise exception 'request_conflict'; end if;
 return j.id;
end $$;

revoke execute on function public.audit_delivery_job(),public.guard_email_job(),
 public.claim_email_jobs(uuid,boolean),public.begin_email_dispatch(uuid,uuid,jsonb,timestamptz,boolean),
 public.finish_email_dispatch(uuid,uuid,text,text,text),public.create_controlled_email_test(uuid,text,text),public.quarantine_legacy_email_jobs(uuid[])
 from public,anon,authenticated;
grant execute on function public.claim_email_jobs(uuid,boolean),public.begin_email_dispatch(uuid,uuid,jsonb,timestamptz,boolean),
 public.finish_email_dispatch(uuid,uuid,text,text,text),public.create_controlled_email_test(uuid,text,text),public.quarantine_legacy_email_jobs(uuid[]) to service_role;

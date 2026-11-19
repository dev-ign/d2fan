-- Preserve the existing lease/eligibility rules and ACLs; allow an explicit
-- ordinary job ID to use the same one-row SKIP LOCKED claim as owner tests.
begin;
set local lock_timeout = '5s';
create or replace function public.claim_email_jobs(p_job uuid default null,p_marketing boolean default false)
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
  and ((p_job is null and kind<>'transactional_test') or id=p_job)
  and (p_marketing or kind not in ('welcome','reminder')) and attempts<6
  and ((status='pending' and available_at<=clock_timestamp()) or (status='processing' and lease_until<clock_timestamp()))
  and (retry_deadline_at is null or retry_deadline_at>clock_timestamp()+interval '30 seconds')
  order by available_at,id for update skip locked limit case when p_job is null then 10 else 1 end
 ) returning *;
end $$;
notify pgrst, 'reload schema';
commit;

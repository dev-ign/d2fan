-- Read-only validation after migration, BEFORE quarantine/deployment.
do $$
begin
 if (select count(*) from public.delivery_jobs)<>6 or
    (select count(*) from public.delivery_jobs where email_policy_version=0 and status='pending' and attempts=0 and first_provider_attempt_at is null and retry_deadline_at is null and sent_at is null and provider_id is null)<>6 then
  raise exception 'STOP: historical job snapshot changed';
 end if;
 if position('kind=''meta''' in regexp_replace(pg_get_functiondef('public.claim_jobs()'::regprocedure),'[[:space:]]','','g'))=0 or
    position('email_policy_version=1' in regexp_replace(pg_get_functiondef('public.claim_email_jobs(uuid,boolean)'::regprocedure),'[[:space:]]','','g'))=0 then
  raise exception 'STOP: claim barrier not installed';
 end if;
end $$;
select 'PASS: six legacy jobs excluded; no claim function invoked' as result;

-- Read-only, no recipient values. Run before and after the approved rollout.
-- Hash complete protected records so unchanged counts cannot hide changed data.
select jsonb_build_object(
 'protected',jsonb_build_object(
  'fans',(select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),''))) from public.fans t),
  'consent_records',(select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),''))) from public.consent_records t),
  'purchases',(select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),''))) from public.purchases t),
  'vault_unlocks',(select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),''))) from public.vault_unlocks t),
  'checkout_attempts',(select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by id),''))) from public.checkout_attempts t),
  'webhook_events',(select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by event_id),''))) from public.webhook_events t)
 ),
 'delivery_immutable', (select jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg((to_jsonb(j)-array['status','last_error','lease_until','email_policy_version','first_provider_attempt_at','retry_deadline_at','email_links_expire_at','lease_token','quarantined_at','quarantine_reason'])::text,'|' order by id),''))) from public.delivery_jobs j),
 'delivery_status',(select jsonb_agg(x order by kind,status) from (select kind,status,attempts,count(*) from public.delivery_jobs group by kind,status,attempts)x)
);

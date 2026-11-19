-- psql-only, read-only. First run captures; subsequent runs check that SAME cohort.
-- Keep this dedicated session open, in autocommit, after a confirmed hardening COMMIT.
\if :{?consent_baseline}
\else
\set consent_baseline null
\endif
begin transaction read only;
with
baseline as (select nullif(:'consent_baseline'::jsonb,'null'::jsonb) b),
expected_functions(signature,source_md5,definer) as (values
 ('public.check_rate(text,integer)','39a70aec12aa38d70615e49b51964021',true),
 ('public.email_permission(uuid)','15a06de7b94e85fffe79ea00a81c8242',true),
 ('public.schedule_reminders()','a2c2bf9df4e375c2b139886a12dc2e8e',true),
 ('public.fulfill_checkout(text,text,uuid,text,text,integer,text)','bfd3e87ca2199a760b8eb5d10164ada2',true),
 ('public.refund_purchase(text,text,boolean)','2579b0845bb0b835f5781acf4edf34b6',true),
 ('public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text)','e8330043c76631d5d3e76be39c94e219',true),
 ('public.update_email_consent(text,uuid,text)','f334d7690711459221ae9dc251ceb46b',true),
 ('public.audit_delivery_job()','50a7f130f48aa1c53d6b9201ebfe1f6a',true),
 ('public.guard_email_job()','4a75c493fc43e1a1c500ed1d095bb507',false)
),
tables(oid) as (values
 ('public.capture_requests'::regclass),('public.consent_records'::regclass),
 ('public.fans'::regclass),('public.fan_events'::regclass),('public.checkout_attempts'::regclass),
 ('public.purchases'::regclass),('public.vault_unlocks'::regclass),('public.webhook_events'::regclass),
 ('public.delivery_jobs'::regclass),('public.delivery_job_audit'::regclass),('public.rate_limits'::regclass)
),
roles as (select rolname from pg_catalog.pg_roles
 where rolname in ('anon','authenticated','service_role','authenticator')),
activity as materialized (
 select a.pid,a.backend_start,a.xact_start,a.backend_xid::text xid,a.state,a.backend_type,
  -- bgw_type is server-reported, not application_name. NULL state alone is not safe:
  -- even an unassigned/read-only transaction owns a virtual-XID lock until it ends.
  coalesce(a.backend_type='pg_cron launcher' and a.state is null
   and a.client_addr is null and a.client_port is null and a.wait_event_type='Extension'
   and a.xact_start is null and a.backend_xid is null and a.backend_xmin is null
   and not exists(select 1 from pg_catalog.pg_locks l where l.pid=a.pid
    and l.locktype in ('virtualxid','transactionid')),false) nontransactional_launcher
 from pg_catalog.pg_stat_activity a where a.datid=(select oid from pg_catalog.pg_database
  where datname=current_database()) and a.pid<>pg_backend_pid()
),
checks as (select
 (current_setting('track_activities')='on'
  and ((select rolsuper from pg_catalog.pg_roles where rolname=current_user)
   or pg_has_role(current_user,'pg_read_all_stats','USAGE'))
  and not exists(select 1 from activity where backend_start is null
   or (not nontransactional_launcher and (state is null
    or state not in ('active','idle','idle in transaction','idle in transaction (aborted)','fastpath function call')
    or (state<>'idle' and xact_start is null))))) visibility_complete,
 current_setting('max_prepared_transactions')::integer=0
  and not exists(select 1 from pg_catalog.pg_prepared_xacts) no_prepared,
 not exists(select 1 from pg_catalog.pg_roles where rolname='d2c_consent_grant_writer')
  and to_regnamespace('d2c_consent_private') is null
  and to_regprocedure('public.update_email_consent(text,uuid,text,uuid)') is null
  and to_regprocedure('public.guard_email_consent_grant()') is null
  and to_regprocedure('public.prepare_email_revocation()') is null
  and not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.capture_requests'::regclass
   and attname='email_consent_status' and not attisdropped) capability_absent,
 (select count(*)=9 and bool_and(p.oid is not null and md5(p.prosrc)=e.source_md5
   and p.prosecdef=e.definer and p.proconfig @> array['search_path=""']
   and p.proowner=(select relowner from pg_catalog.pg_class where oid='public.fans'::regclass))
  from expected_functions e left join pg_catalog.pg_proc p on p.oid=to_regprocedure(e.signature))
  and not exists(select 1 from pg_catalog.pg_proc where pronamespace='public'::regnamespace
   and prosecdef and not coalesce(proconfig @> array['search_path=""'],false)) functions_valid,
 (select count(*)=11 and bool_and(c.relkind='r' and c.relrowsecurity
   and c.relowner=(select relowner from pg_catalog.pg_class where oid='public.fans'::regclass))
  from tables t join pg_catalog.pg_class c on c.oid=t.oid)
  and (select count(*)=4 from roles)
  and not exists(select 1 from roles r cross join tables t
   where has_table_privilege(r.rolname,t.oid,'TRIGGER'))
  and not exists(select 1 from roles r where
   pg_has_role(r.rolname,(select relowner from pg_catalog.pg_class where oid='public.fans'::regclass),'MEMBER')
   or has_function_privilege(r.rolname,'public.audit_delivery_job()','EXECUTE')
   or has_function_privilege(r.rolname,'public.guard_email_job()','EXECUTE'))
  and not exists(select 1 from expected_functions e where e.signature not in
   ('public.audit_delivery_job()','public.guard_email_job()') and (
   has_function_privilege('anon',e.signature,'EXECUTE')
   or has_function_privilege('authenticated',e.signature,'EXECUTE')
   or not has_function_privilege('service_role',e.signature,'EXECUTE'))) privileges_valid,
 (select count(*)=2 and bool_and(tgrelid='public.delivery_jobs'::regclass
   and ((tgname='delivery_job_audit' and tgfoid='public.audit_delivery_job()'::regprocedure and tgtype=21)
    or (tgname='email_job_guard' and tgfoid='public.guard_email_job()'::regprocedure and tgtype=19))
   and tgenabled='O' and tgnargs=0 and tgqual is null and tgattr=''::int2vector
   and tgconstraint=0 and not tgdeferrable and not tginitdeferred)
  from pg_catalog.pg_trigger where tgrelid in (select oid from tables) and not tgisinternal) triggers_valid
),
catalog as (select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,
   'definition',md5(pg_get_functiondef(oid))) order by oid)
  from pg_catalog.pg_proc where pronamespace='public'::regnamespace and prokind='f'),
 'tables',(select jsonb_agg(jsonb_build_object('oid',c.oid,'owner',relowner,'acl',relacl,
   'rls',relrowsecurity,'kind',relkind) order by c.oid) from pg_catalog.pg_class c join tables t on c.oid=t.oid),
 'triggers',(select jsonb_agg(jsonb_build_object('oid',oid,'enabled',tgenabled,
   'definition',pg_get_triggerdef(oid)) order by oid)
  from pg_catalog.pg_trigger where tgrelid in (select oid from tables) and not tgisinternal)
 ) value),
current_snapshot as (select jsonb_build_object(
 'database_oid',(select oid from pg_catalog.pg_database where datname=current_database()),
 'server_start',pg_postmaster_start_time(),'watermark',clock_timestamp(),'catalog',catalog.value,
 'cohort',(select coalesce(jsonb_agg(to_jsonb(a) order by pid),'[]'::jsonb)
  from activity a where xact_start is not null)) value from catalog),
remaining as (select o.* from baseline,
 jsonb_to_recordset(coalesce(b->'cohort','[]'::jsonb))
  as o(pid integer,backend_start timestamptz,xact_start timestamptz,xid text)
 join activity a on a.pid=o.pid and a.backend_start=o.backend_start and a.xact_start=o.xact_start
 -- An initially unassigned XID may be assigned later: never use XID inequality to pass.
),
result as (select b,s.value,checks.*,
 coalesce(visibility_complete and no_prepared and capability_absent and functions_valid
  and privileges_valid and triggers_valid,false) ready
 from baseline cross join current_snapshot s cross join checks)
select
 case when b is null and ready then value else b end::text as consent_baseline,
 jsonb_build_object('decision',case
  when not ready then 'NO-GO: prerequisites'
  when b is null then 'CAPTURED: run again in a fresh transaction'
  when b->'database_oid' is distinct from value->'database_oid'
   or b->'server_start' is distinct from value->'server_start'
   or b->'catalog' is distinct from value->'catalog' then 'NO-GO: identity/catalog drift'
  when exists(select 1 from remaining) then 'NO-GO: original transactions remain'
  else 'GO: original cohort drained' end,
  'checks',to_jsonb(result)-array['b','value','ready'],
  'remaining',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from remaining r))::text as consent_result
from result
\gset
commit;
select :'consent_result'::jsonb;

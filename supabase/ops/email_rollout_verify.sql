-- Read-only validation after the exact-six quarantine.
do $$
declare role_name text; signature text;
begin
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20261027202242') then raise exception 'STOP: migration not recorded'; end if;
 if (select count(*) from public.delivery_jobs)<>6 or
    (select count(*) from public.delivery_jobs where email_policy_version=0 and status='failed' and attempts=0 and quarantine_reason='historical_unsent_backlog' and quarantined_at is not null and sent_at is null and provider_id is null and first_provider_attempt_at is null and retry_deadline_at is null)<>6 then raise exception 'STOP: quarantine snapshot mismatch'; end if;
 if (select count(*) from public.delivery_job_audit where action='migration_snapshot')<>6 or
    (select count(*) from public.delivery_job_audit where snapshot->>'reason'='owner_approved_historical_backlog_quarantine')<>6 then raise exception 'STOP: audit snapshots missing'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  if has_table_privilege(role_name,'public.delivery_jobs','SELECT,INSERT,UPDATE,DELETE') or
     has_table_privilege(role_name,'public.delivery_job_audit','SELECT,INSERT,UPDATE,DELETE') or
     has_sequence_privilege(role_name,'public.delivery_job_audit_id_seq','USAGE,SELECT,UPDATE') then raise exception 'STOP: protected delivery data is exposed'; end if;
  foreach signature in array array[
   'public.claim_jobs()', 'public.claim_email_jobs(uuid,boolean)',
   'public.begin_email_dispatch(uuid,uuid,jsonb,timestamp with time zone,boolean)',
   'public.finish_email_dispatch(uuid,uuid,text,text,text)',
   'public.create_controlled_email_test(uuid,text,text)', 'public.quarantine_legacy_email_jobs(uuid[])'
  ] loop
   if has_function_privilege(role_name,signature,'EXECUTE') then raise exception 'STOP: protected RPC is exposed'; end if;
  end loop;
 end loop;
 if has_table_privilege('service_role','public.delivery_job_audit','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'STOP: audit history is writable by service role'; end if;
 if (select count(*) from pg_tables where schemaname='public' and tablename in ('delivery_jobs','delivery_job_audit') and rowsecurity)<>2 then raise exception 'STOP: delivery RLS missing'; end if;
 if to_regnamespace('cron') is not null then raise exception 'STOP: unexpected Cron configuration requires review'; end if;
end $$;
select 'PASS: migration, quarantine, audit, grants, RLS and absent Cron verified; no sending performed' as result;

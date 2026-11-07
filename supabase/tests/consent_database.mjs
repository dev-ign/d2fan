import assert from "node:assert/strict";

const rpcCatalog = (observer) =>
  observer.query(`select jsonb_agg(jsonb_build_object(
  'oid',oid,'owner',proowner,'args',proargnames,'types',proargtypes::text,
  'return',prorettype,'set',proretset,'volatility',provolatile,'acl',proacl) order by oid)
  from pg_proc where oid in ('public.check_rate(text,integer)'::regprocedure,
  'public.email_permission(uuid)'::regprocedure,'public.schedule_reminders()'::regprocedure,
  'public.fulfill_checkout(text,text,uuid,text,text,integer,text)'::regprocedure,
  'public.refund_purchase(text,text,boolean)'::regprocedure,
  'public.capture_fan(text,uuid,text,text,text,jsonb,jsonb,boolean,text)'::regprocedure,
  'public.update_email_consent(text,uuid,text)'::regprocedure)`);

const legacySnapshot = (observer, fan) =>
  observer.query(`select json_build_object(
  'fan',(select to_jsonb(f) from fans f where id='${fan}'),
  'requests',(select jsonb_agg(to_jsonb(r)-'email_consent_status' order by id) from capture_requests r where fan_id='${fan}'),
  'consent',(select jsonb_agg(to_jsonb(c) order by id) from consent_records c where fan_id='${fan}'),
  'events',(select jsonb_agg(to_jsonb(e) order by id) from fan_events e where fan_id='${fan}'),
  'jobs',(select jsonb_agg(to_jsonb(j) order by id) from delivery_jobs j where fan_id='${fan}'),
  'checkouts',(select jsonb_agg(to_jsonb(a) order by id) from checkout_attempts a where fan_id='${fan}'),
  'purchases',(select jsonb_agg(to_jsonb(p) order by id) from purchases p where fan_id='${fan}'),
  'entitlements',(select jsonb_agg(to_jsonb(u) order by id) from vault_unlocks u where fan_id='${fan}'),
  'webhooks',(select jsonb_agg(to_jsonb(w) order by event_id) from webhook_events w
    where event_id in (select 'evt_'||id from checkout_attempts where fan_id='${fan}')),
  'audit',(select jsonb_agg(to_jsonb(a) order by a.id) from delivery_job_audit a join delivery_jobs j on j.id=a.job_id where j.fan_id='${fan}')
)`);

export async function seedConsentMigration(observer) {
  const request = crypto.randomUUID();
  const fan = await observer.query(
    `select capture_fan('jona-ferreira','${request}','${request}@example.invalid','en','support_modal','{}','{}',true,'legacy-consent-test')`,
  );
  await observer.query(
    `select update_email_consent('jona-ferreira','${fan}','granted')`,
  );
  // One synthetic paid entitlement and the existing capture job exercise
  // preservation without calling Stripe, dispatching jobs or adding fixtures.
  const attempt = crypto.randomUUID();
  await observer.query(`insert into checkout_attempts(id,artist_id,fan_id,purpose,item_slug,amount_minor,currency,stripe_session_id)
    values('${attempt}','jona-ferreira','${fan}','vault_unlock','accion-wallpaper',500,'usd','cs_test_${attempt}');
    select fulfill_checkout('evt_${attempt}','checkout.session.completed','${attempt}','cs_test_${attempt}','pi_test_${attempt}',500,'usd');
    update delivery_jobs set status='failed',quarantined_at=clock_timestamp(),quarantine_reason='local_preservation_test'
    where fan_id='${fan}' and kind='capture'`);
  await observer.query(
    "prepare legacy_unsubscribe(text,uuid,text) as select public.update_email_consent($1,$2,$3)",
  );
  return {
    fan,
    request,
    rpcOid: await observer.query(
      "select 'public.update_email_consent(text,uuid,text)'::regprocedure::oid",
    ),
    snapshot: await legacySnapshot(observer, fan),
    rpcCatalog: await rpcCatalog(observer),
  };
}

// Apply the real migration around ordinary legacy transactions and DDL locks.
export async function testConsentMigrationBoundary({
  observer,
  first,
  second,
  migration,
  openClient,
}) {
  const create = async () => {
    const request = crypto.randomUUID();
    return observer.query(
      `select capture_fan('jona-ferreira','${request}','${request}@example.invalid','en','support_modal','{}','{}',true,'cutover-test')`,
    );
  };
  const grant = (fan) =>
    `select update_email_consent('jona-ferreira','${fan}','granted')`;
  const waitFor = async (condition) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if ((await observer.query(`select ${condition}`)) === "t") return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("migration did not reach the expected PostgreSQL lock wait");
  };
  const cleanRollback = async () => {
    assert.equal(
      await observer.query(`select
        not exists(select 1 from pg_roles where rolname='d2c_consent_grant_writer')
        and to_regnamespace('d2c_consent_private') is null
        and to_regprocedure('public.guard_email_consent_grant()') is null
        and to_regprocedure('public.prepare_email_revocation()') is null
        and has_table_privilege('service_role','public.consent_records','TRIGGER')
        and not exists(select 1 from information_schema.columns
          where table_schema='public' and table_name='capture_requests'
          and column_name='email_consent_status')`),
      "t",
    );
  };

  const timeoutFan = await create();
  const original = await observer.query(
    "select pg_get_functiondef('public.update_email_consent(text,uuid,text)'::regprocedure)",
  );
  const body = migration.replace(/^begin;\s*/, "").replace(/commit;\s*$/, "");
  const installer = openClient("service_role");
  await installer.query(`create function pg_temp.consent_callback() returns trigger
    language plpgsql as $$ begin return new; end $$;
    create trigger untrusted_consent_callback before insert on public.fan_events
    for each row execute function pg_temp.consent_callback()`);
  await observer.query(`do $probe$ begin
    ${body}
    raise exception 'migration retained an untrusted callback';
    exception when object_not_in_prerequisite_state then
      if sqlerrm<>'unexpected_application_trigger' then raise; end if;
  end $probe$`);
  await cleanRollback();
  await observer.query(
    "drop trigger untrusted_consent_callback on public.fan_events",
  );
  await installer.close();
  await observer.query(`create role consent_trigger_test;
    grant trigger on public.fans to consent_trigger_test;
    grant consent_trigger_test to service_role`);
  await observer.query(`do $probe$ begin
    ${body}
    raise exception 'migration retained an inherited trigger privilege';
    exception when insufficient_privilege then
      if sqlerrm<>'retained_application_trigger_privilege' then raise; end if;
  end $probe$`);
  await cleanRollback();
  await observer.query(`revoke consent_trigger_test from service_role;
    revoke trigger on public.fans from consent_trigger_test;
    drop role consent_trigger_test`);
  await observer.query(`create role consent_function_test;
    grant execute on function public.audit_delivery_job() to consent_function_test;
    grant consent_function_test to service_role`);
  await observer.query(`do $probe$ begin
    ${body}
    raise exception 'migration retained inherited private function execution';
    exception when insufficient_privilege then
      if sqlerrm<>'retained_private_function_privilege' then raise; end if;
  end $probe$`);
  await cleanRollback();
  await observer.query(`revoke consent_function_test from service_role;
    revoke execute on function public.audit_delivery_job() from consent_function_test;
    drop role consent_function_test`);
  console.log(
    "PASS: migration rejects unknown triggers and inherited table/function privileges with complete rollback",
  );
  // Exercise both required ACCESS EXCLUSIVE locks and the weaker inventory lock.
  // Use the complete migration transaction, not only an exception subtransaction.
  for (const held of [
    "lock table public.capture_requests in access share mode",
    grant(timeoutFan),
    "lock table public.fan_events in share row exclusive mode",
  ]) {
    await first.query("begin");
    await first.query(held);
    const rejected = openClient();
    const started = Date.now();
    await assert.rejects(rejected.query(migration), /could not obtain lock/);
    assert.ok(
      Date.now() - started < 4000,
      "NOWAIT must fail before the 5s timeout",
    );
    await rejected.close();
    await cleanRollback();
    await first.query("rollback");
  }
  assert.equal(
    await observer.query(
      "select pg_get_functiondef('public.update_email_consent(text,uuid,text)'::regprocedure)",
    ),
    original,
  );
  console.log(
    "PASS: migration NOWAIT contention on capture, consent and inventory tables; complete transactional rollback",
  );

  // Payment DML remains compatible with inventory locks while migration changes
  // and catalog definitions remain uncommitted. Roll back the installation here.
  const paymentFan = await create();
  const attempt = crypto.randomUUID();
  await observer.query(`insert into public.checkout_attempts(id,artist_id,fan_id,purpose,amount_minor,currency,stripe_session_id)
    values('${attempt}','jona-ferreira','${paymentFan}','tip',500,'usd','cs_test_${attempt}')`);
  const catalogBefore =
    await observer.query(`select jsonb_agg(to_jsonb(p) order by p.oid)
    from pg_proc p where oid in ('public.fulfill_checkout(text,text,uuid,text,text,integer,text)'::regprocedure,
    'public.audit_delivery_job()'::regprocedure,'public.email_permission(uuid)'::regprocedure)`);
  await first.query("begin");
  await first.query(body);
  await second.query(`select public.fulfill_checkout('evt_${attempt}','checkout.session.completed','${attempt}',
    'cs_test_${attempt}','pi_test_${attempt}',500,'usd')`);
  await first.query("rollback");
  await cleanRollback();
  assert.equal(
    await observer.query(`select jsonb_agg(to_jsonb(p) order by p.oid)
    from pg_proc p where oid in ('public.fulfill_checkout(text,text,uuid,text,text,integer,text)'::regprocedure,
    'public.audit_delivery_job()'::regprocedure,'public.email_permission(uuid)'::regprocedure)`),
    catalogBefore,
  );
  assert.equal(
    await observer.query(
      `select count(*) from public.purchases where checkout_attempt_id='${attempt}'`,
    ),
    "1",
  );
  console.log(
    "PASS: payment fulfillment completes under migration inventory locks; DDL rollback preserves payment and function catalogs",
  );

  const committed = await create(),
    rolledBack = await create(),
    stalled = await create(),
    withdrawn = await create();
  const stalledBefore = await legacySnapshot(observer, stalled);
  // The only instrumentation is an advisory barrier before the old INSERT.
  // The actual original RPC identity/body stays active across replacement.
  const instrumented = original
    .replace(
      "insert into consent_records(",
      `if p_fan='${stalled}'::uuid then
       perform pg_advisory_xact_lock(61106233441);
     end if;
     insert into consent_records(`,
    )
    .replace(
      "perform 1 from fans where id=p_fan and artist_id=p_artist for update;",
      `if p_fan='${withdrawn}'::uuid then
       perform pg_advisory_xact_lock(61106233442);
     end if;
     perform 1 from fans where id=p_fan and artist_id=p_artist for update;`,
    );
  assert.notEqual(instrumented, original);
  await observer.query(instrumented);
  await observer.query("select pg_advisory_lock(61106233441)");
  const active = openClient();
  const activePid = await active.query("select pg_backend_pid()");
  const oldBody = active.query(`do $$ begin
    perform update_email_consent('jona-ferreira','${stalled}','granted');
    raise exception 'old compiled grant crossed the boundary';
    exception when insufficient_privilege then
      if sqlerrm<>'unauthorized_email_consent_grant' then raise; end if;
  end $$`);
  await waitFor(`exists(select 1 from pg_locks
    where pid=${activePid} and locktype='advisory' and not granted)`);
  await observer.query("select pg_advisory_lock(61106233442)");
  const oldUnsubscriber = openClient("service_role");
  const oldUnsubscriberPid = await oldUnsubscriber.query(
    "select pg_backend_pid()",
  );
  const oldWithdrawal = oldUnsubscriber.query(
    `select public.update_email_consent('jona-ferreira','${withdrawn}','revoked')`,
  );
  await waitFor(`exists(select 1 from pg_locks
    where pid=${oldUnsubscriberPid} and locktype='advisory' and not granted)`);
  await first.query("begin");
  await first.query(grant(committed));
  await second.query("begin");
  await second.query(grant(rolledBack));
  await first.query("commit");
  assert.equal(
    await observer.query(
      `select count(*) from consent_records where fan_id='${committed}' and status='granted'`,
    ),
    "1",
  );
  await second.query("rollback");
  await observer.query(migration);
  await observer.query("select pg_advisory_unlock(61106233441)");
  await oldBody;
  assert.equal(await legacySnapshot(observer, stalled), stalledBefore);
  assert.equal(
    await observer.query(
      `select count(*) from consent_records where fan_id='${rolledBack}' and status='granted'`,
    ),
    "0",
  );
  console.log(
    "PASS: fail-fast cutover after legacy DML commit/rollback; pre-boundary grant preserved, rolled-back grant absent",
  );
  console.log(
    "PASS: old compiled RPC resumes after migration commit and is denied with all fan/history/job/audit effects rolled back",
  );
  await active.close();

  // The old unsubscribe started before installation. Both requests and a grant
  // now commit after installation but before that old body reaches its fan lock.
  const email = await observer.query(
    `select email_normalized from public.fans where id='${withdrawn}'`,
  );
  const pendingRequest = crypto.randomUUID(),
    confirmedRequest = crypto.randomUUID();
  for (const request of [pendingRequest, confirmedRequest])
    await observer.query(
      `select public.capture_fan('jona-ferreira','${request}','${email}','en','support_modal','{}','{}',true,'cutover-withdrawal')`,
    );
  assert.equal(
    await observer.query(
      `select public.update_email_consent('jona-ferreira','${withdrawn}','granted','${confirmedRequest}')`,
    ),
    "t",
  );
  await observer.query("select pg_advisory_unlock(61106233442)");
  assert.equal(await oldWithdrawal, "");
  assert.equal(
    await observer.query(
      `select email_consent_status from public.capture_requests where id='${pendingRequest}'`,
    ),
    "revoked",
  );
  assert.equal(
    await observer.query(
      `select public.update_email_consent('jona-ferreira','${withdrawn}','granted','${pendingRequest}')`,
    ),
    "f",
  );
  assert.equal(
    await observer.query(`select public.email_permission('${withdrawn}')`),
    "f",
  );
  assert.equal(
    await observer.query(
      `select status from public.consent_records where fan_id='${withdrawn}'
      order by captured_at desc,id desc limit 1`,
    ),
    "revoked",
  );
  console.log(
    "PASS: in-flight legacy unsubscribe invalidates post-migration authorization and orders withdrawal after a newer committed grant",
  );
  await oldUnsubscriber.close();

  const admin = openClient("refund_test_owner");
  await admin.query(`do $$ begin
    set local session_replication_role=replica;
    begin
      insert into public.consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source)
      values('jona-ferreira','${stalled}','email','marketing','granted','test','verified_link_atomic_v1');
      raise exception 'replica mode bypassed grant guard';
    exception when insufficient_privilege then
      if sqlerrm<>'unauthorized_email_consent_grant' then raise; end if;
    end;
  end $$`);
  console.log(
    "PASS: ENABLE ALWAYS guard rejects direct grants even in replica mode",
  );
  await admin.close();
}

// Uses the existing private, disposable PostgreSQL cluster and real sessions.
export async function testConsentDatabase({
  observer,
  first,
  second,
  service,
  legacy,
}) {
  const artist = "jona-ferreira";
  const capture = (email, request, optIn = true) =>
    `select capture_fan('${artist}','${request}','${email}','en','support_modal','{}','{}',${optIn},'consent-test')`;
  const confirm = (fan, request) =>
    `select update_email_consent('${artist}','${fan}','granted','${request}')`;
  const unsubscribe = (fan) =>
    `select update_email_consent('${artist}','${fan}','revoked')`;
  const setup = async (optIn = true) => {
    const request = crypto.randomUUID();
    const email = `${request}@example.invalid`;
    const fan = await observer.query(capture(email, request, optIn));
    return { request, email, fan };
  };
  const state = async (fan) =>
    JSON.parse(
      await observer.query(`select json_build_object(
        'status',(select status from consent_records where fan_id='${fan}' and channel='email' and purpose='marketing' order by captured_at desc,id desc limit 1),
        'allowed',email_permission('${fan}'),
        'grants',(select count(*) from consent_records where fan_id='${fan}' and status='granted'),
        'revocations',(select count(*) from consent_records where fan_id='${fan}' and status='revoked'),
        'events',(select count(*) from fan_events where fan_id='${fan}' and event_type='consent_updated')
      )`),
    );
  const secondPid = Number(await second.query("select pg_backend_pid()"));
  const blocked = async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (
        (await observer.query(
          `select wait_event_type='Lock' from pg_stat_activity where pid=${secondPid}`,
        )) === "t"
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(
      "consent transaction did not reach a real PostgreSQL lock wait",
    );
  };

  assert.equal(await legacySnapshot(observer, legacy.fan), legacy.snapshot);
  assert.equal(await rpcCatalog(observer), legacy.rpcCatalog);
  assert.equal(
    await observer.query(`select bool_and(coalesce(proconfig @> array['search_path=""'],false))
    from pg_proc where prosecdef and pronamespace in ('public'::regnamespace,'d2c_consent_private'::regnamespace)`),
    "t",
  );
  for (const role of [
    "anon",
    "authenticated",
    "service_role",
    "authenticator",
  ]) {
    assert.equal(
      await observer.query(`select not has_schema_privilege('${role}','d2c_consent_private','USAGE')
      and not pg_has_role('${role}','d2c_consent_grant_writer','MEMBER')
      and not exists(select 1 from pg_proc where oid in (
        'public.audit_delivery_job()'::regprocedure,'public.guard_email_job()'::regprocedure,
        'public.guard_email_consent_grant()'::regprocedure,'public.prepare_email_revocation()'::regprocedure,
        'd2c_consent_private.insert_grant(text,uuid,timestamptz)'::regprocedure)
        and has_function_privilege('${role}',oid,'EXECUTE'))`),
      "t",
    );
  }
  const auditRequest = crypto.randomUUID();
  const auditFan = await service.query(
    capture(`${auditRequest}@example.invalid`, auditRequest),
  );
  await service.query(`update public.delivery_jobs set payload=payload||'{"defensiveAudit":true}'::jsonb
    where fan_id='${auditFan}' and kind='capture'`);
  assert.equal(
    await service.query(`select count(*) from public.delivery_job_audit a
    join public.delivery_jobs j on j.id=a.job_id where j.fan_id='${auditFan}' and (
    (a.action='created' and a.snapshot->'before'='null'::jsonb and a.snapshot#>>'{after,kind}'='capture')
    or (a.action='updated' and a.snapshot#>>'{after,payload,defensiveAudit}'='true'
      and a.snapshot#>'{before,payload,defensiveAudit}' is null))`),
    "2",
  );
  assert.equal(await service.query(confirm(auditFan, auditRequest)), "t");
  const rateKey = `defensive:${crypto.randomUUID()}`;
  assert.equal(
    await service.query(`select public.check_rate('${rateKey}',1)`),
    "t",
  );
  assert.equal(
    await service.query(`select public.check_rate('${rateKey}',1)`),
    "f",
  );
  const reminderAttempt = crypto.randomUUID();
  await service.query(`insert into public.checkout_attempts(id,artist_id,fan_id,purpose,amount_minor,currency,status,created_at)
    values('${reminderAttempt}','${artist}','${auditFan}','tip',500,'usd','expired',clock_timestamp()-interval '2 days');
    select public.schedule_reminders(); select public.schedule_reminders()`);
  assert.equal(
    await service.query(`select count(*) from public.delivery_jobs
    where dedupe_key='reminder:${reminderAttempt}'`),
    "1",
  );
  assert.equal(
    await observer.query(`select count(*) from public.delivery_job_audit a
    join public.delivery_jobs j on j.id=a.job_id where j.fan_id='${auditFan}'
    and j.kind='welcome' and a.action='created'`),
    "1",
  );
  assert.equal(
    await observer.query(`select not has_table_privilege('service_role','public.delivery_job_audit','INSERT,UPDATE,DELETE')
    and exists(select 1 from pg_trigger where tgrelid='public.delivery_jobs'::regclass
      and tgname='delivery_job_audit' and tgfoid='public.audit_delivery_job()'::regprocedure
      and tgtype=21 and tgenabled='O')`),
    "t",
  );
  console.log(
    "PASS: RPC signatures/owners/grants preserved; empty privileged search paths, effective private ACLs and service-role audit integrity",
  );
  assert.equal(
    await observer.query(`select email_permission('${legacy.fan}')`),
    "t",
  );
  assert.equal(
    await observer.query(
      `select email_consent_status is null from capture_requests where id='${legacy.request}'`,
    ),
    "t",
  );
  assert.equal(
    await observer.query(
      "select 'public.update_email_consent(text,uuid,text)'::regprocedure::oid",
    ),
    legacy.rpcOid,
  );
  assert.equal(
    await observer.query(
      "select pronargdefaults from pg_proc where oid='public.update_email_consent(text,uuid,text,uuid)'::regprocedure",
    ),
    "0",
  );
  console.log(
    "PASS: migration preserves legacy grants, records, jobs/audit and cached unsubscribe function identity",
  );

  await service.query("begin");
  await service.query(`update consent_records set consent_text_version=consent_text_version
    where fan_id='${legacy.fan}' and status='granted'`);
  await service.query(`update consent_records set consent_text_version='metadata-maintenance',capture_source='metadata-maintenance'
    where fan_id='${legacy.fan}' and status='granted'`);
  await service.query(`insert into consent_records
    select * from consent_records where fan_id='${legacy.fan}' and status='granted'
    on conflict(id) do update set consent_text_version='upsert-maintenance'`);
  await service.query(`update consent_records set status='revoked',revoked_at=clock_timestamp()
    where fan_id='${legacy.fan}' and status='granted'`);
  await service.query("rollback");
  assert.equal(await legacySnapshot(observer, legacy.fan), legacy.snapshot);
  console.log(
    "PASS: historical no-op, metadata-only UPDATE/UPSERT and granted-to-revoked updates; full snapshot preserved after rollback",
  );

  const spoof = await setup();
  const pendingId = await observer.query(
    `select id from consent_records where fan_id='${spoof.fan}' and status='pending'`,
  );
  const insert = (status, id = crypto.randomUUID()) =>
    `insert into public.consent_records(id,artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source)
    values('${id}','jona-ferreira','${spoof.fan}','email','marketing',${status},'test','verified_link_atomic_v1')`;
  const attacks = [
    insert("'granted'"),
    `update consent_records set status='granted',capture_source='verified_link_atomic_v1' where id='${pendingId}'`,
    `${insert("'pending'", pendingId)} on conflict(id) do update set status='granted'`,
    `${insert("'granted'", pendingId)} on conflict(id) do update set status='granted'`,
    `update consent_records set captured_at=captured_at+interval '1 second' where fan_id='${legacy.fan}' and status='granted'`,
    `update consent_records set fan_id='${spoof.fan}' where fan_id='${legacy.fan}' and status='granted'`,
    "select d2c_consent_private.insert_grant('jona-ferreira',gen_random_uuid(),clock_timestamp())",
    "set role d2c_consent_grant_writer",
    "set session authorization d2c_consent_grant_writer",
    "select set_config('role','d2c_consent_grant_writer',true)",
    "set session_replication_role=replica",
    "alter table public.consent_records disable trigger email_consent_grant_guard",
  ];
  for (const attack of attacks) {
    await service.query(`do $$ begin
      begin
        ${attack};
        raise exception 'unauthorized grant capability was accepted';
      exception when insufficient_privilege then null; end;
    end $$`);
  }
  await service.query(`do $$ begin
    perform set_config('d2c.consent_authorized','true',true);
    begin
      ${insert("'granted'")};
      raise exception 'caller-controlled setting authorized a grant';
    exception when insufficient_privilege then
      if sqlerrm<>'unauthorized_email_consent_grant' then raise; end if;
    end;
    begin
      ${insert("null")};
      raise exception 'NULL status bypassed constraints';
    exception when not_null_violation then null; end;
  end $$`);
  assert.equal((await state(spoof.fan)).grants, 0);
  assert.deepEqual(
    JSON.parse(
      await observer.query(`select json_build_object(
      'always',(select tgenabled='A' from pg_trigger where tgname='email_consent_grant_guard'),
      'revocation_always',(select tgenabled='A' from pg_trigger where tgname='email_confirmation_revocation'),
      'invoker',(select not prosecdef from pg_proc where oid='public.guard_email_consent_grant()'::regprocedure),
      'no_api_triggers',(select bool_and(not has_table_privilege('service_role',oid,'TRIGGER'))
        from pg_class where relnamespace='public'::regnamespace and relkind='r'),
      'no_api_membership',not pg_has_role('service_role','d2c_consent_grant_writer','MEMBER'),
      'no_owner_set',not pg_has_role(current_user,'d2c_consent_grant_writer','SET'),
      'no_owner_inherit',not pg_has_role(current_user,'d2c_consent_grant_writer','USAGE'),
      'helper_private',not has_schema_privilege('service_role','d2c_consent_private','USAGE')
        and not has_function_privilege('service_role','d2c_consent_private.insert_grant(text,uuid,timestamptz)','EXECUTE'),
      'service_rpc_access',has_function_privilege('service_role','public.update_email_consent(text,uuid,text)','EXECUTE')
        and has_function_privilege('service_role','public.update_email_consent(text,uuid,text,uuid)','EXECUTE'),
      'public_denied',not has_function_privilege('anon','public.update_email_consent(text,uuid,text)','EXECUTE')
        and not has_function_privilege('authenticated','public.update_email_consent(text,uuid,text,uuid)','EXECUTE'),
      'writer_insert_only',has_table_privilege('d2c_consent_grant_writer','public.consent_records','INSERT')
        and not has_table_privilege('d2c_consent_grant_writer','public.consent_records','SELECT,UPDATE,DELETE'),
      'no_role_powers',(select not rolcanlogin and not rolsuper and not rolcreaterole and not rolbypassrls
        from pg_roles where rolname='d2c_consent_grant_writer'))`),
    ),
    {
      always: true,
      revocation_always: true,
      invoker: true,
      no_api_triggers: true,
      no_api_membership: true,
      no_owner_set: true,
      no_owner_inherit: true,
      helper_private: true,
      service_rpc_access: true,
      public_denied: true,
      writer_insert_only: true,
      no_role_powers: true,
    },
  );
  console.log(
    "PASS: legacy insert/transition, UPSERT, marker/GUC spoofing, helper access, role switching, identity/order changes and NULL denial",
  );
  console.log(
    "PASS: effective application TRIGGER rights revoked; no privilege-borrowing callbacks executed",
  );

  const current = await setup();
  assert.equal((await state(current.fan)).status, "pending");
  assert.equal((await state(current.fan)).allowed, false);
  await observer.query("set role service_role");
  assert.equal(
    await observer.query(confirm(current.fan, current.request)),
    "t",
  );
  await observer.query("reset role");
  assert.deepEqual(await state(current.fan), {
    status: "granted",
    allowed: true,
    grants: 1,
    revocations: 0,
    events: 1,
  });
  const granted = await state(current.fan);
  assert.equal(
    await observer.query(confirm(current.fan, current.request)),
    "f",
  );
  assert.deepEqual(await state(current.fan), granted);
  assert.equal((await state(spoof.fan)).grants, 0);
  console.log("PASS: current confirmation and single-use replay denial");

  assert.equal(
    await observer.query(
      `execute legacy_unsubscribe('${artist}','${current.fan}','revoked')`,
    ),
    "",
  );
  const revoked = await state(current.fan);
  assert.deepEqual(revoked, {
    status: "revoked",
    allowed: false,
    grants: 1,
    revocations: 1,
    events: 2,
  });
  assert.equal(await observer.query(unsubscribe(current.fan)), "");
  assert.deepEqual(await state(current.fan), revoked);
  assert.equal(
    await observer.query(confirm(current.fan, current.request)),
    "f",
  );
  const newRequest = crypto.randomUUID();
  await observer.query(capture(current.email, newRequest));
  assert.equal((await state(current.fan)).allowed, false);
  assert.equal(
    await observer.query(confirm(current.fan, current.request)),
    "f",
  );
  assert.equal(await observer.query(confirm(current.fan, newRequest)), "t");
  assert.equal((await state(current.fan)).allowed, true);
  console.log("PASS: unsubscribe audit/idempotency and explicit new opt-in");

  const historicalRevocation = await setup();
  await observer.query(unsubscribe(historicalRevocation.fan));
  const maintenanceRequest = crypto.randomUUID();
  await observer.query(capture(historicalRevocation.email, maintenanceRequest));
  const revokedRow = await observer.query(
    `select id from consent_records where fan_id='${historicalRevocation.fan}' and status='revoked'`,
  );
  const beforeMaintenance = await legacySnapshot(
    observer,
    historicalRevocation.fan,
  );
  await service.query("begin");
  await service.query(`update consent_records set consent_text_version='revoked-maintenance'
    where id='${revokedRow}';
    insert into consent_records select * from consent_records where id='${revokedRow}'
    on conflict(id) do update set consent_text_version='revoked-upsert-maintenance'`);
  assert.equal(
    await service.query(
      `select email_consent_status from capture_requests where id='${maintenanceRequest}'`,
    ),
    "pending",
  );
  await service.query("rollback");
  assert.equal(
    await legacySnapshot(observer, historicalRevocation.fan),
    beforeMaintenance,
  );
  console.log(
    "PASS: revoked-row metadata UPDATE/UPSERT does not withdraw a subsequent explicit opt-in",
  );

  const stale = await setup();
  await observer.query(unsubscribe(stale.fan));
  assert.equal(await observer.query(confirm(stale.fan, stale.request)), "f");
  // Retrying a public capture must not rearm an invalidated authorization.
  assert.equal(
    await observer.query(capture(stale.email, stale.request)),
    stale.fan,
  );
  assert.equal(await observer.query(confirm(stale.fan, stale.request)), "f");
  assert.equal((await state(stale.fan)).allowed, false);
  assert.equal(
    await observer.query(
      `select email_consent_status from capture_requests where id='${stale.request}'`,
    ),
    "revoked",
  );
  const noOptIn = await setup(false);
  assert.equal(
    await observer.query(confirm(noOptIn.fan, noOptIn.request)),
    "f",
  );
  await observer.query(unsubscribe(noOptIn.fan));
  assert.equal((await state(noOptIn.fan)).status, "revoked");
  const expired = await setup();
  await observer.query(
    `update capture_requests set created_at=clock_timestamp()-interval '48 hours' where id='${expired.request}'`,
  );
  assert.equal(
    await observer.query(confirm(expired.fan, expired.request)),
    "f",
  );
  assert.equal((await state(expired.fan)).grants, 0);
  console.log(
    "PASS: stale, non-opt-in and expired authorization denial; empty consent history",
  );

  const other = await setup();
  const authorizedFan = await setup();
  assert.equal(
    await observer.query(confirm(other.fan, authorizedFan.request)),
    "f",
  );
  assert.equal(
    await observer.query(confirm(other.fan, crypto.randomUUID())),
    "f",
  );
  assert.equal(
    await observer.query(
      `select update_email_consent('other-artist','${other.fan}','granted','${other.request}')`,
    ),
    "f",
  );
  await observer.query(`do $$ begin
    set local role service_role;
    begin
      perform public.update_email_consent('${artist}','${other.fan}','granted');
      raise exception 'legacy grant path was executable';
    exception when insufficient_privilege then null; end;
    reset role;
  end $$`);
  assert.equal(
    await observer.query(
      `select update_email_consent('${artist}','${other.fan}','granted',null::uuid)`,
    ),
    "f",
  );
  assert.equal(
    await observer.query(
      `select update_email_consent('${artist}','${crypto.randomUUID()}','revoked',null::uuid)`,
    ),
    "f",
  );
  for (const role of ["anon", "authenticated"]) {
    await observer.query(`do $$ begin
      set local role ${role};
      begin
        perform public.update_email_consent('${artist}','${other.fan}','granted','${other.request}');
        raise exception 'unauthorized RPC was executable';
      exception when insufficient_privilege then null; end;
      begin
        perform public.update_email_consent('${artist}','${other.fan}','revoked');
        raise exception 'legacy RPC was anonymously executable';
      exception when insufficient_privilege then null; end;
      begin
        update public.capture_requests set email_consent_status='pending' where id='${stale.request}';
        raise exception 'authorization records were writable';
      exception when insufficient_privilege then null; end;
      reset role;
    end $$`);
  }
  assert.equal((await state(other.fan)).grants, 0);
  assert.equal(
    await observer.query(confirm(authorizedFan.fan, authorizedFan.request)),
    "t",
  );
  console.log(
    "PASS: artist/fan/request binding, missing subjects and anonymous/authenticated denial",
  );

  // Start the waiting transaction first to exercise transaction-start timestamp
  // inversion as well as real row-lock serialization in both operation orders.
  for (const confirmFirst of [true, false]) {
    const subject = await setup();
    await second.query("begin");
    await first.query("begin");
    await first.query(
      confirmFirst
        ? confirm(subject.fan, subject.request)
        : unsubscribe(subject.fan),
    );
    const waiting = second.query(
      confirmFirst
        ? unsubscribe(subject.fan)
        : confirm(subject.fan, subject.request),
    );
    await blocked();
    await first.query("commit");
    assert.equal(await waiting, confirmFirst ? "" : "f");
    await second.query("commit");
    const result = await state(subject.fan);
    assert.equal(result.allowed, false);
    assert.equal(result.status, "revoked");
    assert.equal(result.grants, confirmFirst ? 1 : 0);
    assert.equal(result.revocations, 1);
  }
  console.log(
    "PASS: real overlapping confirmation/unsubscribe in both lock orders",
  );

  const duplicate = await setup();
  await first.query("begin");
  await first.query(confirm(duplicate.fan, duplicate.request));
  const replay = second.query(confirm(duplicate.fan, duplicate.request));
  await blocked();
  await first.query("commit");
  assert.equal(await replay, "f");
  assert.equal((await state(duplicate.fan)).events, 1);

  for (const legacyWrite of [false, true]) {
    const rollback = await setup();
    await first.query("begin");
    await first.query(
      legacyWrite
        ? `insert into public.consent_records(artist_id,fan_id,channel,purpose,status,consent_text_version,capture_source)
          values('${artist}','${rollback.fan}','email','marketing','revoked','test','legacy-withdrawal')`
        : unsubscribe(rollback.fan),
    );
    const afterRollback = second.query(confirm(rollback.fan, rollback.request));
    await blocked();
    await first.query("rollback");
    assert.equal(await afterRollback, "t");
    assert.equal((await state(rollback.fan)).revocations, 0);
  }
  console.log(
    "PASS: real concurrent replay and RPC/legacy-row unsubscribe rollback atomicity",
  );

  const initialRequest = crypto.randomUUID(),
    competingRequest = crypto.randomUUID();
  const email = `${initialRequest}@example.invalid`;
  await first.query("begin");
  const firstFan = await first.query(capture(email, initialRequest));
  const competing = second.query(capture(email, competingRequest));
  await blocked();
  await first.query("commit");
  assert.equal(await competing, firstFan);
  assert.equal(
    await observer.query(
      `select count(*) from fans where email_normalized='${email}'`,
    ),
    "1",
  );
  await observer.query(unsubscribe(firstFan));
  assert.equal(await observer.query(confirm(firstFan, initialRequest)), "f");
  assert.equal(await observer.query(confirm(firstFan, competingRequest)), "f");

  const renewedRequest = crypto.randomUUID();
  await first.query("begin");
  await first.query(unsubscribe(firstFan));
  const renewed = second.query(capture(email, renewedRequest));
  await blocked();
  await first.query("commit");
  assert.equal(await renewed, firstFan);
  assert.equal(await observer.query(confirm(firstFan, renewedRequest)), "t");
  assert.equal((await state(firstFan)).allowed, true);
  console.log(
    "PASS: real first-write identity race and new opt-in serialized after unsubscribe",
  );
}

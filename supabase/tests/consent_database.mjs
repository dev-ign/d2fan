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

// Separate staged path: no callback probes or privilege-escalation reproduction.
export async function testConsentPreHardening({
  observer,
  first,
  second,
  monitor,
  cronLauncher = false,
  operation,
  drain,
  legacy,
  openClient,
}) {
  const catalog = () =>
    observer.query(`select jsonb_build_object(
    'functions',(select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where pronamespace='public'::regnamespace),
    'tables',(select jsonb_agg(jsonb_build_array(oid,relname,relowner,relacl) order by oid) from pg_class where relnamespace='public'::regnamespace),
    'triggers',(select jsonb_agg(to_jsonb(t) order by oid) from pg_trigger t where tgrelid in
      (select oid from pg_class where relnamespace='public'::regnamespace)))`);
  const rejected = async (pattern) => {
    const before = await catalog();
    const client = openClient();
    try {
      await assert.rejects(client.query(operation), pattern);
    } finally {
      await client.close();
    }
    assert.equal(
      await catalog(),
      before,
      "failed hardening must roll back definitions and ACLs",
    );
  };
  await observer.query(
    "alter table public.rate_limits rename to missing_rate_limits",
  );
  await rejected(/does not exist/);
  await observer.query(
    "alter table public.missing_rate_limits rename to rate_limits",
  );
  await observer.query(
    "alter table public.delivery_jobs disable trigger delivery_job_audit",
  );
  await rejected(/unexpected_delivery_trigger_definition/);
  await observer.query(
    "alter table public.delivery_jobs enable trigger delivery_job_audit",
  );
  await observer.query(`create trigger unexpected_guard before update on public.delivery_jobs
    for each row execute function public.guard_email_job()`);
  await rejected(/unexpected_application_trigger/);
  await observer.query("drop trigger unexpected_guard on public.delivery_jobs");
  for (const [permission, error] of [
    ["trigger on public.fans", "retained_application_trigger_privilege"],
    [
      "execute on function public.audit_delivery_job()",
      "retained_private_function_privilege",
    ],
  ]) {
    await observer.query(`create role consent_inherited_test;
      grant ${permission} to consent_inherited_test; grant consent_inherited_test to service_role`);
    await rejected(new RegExp(error));
    await observer.query(`revoke consent_inherited_test from service_role;
      revoke ${permission} from consent_inherited_test; drop role consent_inherited_test`);
  }
  await first.query(
    "begin; lock table public.rate_limits in share row exclusive mode",
  );
  const started = Date.now();
  await rejected(/could not obtain lock/);
  assert.ok(
    Date.now() - started < 4000,
    "NOWAIT must fail before the 5s lock timeout",
  );
  await first.query("rollback");
  console.log(
    "PASS: pre-hardening rejects missing/altered/extra inventory, inherited privileges and NOWAIT contention; complete rollback",
  );

  // Ordinary fulfillment must commit while every staged inventory lock is held.
  const request = crypto.randomUUID(),
    attempt = crypto.randomUUID();
  const fan =
    await observer.query(`select public.capture_fan('jona-ferreira','${request}',
    '${request}@example.invalid','en','support_modal','{}','{}',false,'pre-hardening')`);
  await observer.query(`insert into public.checkout_attempts(id,artist_id,fan_id,purpose,amount_minor,currency,stripe_session_id)
    values('${attempt}','jona-ferreira','${fan}','tip',500,'usd','cs_test_${attempt}')`);
  const before = await catalog();
  await first.query("begin");
  await first.query(
    operation.replace(/^.*?begin;/s, "").replace(/commit;\s*$/, ""),
  );
  await second.query(`select public.fulfill_checkout('evt_${attempt}','checkout.session.completed',
    '${attempt}','cs_test_${attempt}','pi_test_${attempt}',500,'usd')`);
  await first.query("rollback");
  assert.equal(await catalog(), before);
  assert.equal(
    await observer.query(
      `select count(*) from public.purchases where checkout_attempt_id='${attempt}'`,
    ),
    "1",
  );
  console.log(
    "PASS: payment DML commits under staged inventory locks; explicit rollback restores all hardening catalogs",
  );

  // Pause an old, harmless function frame before any application-table access.
  const original = await observer.query(
    "select pg_get_functiondef('public.check_rate(text,integer)'::regprocedure)",
  );
  const instrumented = original.replace(
    "begin\n",
    "begin\n perform pg_advisory_xact_lock(61107001);\n",
  );
  assert.notEqual(instrumented, original);
  await observer.query(instrumented);
  await observer.query("select pg_advisory_lock(61107001)");
  await first.query("begin");
  const firstPid = Number(await first.query("select pg_backend_pid()"));
  const active = first.query(
    "select public.check_rate('pre-hardening-old-frame',1)",
  );
  const deadline = Date.now() + 5000;
  while (
    (await observer.query(
      `select exists(select 1 from pg_locks where pid=${firstPid} and locktype='advisory' and not granted)`,
    )) !== "t"
  ) {
    assert.ok(
      Date.now() < deadline,
      "old function did not reach its advisory barrier",
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await second.query("begin; select 1");
  const secondPid = Number(await second.query("select pg_backend_pid()"));
  await observer.query(operation);
  assert.equal(await legacySnapshot(observer, legacy.fan), legacy.snapshot);
  assert.equal(await rpcCatalog(observer), legacy.rpcCatalog);

  const inspect = async (client = monitor) =>
    JSON.parse(await client.query(drain));
  if (cronLauncher) {
    // Real extension process, no cron schema/job and no forged activity row.
    assert.equal(
      await monitor.query(`select count(*) from pg_stat_activity a
      where datid=(select oid from pg_database where datname=current_database())
      and backend_type='pg_cron launcher' and state is null and xact_start is null
      and backend_xid is null and backend_xmin is null and backend_start is not null
      and client_addr is null and client_port is null and wait_event_type='Extension'
      and not exists(select 1 from pg_locks l where l.pid=a.pid
        and l.locktype in ('virtualxid','transactionid'))`),
      "1",
    );
    assert.equal(
      await monitor.query("select to_regnamespace('cron') is null"),
      "t",
    );
    console.log(
      "PASS: real preloaded pg_cron launcher reproduces NULL-state/nontransactional catalog behavior without cron jobs",
    );
  }
  const restricted = await inspect(observer);
  assert.equal(restricted.decision, "NO-GO: prerequisites");
  assert.equal(restricted.checks.visibility_complete, false);
  assert.match((await inspect()).decision, /^CAPTURED/);
  let result = await inspect();
  assert.equal(result.decision, "NO-GO: original transactions remain");
  assert.ok(result.remaining.some((t) => t.pid === firstPid && t.xid === null));
  assert.ok(
    result.remaining.some((t) => t.pid === secondPid && t.xid === null),
  );
  // XID assignment must not make a still-open original transaction disappear.
  await second.query(
    "insert into public.rate_limits values('pre-hardening-xid',1,now())",
  );
  assert.equal(
    (await inspect()).decision,
    "NO-GO: original transactions remain",
  );
  await observer.query("select pg_advisory_unlock(61107001)");
  assert.equal(
    await active,
    "t",
    "old compiled frame completes after its replacement commits",
  );
  assert.equal(
    (await inspect()).decision,
    "NO-GO: original transactions remain",
  );
  await first.query("commit; begin; select 1");
  result = await inspect();
  assert.ok(
    !result.remaining.some((t) => t.pid === firstPid),
    "new transaction on the same backend is not the old cohort member",
  );
  assert.ok(result.remaining.some((t) => t.pid === secondPid));
  await second.query("rollback");
  assert.equal((await inspect()).decision, "GO: original cohort drained");
  await first.query("rollback");

  // Project the observed background metadata onto a real backend. Transaction
  // and lock behavior remain genuine PostgreSQL, including an unassigned XID.
  const baselineHash = await monitor.query("select md5(:'consent_baseline')");
  const inspectRow = async (overrides) => {
    const columns = [
      "datid",
      "pid",
      "backend_start",
      "xact_start",
      "backend_xid",
      "backend_xmin",
      "state",
      "backend_type",
      "client_addr",
      "client_port",
      "wait_event_type",
    ];
    await monitor.query(
      `create or replace temporary view consent_activity as select ${columns
        .map((name) =>
          overrides[name]
            ? `case when a.pid=${firstPid} then ${overrides[name]} else a.${name} end as ${name}`
            : `a.${name}`,
        )
        .join(",")} from pg_catalog.pg_stat_activity a`,
    );
    return JSON.parse(
      await monitor.query(
        drain.replace(
          "pg_catalog.pg_stat_activity",
          "pg_temp.consent_activity",
        ),
      ),
    );
  };
  const quiescentLauncher = {
    backend_type: "'pg_cron launcher'::text",
    state: "null::text",
    xact_start: "null::timestamptz",
    backend_xid: "null::xid",
    backend_xmin: "null::xid",
    client_addr: "null::inet",
    client_port: "null::integer",
    wait_event_type: "'Extension'::text",
  };
  const refused = async (metadata) => {
    const result = await inspectRow(metadata);
    assert.equal(result.decision, "NO-GO: prerequisites");
    assert.equal(result.checks.visibility_complete, false);
  };
  assert.equal(
    (await inspectRow(quiescentLauncher)).decision,
    "GO: original cohort drained",
  );
  await refused({
    ...quiescentLauncher,
    backend_type: "'unreviewed worker'::text",
  });
  // A client-selected label must never become the server's worker classification.
  await first.query("set application_name='pg_cron launcher'");
  await refused({ state: "null::text" });
  await refused({ ...quiescentLauncher, backend_start: "null::timestamptz" });
  await refused({ ...quiescentLauncher, state: "'disabled'::text" });
  await refused({ ...quiescentLauncher, wait_event_type: "null::text" });

  await first.query("begin; select 1");
  assert.equal(
    await monitor.query(`select backend_xid is null and xact_start is not null
    from pg_stat_activity where pid=${firstPid}`),
    "t",
  );
  assert.equal(
    await monitor.query(`select exists(select 1 from pg_locks
    where pid=${firstPid} and locktype='virtualxid' and mode='ExclusiveLock' and granted)`),
    "t",
  );
  await refused({ ...quiescentLauncher, xact_start: undefined });
  // Even if all activity transaction fields look empty, the real VXID vetoes it.
  await refused(quiescentLauncher);
  await refused({ state: "'unrecognized state'::text" });
  await first.query(
    "insert into public.rate_limits values('drain-launcher-xid',1,now())",
  );
  assert.equal(
    await monitor.query(
      `select backend_xid is not null from pg_stat_activity where pid=${firstPid}`,
    ),
    "t",
  );
  await refused({ ...quiescentLauncher, backend_xid: undefined });
  await first.query("rollback");
  assert.equal(
    (await inspectRow(quiescentLauncher)).decision,
    "GO: original cohort drained",
  );
  await monitor.query("drop view pg_temp.consent_activity");

  const hidden = openClient("refund_test_owner");
  await hidden.query("set track_activities=off");
  assert.equal((await inspect()).checks.visibility_complete, false);
  await hidden.query("set track_activities=on");
  await hidden.close();
  await monitor.query("set track_activities=off");
  assert.equal((await inspect()).checks.visibility_complete, false);
  await monitor.query("set track_activities=on");
  assert.equal((await inspect()).decision, "GO: original cohort drained");
  assert.equal(
    await monitor.query("select md5(:'consent_baseline')"),
    baselineHash,
    "repeated inspections must preserve the original cohort, including on NO-GO",
  );
  console.log(
    "PASS: narrow launcher exception; real open/VXID/XID transactions, unknown/hidden/disabled activity and tracking failure refuse GO; read-only cohort preserved",
  );

  await observer.query(
    "alter function public.check_rate(text,integer) cost 101",
  );
  assert.equal((await inspect()).decision, "NO-GO: identity/catalog drift");
  await observer.query(
    "alter function public.check_rate(text,integer) cost 100",
  );
  assert.equal((await inspect()).decision, "GO: original cohort drained");
  console.log(
    "PASS: old active frame and idle transaction detected; incomplete visibility, assigned XID and catalog drift refuse GO; same-backend new transaction accepted after drain",
  );

  const service = openClient("service_role");
  const fresh = crypto.randomUUID();
  const capture = `select public.capture_fan('jona-ferreira','${fresh}',
    '${fresh}@example.invalid','en','stay_close','{}','{}',true,'pre-hardening')`;
  const captured = await service.query(capture);
  assert.equal(await service.query(capture), captured);
  assert.equal(
    await service.query(
      `select status from public.consent_records where fan_id='${captured}'`,
    ),
    "pending",
  );
  await service.query(`do $$ begin
    perform public.update_email_consent('jona-ferreira','${captured}','granted');
    raise exception 'legacy grant unexpectedly accepted';
    exception when insufficient_privilege then
      if sqlerrm<>'unauthorized' then raise; end if;
  end $$`);
  assert.equal(
    await service.query(
      `select public.update_email_consent('jona-ferreira','${captured}','revoked')`,
    ),
    "",
  );
  assert.equal(
    await service.query(`select public.email_permission('${captured}')`),
    "f",
  );
  assert.equal(
    await service.query(`select count(*) from public.delivery_job_audit a
    join public.delivery_jobs j on j.id=a.job_id where j.fan_id='${captured}' and a.action='created'`),
    "1",
  );
  assert.equal(await legacySnapshot(observer, legacy.fan), legacy.snapshot);
  await service.close();
  assert.equal((await inspect()).decision, "GO: original cohort drained");
  console.log(
    "PASS: hardened legacy capture/replay, revoke-only RPC, normal audit and historical payment/entitlement preservation; no new consent capability",
  );
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

  const retryRequest = crypto.randomUUID();
  const retryEmail = `${retryRequest}@example.invalid`;
  await first.query("begin");
  const retryFan = await first.query(capture(retryEmail, retryRequest));
  const repeatedCapture = second.query(capture(retryEmail, retryRequest));
  await blocked();
  await first.query("commit");
  assert.equal(await repeatedCapture, retryFan);
  assert.deepEqual(
    JSON.parse(
      await observer.query(`select jsonb_build_array(
        (select count(*) from fans where email_normalized='${retryEmail}'),
        (select count(*) from capture_requests where id='${retryRequest}'),
        (select count(*) from fan_events where event_id='capture:${retryRequest}'),
        (select count(*) from consent_records where fan_id='${retryFan}' and status='pending'),
        (select count(*) from delivery_jobs where dedupe_key='capture:${retryRequest}'))`),
    ),
    [1, 1, 1, 1, 1],
  );
  console.log(
    "PASS: concurrent identical capture retries preserve one fan, request, event, pending consent and job",
  );

  const independentFirst = await setup();
  const independentSecond = await setup();
  await first.query("begin");
  assert.equal(
    await first.query(confirm(independentFirst.fan, independentFirst.request)),
    "t",
  );
  assert.equal(
    await second.query(
      confirm(independentSecond.fan, independentSecond.request),
    ),
    "t",
  );
  await first.query("rollback");
  assert.equal((await state(independentFirst.fan)).allowed, false);
  assert.equal((await state(independentSecond.fan)).allowed, true);
  console.log(
    "PASS: separate-fan confirmation commits before the other fan transaction ends; rollback stays isolated",
  );
}

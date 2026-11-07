import assert from "node:assert/strict";

const legacySnapshot = (observer, fan) =>
  observer.query(`select json_build_object(
  'fan',(select to_jsonb(f) from fans f where id='${fan}'),
  'requests',(select jsonb_agg(to_jsonb(r)-'email_consent_status' order by id) from capture_requests r where fan_id='${fan}'),
  'consent',(select jsonb_agg(to_jsonb(c) order by id) from consent_records c where fan_id='${fan}'),
  'events',(select jsonb_agg(to_jsonb(e) order by id) from fan_events e where fan_id='${fan}'),
  'jobs',(select jsonb_agg(to_jsonb(j) order by id) from delivery_jobs j where fan_id='${fan}'),
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
  };
}

// Uses the existing private, disposable PostgreSQL cluster and three real sessions.
export async function testConsentDatabase({ observer, first, second, legacy }) {
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

  const rollback = await setup();
  await first.query("begin");
  await first.query(unsubscribe(rollback.fan));
  const afterRollback = second.query(confirm(rollback.fan, rollback.request));
  await blocked();
  await first.query("rollback");
  assert.equal(await afterRollback, "t");
  assert.equal((await state(rollback.fan)).revocations, 0);
  console.log(
    "PASS: real concurrent replay and unsubscribe rollback atomicity",
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

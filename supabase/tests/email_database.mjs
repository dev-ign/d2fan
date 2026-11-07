import assert from "node:assert/strict";
const body = {
  from: "Jona <music@jonaferreira.com>",
  to: ["owner@example.com"],
  reply_to: "support@example.com",
  subject: "Requested test",
  text: "Requested download only",
};

export async function testEmailDatabase(db) {
  const q = (sql, args = []) => db.query(sql, args);
  const row = async (sql, args = []) => (await q(sql, args)).rows[0];
  const newTest = async () =>
    (
      await row(
        "select create_controlled_email_test($1,'owner@example.com','en') id",
        [crypto.randomUUID()],
      )
    ).id;
  const claim = async (id) =>
    (await q("select * from claim_email_jobs($1,false)", [id])).rows[0];
  const begin = (
    job,
    outgoing = body,
    expires = new Date(Date.now() + 172800000).toISOString(),
  ) =>
    q("select * from begin_email_dispatch($1,$2,$3,$4,false)", [
      job.id,
      job.lease_token,
      outgoing,
      expires,
    ]);
  const finish = (job, outcome, provider = null) =>
    q("select finish_email_dispatch($1,$2,$3,$4,'test_outcome') ok", [
      job.id,
      job.lease_token,
      outcome,
      provider,
    ]);
  const fan = (
    await row(
      "insert into fans(artist_id,email_normalized,first_touch_source) values('jona-ferreira','email-tests@example.com','stay_close') returning id",
    )
  ).id;
  const legacy = [];
  for (let n = 0; n < 6; n++) {
    legacy.push(
      (
        await row(
          "insert into delivery_jobs(artist_id,fan_id,kind,dedupe_key,payload,email_policy_version,created_at) values('jona-ferreira',$1,'capture',$2,'{\"magnet\":true}',0,'2026-10-23') returning id",
          [fan, `legacy:${crypto.randomUUID()}`],
        )
      ).id,
    );
  }
  await q("select claim_email_jobs(null,false)");
  assert.equal(
    (
      await row(
        "select count(*)::int n from delivery_jobs where id=any($1::uuid[]) and status='pending' and attempts=0",
        [legacy],
      )
    ).n,
    6,
  );
  assert.equal(
    (await row("select quarantine_legacy_email_jobs($1::uuid[]) n", [legacy]))
      .n,
    6,
  );
  assert.equal(
    (
      await row(
        "select count(*)::int n from delivery_jobs where id=any($1::uuid[]) and status='failed' and quarantined_at is not null and sent_at is null",
        [legacy],
      )
    ).n,
    6,
  );
  assert.equal(
    (
      await row(
        "select count(*)::int n from delivery_job_audit where job_id=any($1::uuid[]) and action='updated'",
        [legacy],
      )
    ).n,
    6,
  );
  await assert.rejects(
    q("select quarantine_legacy_email_jobs($1::uuid[])", [legacy]),
  );
  await assert.rejects(
    q(
      "update delivery_jobs set status='pending',quarantined_at=null where id=$1",
      [legacy[0]],
    ),
  );

  const id = await newTest();
  const a = await claim(id);
  assert.equal(
    (await q("select * from claim_email_jobs($1,false)", [id])).rows.length,
    0,
  );
  const dispatched = (await begin(a)).rows[0];
  assert.ok(dispatched.first_provider_attempt_at);
  assert.equal(
    new Date(dispatched.retry_deadline_at) -
      new Date(dispatched.first_provider_attempt_at),
    23 * 3600000,
  );
  const original = JSON.stringify(dispatched.payload.emailBody);
  await assert.rejects(
    q(
      "update delivery_jobs set first_provider_attempt_at=first_provider_attempt_at-interval '1 second' where id=$1",
      [id],
    ),
  );
  await assert.rejects(
    q(
      "update delivery_jobs set retry_deadline_at=now()+interval '24 hours' where id=$1",
      [id],
    ),
  );
  await assert.rejects(
    q(
      "update delivery_jobs set payload=jsonb_set(payload,'{emailBody,text}','\"changed\"') where id=$1",
      [id],
    ),
  );
  await assert.rejects(
    q("update delivery_jobs set dedupe_key='different' where id=$1", [id]),
  );
  await finish(a, "retry");
  await q(
    "update delivery_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",
    [id],
  );
  const b = await claim(id);
  assert.notEqual(b.lease_token, a.lease_token);
  assert.equal(JSON.stringify(b.payload.emailBody), original);
  assert.equal(
    new Date(b.first_provider_attempt_at).getTime(),
    new Date(dispatched.first_provider_attempt_at).getTime(),
  );
  assert.equal((await finish(a, "failed")).rows[0].ok, false);
  assert.equal(
    (await row("select status from delivery_jobs where id=$1", [id])).status,
    "processing",
  );
  await assert.rejects(
    begin(b, { ...body, text: "changed" }, dispatched.email_links_expire_at),
  );
  const again = (await begin(b, body, dispatched.email_links_expire_at))
    .rows[0];
  assert.equal(
    new Date(again.retry_deadline_at).getTime(),
    new Date(dispatched.retry_deadline_at).getTime(),
  );
  await finish(b, "accepted", "provider-accepted-id");
  assert.equal(
    (
      await row("select status,provider_id from delivery_jobs where id=$1", [
        id,
      ])
    ).status,
    "sent",
  );
  assert.equal((await finish(b, "retry")).rows[0].ok, false);
  await assert.rejects(
    q("update delivery_jobs set status='pending' where id=$1", [id]),
  );
  assert.ok(
    (
      await row(
        "select count(*)::int n from delivery_job_audit where job_id=$1",
        [id],
      )
    ).n >= 8,
  );

  for (const interval of [
    "23 hours",
    "24 hours",
    "22 hours 59 minutes 40 seconds",
  ]) {
    const expired = (
      await row(
        `insert into delivery_jobs(artist_id,kind,dedupe_key,payload,first_provider_attempt_at,retry_deadline_at,email_links_expire_at) values('jona-ferreira','transactional_test',$1,$2,statement_timestamp()-interval '${interval}',statement_timestamp()-interval '${interval}'+interval '23 hours',statement_timestamp()+interval '1 hour') returning id`,
        [
          `owner-test:${crypto.randomUUID()}`,
          { recipient: "owner@example.com", language: "en", emailBody: body },
        ],
      )
    ).id;
    assert.equal(await claim(expired), undefined);
    const end = await row(
      "select status,quarantined_at from delivery_jobs where id=$1",
      [expired],
    );
    assert.equal(end.status, "failed");
    assert.ok(end.quarantined_at);
  }
  const expiredLink = (
    await row(
      "insert into delivery_jobs(artist_id,kind,dedupe_key,payload,email_links_expire_at) values('jona-ferreira','transactional_test',$1,$2,clock_timestamp()-interval '1 second') returning id",
      [
        `owner-test:${crypto.randomUUID()}`,
        { recipient: "owner@example.com", language: "en" },
      ],
    )
  ).id;
  assert.equal(await claim(expiredLink), undefined);
  const limit = await newTest();
  await q("update delivery_jobs set attempts=6 where id=$1", [limit]);
  assert.equal(await claim(limit), undefined);
  assert.equal(
    (await row("select status from delivery_jobs where id=$1", [limit])).status,
    "failed",
  );

  // Marketing cannot be claimed with a missing postal/disabled marketing gate.
  const consentRequest = crypto.randomUUID();
  await q(
    "select capture_fan('jona-ferreira',$1,'email-tests@example.com','en','support_modal','{}','{}',true,'email-test-consent')",
    [consentRequest],
  );
  await q("select update_email_consent('jona-ferreira',$1,'granted',$2)", [
    fan,
    consentRequest,
  ]);
  const welcome = await row("select * from delivery_jobs where dedupe_key=$1", [
    `welcome:${fan}`,
  ]);
  assert.equal(
    (await q("select id from claim_email_jobs(null,false)")).rows.some(
      (x) => x.id === welcome.id,
    ),
    false,
  );
  const marketing = (
    await q("select * from claim_email_jobs(null,true)")
  ).rows.find((x) => x.id === welcome.id);
  assert.ok(marketing);
  await q("select update_email_consent('jona-ferreira',$1,'revoked')", [fan]);
  assert.equal(
    (
      await q(
        "select * from begin_email_dispatch($1,$2,$3,clock_timestamp()+interval '48 hours',true)",
        [marketing.id, marketing.lease_token, body],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await row("select status from delivery_jobs where id=$1", [welcome.id]))
      .status,
    "skipped",
  );

  const run = crypto.randomUUID();
  const once = (
    await row(
      "select create_controlled_email_test($1,'owner@example.com','en') id",
      [run],
    )
  ).id;
  assert.equal(
    (
      await row(
        "select create_controlled_email_test($1,'owner@example.com','en') id",
        [run],
      )
    ).id,
    once,
  );
  await assert.rejects(
    q("select create_controlled_email_test($1,'other@example.com','en')", [
      run,
    ]),
  );
  assert.equal(
    (await row("select fan_id from delivery_jobs where id=$1", [once])).fan_id,
    null,
  );
  assert.equal(
    (await q("select id from claim_email_jobs(null,true)")).rows.some(
      (x) => x.id === once,
    ),
    false,
  );
  for (const role of ["anon", "authenticated"]) {
    for (const signature of [
      "claim_email_jobs(uuid,boolean)",
      "begin_email_dispatch(uuid,uuid,jsonb,timestamp with time zone,boolean)",
      "finish_email_dispatch(uuid,uuid,text,text,text)",
      "create_controlled_email_test(uuid,text,text)",
      "quarantine_legacy_email_jobs(uuid[])",
    ]) {
      assert.equal(
        (
          await row("select has_function_privilege($1,$2,'execute') allowed", [
            role,
            signature,
          ])
        ).allowed,
        false,
      );
    }
    assert.equal(
      (
        await row(
          "select has_table_privilege($1,'delivery_job_audit','select') allowed",
          [role],
        )
      ).allowed,
      false,
    );
  }
  assert.equal(
    (
      await row(
        "select has_table_privilege('service_role','delivery_job_audit','delete') allowed",
      )
    ).allowed,
    false,
  );
  console.log(
    "PASS: email admission, exact-six quarantine/audit, 23h deadline, frozen retry, stale lease fencing, terminal states, consent withdrawal, test isolation and role denial.",
  );
}

export async function testEmailConcurrency({ observer, first, second }) {
  const setup = async () => {
    const run = crypto.randomUUID();
    return observer.query(
      `select create_controlled_email_test('${run}','owner@example.com','en')`,
    );
  };
  const claim = (client, id) =>
    client.query(
      `select coalesce(json_agg(x),'[]'::json) from claim_email_jobs('${id}',false) x`,
    );
  const id = await setup();
  await first.query("begin");
  const a = JSON.parse(await claim(first, id))[0];
  assert.ok(a);
  assert.equal(
    JSON.parse(await claim(second, id)).length,
    0,
    "SKIP LOCKED must not block or double-claim",
  );
  await first.query("commit");
  const sqlBody = JSON.stringify(body).replaceAll("'", "''");
  const expires = new Date(Date.now() + 172800000).toISOString();
  await first.query(
    `select begin_email_dispatch('${id}','${a.lease_token}','${sqlBody}','${expires}',false)`,
  );
  await observer.query(
    `update delivery_jobs set lease_until=clock_timestamp()-interval '1 second' where id='${id}'`,
  );
  const b = JSON.parse(await claim(second, id))[0];
  assert.ok(b && b.lease_token !== a.lease_token);
  assert.equal(
    await first.query(
      `select count(*) from begin_email_dispatch('${id}','${a.lease_token}','${sqlBody}','${expires}',false)`,
    ),
    "0",
  );
  assert.equal(
    await first.query(
      `select finish_email_dispatch('${id}','${a.lease_token}','failed',null,'stale_failure')`,
    ),
    "f",
  );
  assert.equal(
    await observer.query(
      `select lease_token from delivery_jobs where id='${id}'`,
    ),
    b.lease_token,
  );
  await second.query(
    `select begin_email_dispatch('${id}','${b.lease_token}','${sqlBody}','${expires}',false)`,
  );
  await second.query(
    `select finish_email_dispatch('${id}','${b.lease_token}','accepted','one-provider-id',null)`,
  );
  assert.equal(
    await first.query(
      `select finish_email_dispatch('${id}','${a.lease_token}','retry',null,'late_timeout')`,
    ),
    "f",
  );
  assert.equal(
    await observer.query(`select status from delivery_jobs where id='${id}'`),
    "sent",
  );
  assert.equal(
    await observer.query(
      `select count(*) from delivery_job_audit where job_id='${id}' and action='provider_failed'`,
    ),
    "1",
  );
  const rollbackId = await setup();
  await first.query("begin");
  await claim(first, rollbackId);
  await first.query("rollback");
  assert.equal(JSON.parse(await claim(second, rollbackId))[0].attempts, 1);
  console.log(
    "PASS: real email concurrency (SKIP LOCKED, lease takeover, stale dispatch/result denial, accepted outcome preservation, rollback).",
  );
}

import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { runRefundConcurrencyTests } from "./refund_concurrency.mjs";
import { testEmailDatabase } from "./email_database.mjs";
// Set PHASE1_PGLITE_MODULE to an absolute installed module path if using temporary tools.
const { PGlite } = await import(
  process.env.PHASE1_PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(
  "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);",
);
const migrationDirectory = new URL("../migrations/", import.meta.url);
for (const name of (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  const migration = await readFile(new URL(name, migrationDirectory), "utf8");
  // Embedded Postgres supplies gen_random_uuid natively but doesn't bundle pgcrypto.
  await db.exec(
    migration.replace("create extension if not exists pgcrypto;", ""),
  );
}
const artist = "jona-ferreira";
const request = crypto.randomUUID();
const capture = (fingerprint = "fingerprint") =>
  db.query("select capture_fan($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", [
    artist,
    request,
    "fan@example.com",
    "es",
    "stay_close",
    { utm_source: "instagram" },
    { utm_source: "instagram" },
    true,
    fingerprint,
  ]);
const fan = (await capture()).rows[0].id;
const captureSnapshot = () =>
  db.query(`select jsonb_build_array(
    ${[
      "fans",
      "capture_requests",
      "consent_records",
      "fan_events",
      "delivery_jobs",
      "delivery_job_audit",
    ]
      .map(
        (table) =>
          `(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.${table} r)`,
      )
      .join(",")}
  ) as state`);
const capturedState = (await captureSnapshot()).rows;
assert.equal((await capture()).rows[0].id, fan);
assert.deepEqual((await captureSnapshot()).rows, capturedState);
await assert.rejects(capture("changed-fingerprint"), {
  code: "P0001",
  message: "request_conflict",
});
assert.deepEqual((await captureSnapshot()).rows, capturedState);
await db.query("select capture_fan($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
  artist,
  crypto.randomUUID(),
  "fan@example.com",
  "en",
  "support_modal",
  { utm_source: "other" },
  { utm_source: "other" },
  false,
  "second",
]);
assert.equal(
  (await db.query("select count(*)::int as n from fans")).rows[0].n,
  1,
);
assert.equal(
  (await db.query("select first_touch_utm from fans")).rows[0].first_touch_utm
    .utm_source,
  "instagram",
);
assert.equal(
  (await db.query("select last_touch_utm from fans")).rows[0].last_touch_utm
    .utm_source,
  "other",
);
assert.equal(
  (await db.query("select email_permission($1) as allowed", [fan])).rows[0]
    .allowed,
  false,
);
await db.query("select update_email_consent($1,$2,$3,$4)", [
  artist,
  fan,
  "granted",
  request,
]);
assert.equal(
  (await db.query("select email_permission($1) as allowed", [fan])).rows[0]
    .allowed,
  true,
);
const attempt = crypto.randomUUID();
await db.query(
  "insert into checkout_attempts(id,artist_id,fan_id,purpose,item_slug,amount_minor,currency,stripe_session_id,analytics_consent) values($1,$2,$3,'vault_unlock','accion-wallpaper',500,'usd','cs_test',true)",
  [attempt, artist, fan],
);
await assert.rejects(
  db.query("select fulfill_checkout($1,$2,$3,$4,$5,$6,$7)", [
    "evt_bad",
    "checkout.session.completed",
    attempt,
    "cs_test",
    "pi_test",
    100,
    "usd",
  ]),
);
assert.equal(
  (await db.query("select count(*)::int as n from purchases")).rows[0].n,
  0,
);
const fulfill = (event) =>
  db.query("select fulfill_checkout($1,$2,$3,$4,$5,$6,$7)", [
    event,
    "checkout.session.completed",
    attempt,
    "cs_test",
    "pi_test",
    500,
    "usd",
  ]);
await fulfill("evt_1");
await fulfill("evt_1");
await fulfill("evt_2");
for (const table of ["purchases", "vault_unlocks"])
  assert.equal(
    (await db.query(`select count(*)::int as n from ${table}`)).rows[0].n,
    1,
  );
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from delivery_jobs where kind='purchase'",
    )
  ).rows[0].n,
  1,
);
await db.query("select refund_purchase($1,$2,$3)", [
  "evt_refund",
  "pi_test",
  true,
]);
await fulfill("evt_late");
assert.equal(
  (await db.query("select status from vault_unlocks")).rows[0].status,
  "revoked",
);
assert.equal(
  (await db.query("select status from purchases")).rows[0].status,
  "refunded",
);
const tip = crypto.randomUUID();
await db.query(
  "insert into checkout_attempts(id,artist_id,fan_id,purpose,amount_minor,currency,stripe_session_id) values($1,$2,$3,'tip',1500,'usd','cs_tip')",
  [tip, artist, fan],
);
await db.query("select fulfill_checkout($1,$2,$3,$4,$5,$6,$7)", [
  "evt_tip",
  "checkout.session.completed",
  tip,
  "cs_tip",
  "pi_tip",
  1500,
  "usd",
]);
assert.equal(
  (await db.query("select count(*)::int as n from vault_unlocks")).rows[0].n,
  1,
);
await db.query("select update_email_consent($1,$2,$3)", [
  artist,
  fan,
  "revoked",
]);
assert.equal(
  (await db.query("select email_permission($1) as allowed", [fan])).rows[0]
    .allowed,
  false,
);
// Anonymous and authenticated callers cannot read tables OR call privileged RPCs.
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  for (const table of [
    "fans",
    "purchases",
    "vault_unlocks",
    "fan_events",
    "consent_records",
    "delivery_jobs",
    "checkout_attempts",
  ]) {
    await assert.rejects(db.query(`select * from ${table}`));
    await assert.rejects(db.query(`delete from ${table}`));
  }
  await assert.rejects(db.query("select check_rate($1,$2)", ["bad", 100]));
  await assert.rejects(
    db.query("select update_email_consent($1,$2,$3)", [artist, fan, "granted"]),
  );
  await assert.rejects(
    db.query("select refund_purchase($1,$2,$3)", [
      "forbidden",
      "pi_test",
      true,
    ]),
  );
  await assert.rejects(
    db.query("select fulfill_checkout($1,$2,$3,$4,$5,$6,$7)", [
      "forbidden",
      "checkout.session.completed",
      attempt,
      "cs_test",
      "pi_test",
      500,
      "usd",
    ]),
  );
  await db.exec("reset role");
}
for (const signature of [
  "public.refund_purchase(text,text,boolean)",
  "public.fulfill_checkout(text,text,uuid,text,text,integer,text)",
]) {
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('service_role',$1,'EXECUTE') as allowed",
        [signature],
      )
    ).rows[0].allowed,
    true,
  );
}
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity",
    )
  ).rows[0].n,
  0,
);

// Only a genuinely expired attempt with verified current permission gets one reminder.
const reminderFan = (
  await db.query(
    "insert into fans(artist_id,email_normalized,first_touch_source,email_verified_at) values($1,'reminder@example.com','support_modal',now()) returning id",
    [artist],
  )
).rows[0].id;
const reminderRequest = crypto.randomUUID();
await db.query(
  "select capture_fan($1,$2,'reminder@example.com','en','support_modal','{}','{}',true,'reminder')",
  [artist, reminderRequest],
);
await db.query("select update_email_consent($1,$2,$3,$4)", [
  artist,
  reminderFan,
  "granted",
  reminderRequest,
]);
const abandoned = crypto.randomUUID();
await db.query(
  "insert into checkout_attempts(id,artist_id,fan_id,purpose,amount_minor,currency,status,created_at,expires_at) values($1,$2,$3,'tip',1500,'usd','expired',now()-interval '25 hours',now()-interval '1 hour')",
  [abandoned, artist, reminderFan],
);
await db.query("select schedule_reminders()");
await db.query("select schedule_reminders()");
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from delivery_jobs where kind='reminder'",
    )
  ).rows[0].n,
  1,
);
await db.query("select update_email_consent($1,$2,$3)", [
  artist,
  reminderFan,
  "revoked",
]);
const claimed = await db.query("select id from claim_jobs()");
const claimedAgain = await db.query("select id from claim_jobs()");
const claimedIds = new Set(claimed.rows.map((r) => r.id));
assert.ok(claimedAgain.rows.every((r) => !claimedIds.has(r.id)));
assert.equal(
  (await db.query("select email_permission($1) as allowed", [reminderFan]))
    .rows[0].allowed,
  false,
);

// Refund regressions use independent fans, so every entitlement assertion is
// isolated from the existing capture, consent and support scenarios above.
async function refundFan(artistId = artist) {
  const id = crypto.randomUUID();
  await db.query(
    "insert into fans(id,artist_id,email_normalized,first_touch_source) values($1,$2,$3,'support_modal')",
    [id, artistId, `${id}@example.invalid`],
  );
  return { id, artistId };
}
async function refundPurchase(owner, item = "accion-wallpaper") {
  const id = crypto.randomUUID();
  const session = `cs_${id}`;
  const intent = `pi_${id}`;
  await db.query(
    "insert into checkout_attempts(id,artist_id,fan_id,purpose,item_slug,amount_minor,currency,stripe_session_id) values($1,$2,$3,$4,$5,500,'usd',$6)",
    [
      id,
      owner.artistId,
      owner.id,
      item ? "vault_unlock" : "tip",
      item,
      session,
    ],
  );
  const fulfill = (event = `evt_paid_${id}`) =>
    db.query(
      "select fulfill_checkout($1,'checkout.session.completed',$2,$3,$4,500,'usd')",
      [event, id, session, intent],
    );
  await fulfill();
  const purchaseId = (
    await db.query("select id from purchases where checkout_attempt_id=$1", [
      id,
    ])
  ).rows[0].id;
  return { id: purchaseId, intent, fulfill };
}
const refund = (purchase, full, event = `evt_${crypto.randomUUID()}`) =>
  db.query("select refund_purchase($1,$2,$3)", [event, purchase.intent, full]);
const purchaseState = async (purchase) =>
  (
    await db.query("select status,refunded_at from purchases where id=$1", [
      purchase.id,
    ])
  ).rows[0];
const unlockState = async (owner, item = "accion-wallpaper") =>
  (
    await db.query(
      "select purchase_id,status,revoked_at from vault_unlocks where artist_id=$1 and fan_id=$2 and item_slug=$3",
      [owner.artistId, owner.id, item],
    )
  ).rows[0];

// Partial refunds keep access. Duplicate events do not change timestamps or
// generate additional events; full refunds are terminal even after late success.
{
  const owner = await refundFan();
  const p = await refundPurchase(owner);
  await assert.rejects(refund(p, null), /invalid_refund/);
  assert.deepEqual(await purchaseState(p), {
    status: "paid",
    refunded_at: null,
  });
  const partialEvent = `evt_${crypto.randomUUID()}`;
  await refund(p, false, partialEvent);
  const partial = await purchaseState(p);
  assert.equal(partial.status, "partially_refunded");
  assert.equal((await unlockState(owner)).status, "active");
  await refund(p, false, partialEvent);
  assert.deepEqual(await purchaseState(p), partial);
  await refund(p, true);
  const full = await purchaseState(p);
  await refund(p, false);
  assert.deepEqual(await purchaseState(p), full);
  await refund(p, true);
  await p.fulfill(`evt_late_${crypto.randomUUID()}`);
  assert.deepEqual(await purchaseState(p), full);
  const revoked = await unlockState(owner);
  assert.equal(revoked.status, "revoked");
  assert.ok(revoked.revoked_at);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from webhook_events where event_id=$1",
        [partialEvent],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from delivery_jobs where dedupe_key=$1",
        [`purchase:${p.id}`],
      )
    ).rows[0].n,
    1,
  );
}

// Exact D1 reproduction: a stale partial refund for fully refunded A must not
// make A a qualifying fallback when B is subsequently fully refunded.
{
  const owner = await refundFan();
  const a = await refundPurchase(owner);
  const b = await refundPurchase(owner);
  await refund(a, true);
  assert.equal((await unlockState(owner)).purchase_id, b.id);
  await refund(b, false);
  await refund(a, false);
  assert.equal((await purchaseState(a)).status, "refunded");
  assert.equal((await unlockState(owner)).status, "active");
  assert.equal((await unlockState(owner)).purchase_id, b.id);
  const fullEvent = `evt_${crypto.randomUUID()}`;
  await refund(b, true, fullEvent);
  const revoked = await unlockState(owner);
  await refund(b, true, fullEvent);
  await refund(b, false);
  await refund(a, true);
  assert.deepEqual(await unlockState(owner), revoked);
  assert.equal(revoked.status, "revoked");
  assert.equal((await purchaseState(b)).status, "refunded");
}

// Refunding a non-owning purchase must preserve A; a genuine new purchase can
// reactivate access, and later refunds for old purchases must preserve that grant.
{
  const owner = await refundFan();
  const a = await refundPurchase(owner);
  const b = await refundPurchase(owner);
  await refund(b, true);
  assert.equal((await unlockState(owner)).purchase_id, a.id);
  assert.equal((await unlockState(owner)).status, "active");
  await refund(a, true);
  const c = await refundPurchase(owner);
  await refund(a, false);
  await refund(b, true);
  const current = await unlockState(owner);
  assert.equal(current.status, "active");
  assert.equal(current.purchase_id, c.id);
  assert.equal(current.revoked_at, null);
}

// Only the same fan, artist and item can preserve access. Tips and other items
// do not qualify, and refunding a tip cannot revoke a valid digital entitlement.
{
  const owner = await refundFan();
  const p = await refundPurchase(owner);
  const otherItem = await refundPurchase(owner, "other-item");
  const tip = await refundPurchase(owner, null);
  const otherFan = await refundFan();
  await refundPurchase(otherFan);
  const otherArtist = await refundFan("another-artist");
  await refundPurchase(otherArtist);
  await refund(tip, true);
  assert.equal((await unlockState(owner)).status, "active");
  await refund(p, true);
  assert.equal((await unlockState(owner)).status, "revoked");
  assert.equal(
    (await unlockState(owner, "other-item")).purchase_id,
    otherItem.id,
  );
  assert.equal((await unlockState(otherFan)).status, "active");
  assert.equal((await unlockState(otherArtist)).status, "active");
}

// A refund delivered before fulfillment must remain retryable: its event is
// recorded only after the purchase exists and the refund can be applied.
{
  const owner = await refundFan();
  const id = crypto.randomUUID();
  const intent = `pi_${id}`;
  const event = `evt_${crypto.randomUUID()}`;
  await db.query(
    "insert into checkout_attempts(id,artist_id,fan_id,purpose,item_slug,amount_minor,currency,stripe_session_id) values($1,$2,$3,'vault_unlock','accion-wallpaper',500,'usd',$4)",
    [id, owner.artistId, owner.id, `cs_${id}`],
  );
  await assert.rejects(
    db.query("select refund_purchase($1,$2,true)", [event, intent]),
    /purchase_not_ready/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as n from webhook_events where event_id=$1",
        [event],
      )
    ).rows[0].n,
    0,
  );
  await db.query(
    "select fulfill_checkout($1,'checkout.session.completed',$2,$3,$4,500,'usd')",
    [`evt_paid_${id}`, id, `cs_${id}`, intent],
  );
  const p = {
    id: (
      await db.query("select id from purchases where checkout_attempt_id=$1", [
        id,
      ])
    ).rows[0].id,
  };
  await db.query("select refund_purchase($1,$2,true)", [event, intent]);
  assert.equal((await purchaseState(p)).status, "refunded");
  assert.equal((await unlockState(owner)).status, "revoked");
}
const guestAttempt = crypto.randomUUID();
const guestSession = "cs_test_guest";
const guestIntent = "pi_guest";
const insertGuestAttempt = (purpose, session = guestSession) =>
  db.query(
    `insert into checkout_attempts(id,artist_id,purpose,item_slug,amount_minor,currency,stripe_session_id,payment_mode,stripe_account_id,guest_token_hash)
   values($1,$2,$3,case when $3='vault_unlock' then 'accion-wallpaper' end,500,'usd',$4,'test','acct_mock',repeat('a',64))`,
    [guestAttempt, artist, purpose, session],
  );
const beforeGuest = (await captureSnapshot()).rows;
await assert.rejects(
  insertGuestAttempt("vault_unlock"),
  /checkout_attempt_guest_tip/,
);
await assert.rejects(
  insertGuestAttempt("tip", "cs_live_wrong"),
  /checkout_attempt_payment_context/,
);
await insertGuestAttempt("tip");
const fulfillGuest = (event, paymentIntent = guestIntent) =>
  db.query(
    "select fulfill_checkout($1,'checkout.session.completed',$2,$3,$4,500,'usd') as purchase",
    [event, guestAttempt, guestSession, paymentIntent],
  );
const guestPurchase = (await fulfillGuest("evt_guest_paid")).rows[0].purchase;
assert.equal(
  (await fulfillGuest("evt_guest_paid")).rows[0].purchase,
  guestPurchase,
);
await assert.rejects(
  fulfillGuest("evt_guest_other_intent", "pi_unexpected"),
  /payment_mismatch/,
);
await assert.rejects(
  db.query("update purchases set purpose='vault_unlock' where id=$1", [
    guestPurchase,
  ]),
  /purchase_guest_tip/,
);
await db.query("select refund_purchase($1,$2,false)", [
  "evt_guest_partial",
  guestIntent,
]);
assert.equal(
  (await db.query("select status from purchases where id=$1", [guestPurchase]))
    .rows[0].status,
  "partially_refunded",
);
await db.query("select refund_purchase($1,$2,true)", [
  "evt_guest_full",
  guestIntent,
]);
await db.query("select refund_purchase($1,$2,true)", [
  "evt_guest_full",
  guestIntent,
]);
await fulfillGuest("evt_guest_paid_late");
assert.deepEqual(
  (
    await db.query(
      "select status,fan_id,purpose,vault_item_slug from purchases where checkout_attempt_id=$1",
      [guestAttempt],
    )
  ).rows,
  [{ status: "refunded", fan_id: null, purpose: "tip", vault_item_slug: null }],
);
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from webhook_events where event_id='evt_guest_full'",
    )
  ).rows[0].n,
  1,
);
assert.deepEqual((await captureSnapshot()).rows, beforeGuest);
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from vault_unlocks where purchase_id=$1",
      [guestPurchase],
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (
    await db.query("select payment_mode from checkout_attempts where id=$1", [
      attempt,
    ])
  ).rows[0].payment_mode,
  null,
);
console.log(
  "PASS: guest constraints, idempotent payment and refunds, no guest fan, consent, access or delivery side effects.",
);

console.log(
  "PASS: migrations, identity/consent, price mismatch rollback, webhook replay, tip isolation, terminal full refunds, duplicate/stale refunds, multiple qualifying purchases, refund-before-purchase retry, anonymous/authenticated negative access.",
);
const rewardSignature =
  "public.capture_fan_with_reward(text,uuid,text,text,jsonb,jsonb,boolean,text,text)";
for (const role of ["anon", "authenticated", "service_role"]) {
  const { rows } = await db.query(
    "select has_function_privilege($1,$2,'execute') as allowed",
    [role, rewardSignature],
  );
  assert.equal(rows[0].allowed, role === "service_role");
}
const packRequest = crypto.randomUUID();
const touches = {
  release: "sayyouluvme",
  utm_campaign: "sayyouluvme_2026",
  utm_source: "instagram",
};
const packCapture = (id, fingerprint = "wallpaper-test") =>
  db.query("select capture_fan_with_reward($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", [
    artist,
    id,
    "pack@example.com",
    "es",
    touches,
    touches,
    false,
    fingerprint,
    "la_cultura_wallpapers",
  ]);
const packFan = (await packCapture(packRequest)).rows[0].id;
const savedPack = (await captureSnapshot()).rows;
assert.equal((await packCapture(packRequest)).rows[0].id, packFan);
await assert.rejects(packCapture(packRequest, "different"), /request_conflict/);
await assert.rejects(packCapture(request, "fingerprint"), /request_conflict/);
assert.deepEqual((await captureSnapshot()).rows, savedPack);
const packJob = (
  await db.query(
    "select payload from delivery_jobs where fan_id=$1 and dedupe_key=$2",
    [packFan, `capture:${packRequest}`],
  )
).rows[0].payload;
assert.deepEqual(packJob, {
  confirm: false,
  magnet: true,
  rewardId: "la_cultura_wallpapers",
});
const event = (
  await db.query(
    "select release_slug,metadata from fan_events where fan_id=$1 and event_id=$2",
    [packFan, `capture:${packRequest}`],
  )
).rows[0];
assert.deepEqual(event, {
  release_slug: "sayyouluvme",
  metadata: {
    rewardId: "la_cultura_wallpapers",
    firstTouch: touches,
    lastTouch: touches,
  },
});
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from consent_records where fan_id=$1",
      [packFan],
    )
  ).rows[0].n,
  0,
);
console.log(
  "PASS: La Cultura reward-only capture, scoped attribution, replay, legacy conflict and grants.",
);
for (const signature of [
  "public.artist_studio_report(text,text)",
  "public.artist_studio_fans(text,text,integer,integer)",
  "public.artist_studio_content_save(text,uuid,integer,jsonb)",
  "public.artist_studio_content_list(text,date,text,integer,integer)",
  "public.artist_studio_content_acquisition(text,uuid)",
]) {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const result = await db.query(
      "select has_function_privilege($1,$2,'execute') as allowed",
      [role, signature],
    );
    assert.equal(result.rows[0].allowed, role === "service_role");
  }
}
const studioReport = (
  await db.query("select artist_studio_report($1,$2) as report", [
    artist,
    "sayyouluvme_2026",
  ])
).rows[0].report;
assert.deepEqual(studioReport.campaign_totals, {
  requests: 1,
  contacts: 1,
  contacts_with_confirmed_request: 0,
});
assert.deepEqual(studioReport.live_revenue_by_currency, []);
assert.equal(studioReport.reward_requests_30_days, 1);
const directory = async (artistId, search, offset = 0) =>
  (
    await db.query("select artist_studio_fans($1,$2,25,$3) as fans", [
      artistId,
      search,
      offset,
    ])
  ).rows[0].fans;
const searchResult = await directory(artist, "PACK@EXAMPLE.COM");
assert.equal(searchResult.total, 1);
assert.equal(searchResult.items[0].consent, "none");
assert.equal(searchResult.items[0].acquisition_source, "instagram");
assert.equal(searchResult.items[0].first_release, "sayyouluvme");
assert.equal(searchResult.items[0].recent_release, "sayyouluvme");
assert.deepEqual(await directory(artist, "PACK@EXAMPLE.COM", 25), {
  total: 1,
  items: [],
});
assert.deepEqual(await directory("other-artist", "pack"), {
  total: 0,
  items: [],
});
assert.equal((await directory(artist, "%")).total, 0);
console.log(
  "PASS: Studio aggregate and directory scoping, service-only grants, search and pagination.",
);
const placement = "10000000-0000-4000-8000-000000000001";
const placementFields = {
  title: "Performance clip",
  release_slug: "sayyouluvme",
  campaign_id: "sayyouluvme_2026",
  pillar: "Performance",
  language: "es",
  hook: "Escucha esto",
  caption: "Una toma",
  cta: "",
  format: "ig_story",
  status: "ready",
  planned_on: "2026-11-27",
};
const saveContent = async (revision, fields) =>
  (
    await db.query("select artist_studio_content_save($1,$2,$3,$4) as saved", [
      artist,
      placement,
      revision,
      fields,
    ])
  ).rows[0].saved;
const listContent = async (artistId, day, filter = "active") =>
  (
    await db.query(
      "select artist_studio_content_list($1,$2,$3,25,0) as result",
      [artistId, day, filter],
    )
  ).rows[0].result;
const contentAcquisition = async (artistId) =>
  (
    await db.query(
      "select artist_studio_content_acquisition($1,$2) as result",
      [artistId, placement],
    )
  ).rows[0].result;

for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query("select * from public.studio_content_ideas"), {
    code: "42501",
  });
  await assert.rejects(
    db.query("select * from public.studio_content_placements"),
    { code: "42501" },
  );
  await db.exec("reset role");
}
assert.equal(await saveContent(null, placementFields), true);
assert.equal(await saveContent(null, placementFields), false);
assert.deepEqual((await listContent(artist, "2026-11-30")).items, []);
assert.deepEqual((await listContent("other-artist", null)).items, []);
const weekContent = await listContent(artist, "2026-11-23");
assert.equal(weekContent.week_count, 1);
assert.equal(weekContent.items[0].status, "ready");
assert.equal(weekContent.items[0].published_on, null);
await assert.rejects(
  saveContent(1, { ...placementFields, status: "published" }),
  { code: "23514" },
);
const publishedFields = {
  ...placementFields,
  status: "published",
  published_on: "2026-11-27",
  post_url: "https://www.instagram.com/stories/artist/12345/",
};
assert.equal(await saveContent(1, publishedFields), true);
assert.equal(await saveContent(1, placementFields), false);
assert.equal(
  await saveContent(2, { ...publishedFields, format: "tt_video" }),
  false,
);
assert.equal(
  (await listContent(artist, null, "published")).items[0].revision,
  2,
);
assert.deepEqual(await contentAcquisition(artist), {
  requests: 0,
  contacts: 0,
});
const exactTouch = {
  ...touches,
  utm_source: "instagram",
  utm_medium: "organic_social",
  utm_content: "studio_baaaaaaaaaaaeaaaiaaaaaaaaaaaaaab",
  landing_path: "/music/sayyouluvme",
};
for (const last of [
  exactTouch,
  exactTouch,
  { ...exactTouch, utm_source: "tiktok" },
  touches,
]) {
  await db.query(
    "select capture_fan_with_reward($1,$2,$3,'es',$4,$5,false,'test','la_cultura_wallpapers')",
    [artist, crypto.randomUUID(), "placement@example.test", exactTouch, last],
  );
}
assert.deepEqual(await contentAcquisition(artist), {
  requests: 2,
  contacts: 1,
});
assert.equal(await contentAcquisition("other-artist"), null);
assert.equal(
  await saveContent(2, { ...publishedFields, status: "archived" }),
  true,
);
assert.deepEqual((await listContent(artist, null)).items, []);
assert.equal(
  (await listContent(artist, null, "archived")).items[0].published_on,
  "2026-11-27",
);
console.log(
  "PASS: Studio content persistence, publication integrity, stale writes, private grants and exact campaign attribution.",
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query("select * from studio_instagram_connections"), {
    code: "42501",
  });
  await assert.rejects(
    db.query("select studio_reserve_creative_generation('jona-ferreira')"),
    { code: "42501" },
  );
  await db.exec("reset role");
}
await db.query(
  "insert into studio_creative_usage values ($1, date_trunc('month', now() at time zone 'UTC')::date, 99)",
  [artist],
);
const budget = () =>
  db.query("select studio_reserve_creative_generation($1) as used", [artist]);
assert.equal((await budget()).rows[0].used, 100);
assert.equal((await budget()).rows[0].used, null);
await db.query(
  "update studio_content_placements set instagram_media_id='fixture' where id=$1",
  [placement],
);
await db.query(
  "update studio_content_placements set post_url='https://www.instagram.com/stories/artist/9999/' where id=$1",
  [placement],
);
assert.equal(
  (
    await db.query(
      "select instagram_media_id from studio_content_placements where id=$1",
      [placement],
    )
  ).rows[0].instagram_media_id,
  null,
);
console.log(
  "PASS: Studio account grants, capped AI reservation, and cleared association on changed permalink.",
);
await db.close();
const emailDb = new PGlite();
await emailDb.exec(
  "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);",
);
for (const name of (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  await emailDb.exec(
    (await readFile(new URL(name, migrationDirectory), "utf8")).replace(
      "create extension if not exists pgcrypto;",
      "",
    ),
  );
}
await testEmailDatabase(emailDb);
await emailDb.close();
await runRefundConcurrencyTests();

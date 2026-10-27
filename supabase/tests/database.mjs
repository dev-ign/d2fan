import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { runRefundConcurrencyTests } from "./refund_concurrency.mjs";
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
const capture = () =>
  db.query("select capture_fan($1,$2,$3,$4,$5,$6,$7,$8,$9) as id", [
    artist,
    request,
    "fan@example.com",
    "es",
    "stay_close",
    { utm_source: "instagram" },
    { utm_source: "instagram" },
    true,
    "fingerprint",
  ]);
const fan = (await capture()).rows[0].id;
assert.equal((await capture()).rows[0].id, fan);
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
await db.query("select update_email_consent($1,$2,$3)", [
  artist,
  fan,
  "granted",
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
await db.query("select update_email_consent($1,$2,$3)", [
  artist,
  reminderFan,
  "granted",
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
console.log(
  "PASS: migrations, identity/consent, price mismatch rollback, webhook replay, tip isolation, terminal full refunds, duplicate/stale refunds, multiple qualifying purchases, refund-before-purchase retry, anonymous/authenticated negative access.",
);
await db.close();
await runRefundConcurrencyTests();

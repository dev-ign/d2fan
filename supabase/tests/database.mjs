import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
// Set PHASE1_PGLITE_MODULE to an absolute installed module path if using temporary tools.
const { PGlite } = await import(
  process.env.PHASE1_PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(
  "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean);",
);
let migration = await readFile(
  new URL("../migrations/202610230001_fan_core.sql", import.meta.url),
  "utf8",
);
// Embedded Postgres supplies gen_random_uuid natively but doesn't bundle pgcrypto.
await db.exec(
  migration.replace("create extension if not exists pgcrypto;", ""),
);
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
  await db.exec("reset role");
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
console.log(
  "PASS: migration, identity dedupe, first/last touch, permission confirmation/revocation, price mismatch rollback, webhook replay, tip isolation, refund ordering, anonymous/authenticated negative access.",
);
await db.close();

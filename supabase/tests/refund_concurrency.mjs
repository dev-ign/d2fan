// Real multi-session regression tests. This creates and removes its own local
// PostgreSQL cluster, uses a private Unix socket, and never reads a database URL.
// Run directly or through npm run test:db. PHASE1_POSTGRES_BIN may point to a
// directory containing initdb, pg_ctl and psql (for example PostgreSQL 17 in CI).
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const exec = promisify(execFile);
const binary = (name) =>
  process.env.PHASE1_POSTGRES_BIN
    ? join(process.env.PHASE1_POSTGRES_BIN, name)
    : name;
// Ambient PG* settings must not select a service, options or hosted database.
const localEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("PG")),
);

function connect(socket) {
  const child = spawn(
    binary("psql"),
    [
      "-X",
      "-q",
      "-A",
      "-t",
      "-h",
      socket,
      "-p",
      "5432",
      "-U",
      "refund_test_owner",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { env: localEnv, stdio: ["pipe", "pipe", "pipe"] },
  );
  let pending;
  let errors = "";
  let exited = false;
  const fail = (error) => {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending = undefined;
    }
  };
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  child.on("error", fail);
  const exit = new Promise((resolve) =>
    child.on("close", (code) => {
      exited = true;
      fail(new Error(`local psql exited (${code}): ${errors}`));
      resolve();
    }),
  );
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!pending) return;
    if (line === pending.marker) {
      clearTimeout(pending.timer);
      pending.resolve(pending.lines.join("\n").trim());
      pending = undefined;
    } else pending.lines.push(line);
  });
  return {
    query(sql) {
      assert.ok(!pending, "only one query at a time per psql session");
      assert.ok(!exited, "psql session is open");
      const promise = new Promise((resolve, reject) => {
        const marker = `done_${crypto.randomUUID()}`;
        const timer = setTimeout(() => {
          fail(
            new Error("local PostgreSQL query timed out (possible deadlock)"),
          );
          child.kill("SIGTERM");
        }, 10000);
        pending = { marker, timer, resolve, reject, lines: [] };
        child.stdin.write(`${sql};\n\\echo ${marker}\n`);
      });
      // A blocked query can fail while its caller is checking the barrier.
      promise.catch(() => {});
      return promise;
    },
    async close() {
      if (!exited) child.kill("SIGTERM");
      await exit;
    },
  };
}

export async function runRefundConcurrencyTests() {
  if (process.platform === "win32") {
    console.log(
      "SKIP: refund concurrency requires local PostgreSQL Unix sockets.",
    );
    return;
  }
  let version;
  try {
    version = (
      await exec(binary("initdb"), ["--version"], { env: localEnv })
    ).stdout.trim();
    await exec(binary("pg_ctl"), ["--version"], { env: localEnv });
    await exec(binary("psql"), ["--version"], { env: localEnv });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log(
      "SKIP: real refund concurrency tests need initdb, pg_ctl and psql; set PHASE1_POSTGRES_BIN. PGlite is not concurrency evidence.",
    );
    return;
  }
  const directory = await mkdtemp("/tmp/d2fan-refunds-");
  const data = join(directory, "data");
  const clients = [];
  let started = false;
  try {
    await exec(
      binary("initdb"),
      [
        "-D",
        data,
        "-A",
        "trust",
        "--no-locale",
        "-E",
        "UTF8",
        "-U",
        "refund_test_owner",
      ],
      { env: localEnv },
    );
    await exec(
      binary("pg_ctl"),
      [
        "-D",
        data,
        "-l",
        join(directory, "postgres.log"),
        "-w",
        "-o",
        `-F -c listen_addresses= -c unix_socket_directories=${directory} -c unix_socket_permissions=0700 -c max_connections=10`,
        "start",
      ],
      { env: localEnv },
    );
    started = true;
    const observer = connect(directory);
    const first = connect(directory);
    const second = connect(directory);
    clients.push(observer, first, second);
    await observer.query(
      "create role anon; create role authenticated; create role service_role; create schema storage; create table storage.buckets(id text primary key,name text,public boolean)",
    );
    const migrations = new URL("../migrations/", import.meta.url);
    for (const name of (await readdir(migrations))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await observer.query(await readFile(new URL(name, migrations), "utf8"));
    }
    const secondPid = Number(await second.query("select pg_backend_pid()"));
    async function owner() {
      const id = crypto.randomUUID();
      await observer.query(
        `insert into fans(id,artist_id,email_normalized,first_touch_source) values('${id}','jona-ferreira','${id}@example.invalid','support_modal')`,
      );
      return id;
    }
    async function attempt(fan, paid = true) {
      const id = crypto.randomUUID();
      await observer.query(
        `insert into checkout_attempts(id,artist_id,fan_id,purpose,item_slug,amount_minor,currency,stripe_session_id) values('${id}','jona-ferreira','${fan}','vault_unlock','accion-wallpaper',500,'usd','cs_${id}')`,
      );
      const fulfill = `select fulfill_checkout('evt_paid_${id}','checkout.session.completed','${id}','cs_${id}','pi_${id}',500,'usd')`;
      if (paid) await observer.query(fulfill);
      return {
        id,
        fulfill,
        refund: (full, event = `evt_${crypto.randomUUID()}`) =>
          `select refund_purchase('${event}','pi_${id}',${full})`,
      };
    }
    async function state(fan) {
      return JSON.parse(
        await observer.query(`select json_build_object(
        'statuses',(select json_agg(status order by stripe_payment_intent_id) from purchases where fan_id='${fan}'),
        'unlock',(select json_build_object('status',u.status,'intent',p.stripe_payment_intent_id,'revoked',u.revoked_at is not null) from vault_unlocks u join purchases p on p.id=u.purchase_id where u.fan_id='${fan}'),
        'purchases',(select count(*) from purchases where fan_id='${fan}'),
        'jobs',(select count(*) from delivery_jobs where fan_id='${fan}' and kind='purchase')
      )`),
      );
    }
    async function blocked() {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const waiting = await observer.query(
          `select coalesce((select wait_event_type='Lock' from pg_stat_activity where pid=${secondPid}),false)::text`,
        );
        if (waiting === "true") return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.fail(
        "second transaction did not reach a real PostgreSQL lock wait",
      );
    }
    async function overlap(
      label,
      firstSql,
      secondSql,
      verify,
      finish = "commit",
    ) {
      await first.query("begin");
      await first.query(firstSql);
      const waiting = second.query(secondSql);
      await blocked();
      await first.query(finish);
      await waiting;
      await verify();
      console.log(`PASS: concurrent ${label}`);
    }

    {
      const fan = await owner();
      const a = await attempt(fan);
      await overlap(
        "full refund / stale partial",
        a.refund(true),
        a.refund(false),
        async () => {
          const result = await state(fan);
          assert.deepEqual(result.statuses, ["refunded"]);
          assert.equal(result.unlock.status, "revoked");
          assert.equal(result.unlock.revoked, true);
        },
      );
    }
    {
      const fan = await owner();
      const a = await attempt(fan);
      await overlap(
        "partial refund / full refund",
        a.refund(false),
        a.refund(true),
        async () => {
          const result = await state(fan);
          assert.deepEqual(result.statuses, ["refunded"]);
          assert.equal(result.unlock.status, "revoked");
        },
      );
    }
    {
      const fan = await owner();
      const a = await attempt(fan);
      const event = `evt_${crypto.randomUUID()}`;
      await overlap(
        "duplicate refund event",
        a.refund(true, event),
        a.refund(true, event),
        async () => {
          assert.equal(
            await observer.query(
              `select count(*) from webhook_events where event_id='${event}'`,
            ),
            "1",
          );
          const result = await state(fan);
          assert.deepEqual(result.statuses, ["refunded"]);
          assert.equal(result.purchases, 1);
          assert.equal(result.jobs, 1);
        },
      );
    }
    {
      const fan = await owner();
      const a = await attempt(fan);
      const b = await attempt(fan);
      await overlap(
        "two purchases fully refunded",
        a.refund(true),
        b.refund(true),
        async () => {
          const result = await state(fan);
          assert.deepEqual(result.statuses, ["refunded", "refunded"]);
          assert.equal(result.unlock.status, "revoked");
        },
      );
    }
    for (const fulfillmentFirst of [false, true]) {
      const fan = await owner();
      const a = await attempt(fan);
      const b = await attempt(fan, false);
      await overlap(
        fulfillmentFirst
          ? "fulfillment before old refund"
          : "old refund before fulfillment",
        fulfillmentFirst ? b.fulfill : a.refund(true),
        fulfillmentFirst ? a.refund(true) : b.fulfill,
        async () => {
          const result = await state(fan);
          assert.equal(result.unlock.status, "active");
          assert.equal(result.unlock.intent, `pi_${b.id}`);
          assert.equal(result.unlock.revoked, false);
          assert.equal(result.purchases, 2);
          assert.equal(result.jobs, 2);
        },
      );
    }
    {
      const fan = await owner();
      const a = await attempt(fan);
      const event = `evt_${crypto.randomUUID()}`;
      await overlap(
        "rolled-back full refund / partial",
        a.refund(true, event),
        a.refund(false),
        async () => {
          const result = await state(fan);
          assert.deepEqual(result.statuses, ["partially_refunded"]);
          assert.equal(result.unlock.status, "active");
          assert.equal(
            await observer.query(
              `select count(*) from webhook_events where event_id='${event}'`,
            ),
            "0",
          );
        },
        "rollback",
      );
    }
    {
      const fanA = await owner();
      const fanB = await owner();
      const a = await attempt(fanA);
      const b = await attempt(fanB);
      await first.query("begin");
      await first.query(a.refund(true));
      // This must complete while the first fan's transaction is still open.
      await second.query(b.refund(true));
      assert.equal((await state(fanB)).unlock.status, "revoked");
      await first.query("commit");
      console.log("PASS: unrelated fans do not block each other");
    }
    console.log(
      `PASS: 8 real multi-session refund scenarios (${version}); private disposable cluster, no hosted connection.`,
    );
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
    if (started)
      await exec(binary("pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"], {
        env: localEnv,
      });
    await rm(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runRefundConcurrencyTests();
}

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const front = parseEnv(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8"),
);
const back = parseEnv(
  readFileSync(new URL("../supabase/.env.local", import.meta.url), "utf8"),
);
if (!/^(sk|rk)_test_/.test(back.STRIPE_SECRET_KEY || "")) {
  console.error(
    "Set STRIPE_SECRET_KEY to the existing sandbox's test key in supabase/.env.local. See docs/development/PAYMENT_TESTING.md.",
  );
  process.exit(1);
}
// The existing hosted webhook fulfills these sessions. A different sandbox's
// key would create payments that this project's webhook cannot verify.
try {
  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${back.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(10000),
  });
  const account = await response.json();
  if (!response.ok || account.id !== "acct_1UU6trFaxpknY0U7") {
    throw new Error("sandbox_mismatch");
  }
} catch {
  console.error(
    "Cannot verify the Jona Ferreira sandbox key. Use account acct_1UU6trFaxpknY0U7; restricted keys need Account read access. See docs/development/PAYMENT_TESTING.md.",
  );
  process.exit(1);
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
function run(command, args, env) {
  const child = spawn(command, args, { stdio: "inherit", env });
  children.push(child);
  child.on("error", () => {
    console.error(
      `Cannot start ${command}. Install Deno or set DENO_BIN in supabase/.env.local.`,
    );
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
// Server secrets are passed only to Deno. Never pass them to Vite or VITE_*.
run(
  back.DENO_BIN || "deno",
  [
    "run",
    "--config",
    "supabase/deno.json",
    "--allow-env",
    "--allow-net",
    "scripts/payment-test-server.ts",
  ],
  {
    ...process.env,
    ...back,
    SUPABASE_URL: front.VITE_SUPABASE_URL,
    PUBLIC_SITE_URL: "http://localhost:5173",
    ALLOWED_ORIGINS: "http://localhost:5173",
    ACCION_TEST_CHECKOUT: "true",
    ACCION_TEST_TOKEN_SECRET: randomBytes(32).toString("hex"),
  },
);
run(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ],
  {
    ...process.env,
    VITE_PAYMENT_TEST_API: "http://127.0.0.1:54324/functions/v1",
  },
);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

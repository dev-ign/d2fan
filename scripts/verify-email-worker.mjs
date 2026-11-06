// Authorized GET-only rollout handshake. Never POSTs, claims jobs or sends.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const settings = parseEnv(readFileSync("supabase/.env.local", "utf8"));
if (!settings.SCHEDULER_SECRET) {
  console.error("Missing SCHEDULER_SECRET; no request made.");
  process.exit(1);
}
try {
  const response = await fetch(
    "https://ylpioamwlgunckivzwof.supabase.co/functions/v1/scheduled-messaging",
    {
      method: "GET",
      headers: { Authorization: `Bearer ${settings.SCHEDULER_SECRET}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  let body = {};
  try {
    body = await response.json();
  } catch {
    /* Never dump an unexpected body. */
  }
  const valid =
    response.status === 200 &&
    body.emailSafetyRevision === "20261027202242" &&
    body.sending === false;
  console.log(
    JSON.stringify({
      http: response.status,
      revisionMatches: valid,
      sending: body.sending === false ? false : "unconfirmed",
      operation: "GET_only",
    }),
  );
  if (!valid) process.exitCode = 1;
} catch {
  console.error("Safety handshake unavailable; no POST or send attempted.");
  process.exitCode = 1;
}

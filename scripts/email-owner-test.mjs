// Preview by default. --send must be authorized separately by the owner.
// Reads only an ignored, operator-maintained config file; never prints its values.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
const args = process.argv.slice(2);
if (args.some((arg) => !["--send", "--preview"].includes(arg))) {
  console.error("Usage: node scripts/email-owner-test.mjs [--preview|--send]");
  process.exit(1);
}
if (args.includes("--send") && args.includes("--preview")) {
  console.error("Choose exactly one operation.");
  process.exit(1);
}
const settings = parseEnv(
  readFileSync("supabase/.env.email-test.local", "utf8"),
);
const send = args.includes("--send");
if (send && settings.OWNER_APPROVED_SEND !== "true") {
  console.error(
    "Send blocked: OWNER_APPROVED_SEND must explicitly authorize this run.",
  );
  process.exit(1);
}
const {
  FUNCTION_BASE_URL,
  SCHEDULER_SECRET,
  EMAIL_TEST_RUN_ID,
  EMAIL_TEST_RECIPIENT,
  EMAIL_TEST_LANGUAGE,
} = settings;
if (
  !FUNCTION_BASE_URL ||
  !SCHEDULER_SECRET ||
  !EMAIL_TEST_RUN_ID ||
  !EMAIL_TEST_RECIPIENT ||
  !["en", "es"].includes(EMAIL_TEST_LANGUAGE)
) {
  console.error("Missing controlled-test configuration; no request sent.");
  process.exit(1);
}
try {
  const base = new URL(FUNCTION_BASE_URL);
  if (
    base.protocol !== "https:" ||
    base.hostname !== "ylpioamwlgunckivzwof.supabase.co" ||
    base.pathname !== "/functions/v1" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new Error();
  // Never POST to a legacy worker: it ignores preview and could drain backlog.
  // GET has always been read-only; a legacy deployment returns 405.
  const target = `${base.origin}${base.pathname}/scheduled-messaging`;
  const probe = await fetch(target, {
    method: "GET",
    headers: { Authorization: `Bearer ${SCHEDULER_SECRET}` },
    signal: AbortSignal.timeout(10000),
  });
  if (
    !probe.ok ||
    (await probe.json()).emailSafetyRevision !== "20261027202242"
  ) {
    console.error(
      "Controlled test blocked: email-safety revision is not deployed. No POST or send was attempted.",
    );
    process.exit(1);
  }
  const response = await fetch(
    `${base.origin}${base.pathname}/scheduled-messaging`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SCHEDULER_SECRET}`,
      },
      body: JSON.stringify({
        operation: send ? "controlled_test_send" : "controlled_test_preview",
        runId: EMAIL_TEST_RUN_ID,
        recipient: EMAIL_TEST_RECIPIENT,
        language: EMAIL_TEST_LANGUAGE,
      }),
      signal: AbortSignal.timeout(30000),
    },
  );
  const result = await response.json();
  // Whitelist safe response fields. Never dump a provider body or private link.
  console.log(
    JSON.stringify(
      {
        http: response.status,
        success: result.success,
        mode: result.data?.mode,
        claimed: result.data?.claimed,
        results: result.data?.results,
        recipientAllowlisted: result.data?.recipientAllowlisted,
        senderDomainCompatible: result.data?.senderDomainCompatible,
        backlogProcessing: result.data?.backlogProcessing,
        errorCode: result.error?.code,
        configurationFields: result.error?.configurationFields,
      },
      null,
      2,
    ),
  );
  if (!response.ok || result.success !== true) process.exitCode = 1;
} catch {
  console.error(
    "Controlled-test response unavailable. Do not change the run ID or retry outside the delivery deadline. Inspect protected job audit and Resend first.",
  );
  process.exitCode = 1;
}

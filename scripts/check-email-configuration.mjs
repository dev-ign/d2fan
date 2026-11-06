// Read-only. Never prints secret values, digests, sender or support addresses.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
const file = process.argv[2] || "supabase/.env.local";
const local = parseEnv(readFileSync(file, "utf8"));
const result = spawnSync(
  "supabase",
  [
    "secrets",
    "list",
    "--project-ref",
    "ylpioamwlgunckivzwof",
    "--output",
    "json",
  ],
  { encoding: "utf8" },
);
if (result.status !== 0) {
  console.error("Configuration inventory unavailable; no values printed.");
  process.exit(1);
}
const rows = new Map(
  JSON.parse(result.stdout).map((row) => [row.name, row.digest || row.value]),
);
const hash = (value) =>
  createHash("sha256")
    .update(value || "")
    .digest("hex");
const names = [
  "EMAIL_PROVIDER_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "SUPPORT_EMAIL",
  "BUSINESS_POSTAL_ADDRESS",
  "PUBLIC_SITE_URL",
  "SCHEDULER_SECRET",
  "ACCESS_TOKEN_SECRET",
  "EMAIL_DELIVERY_ENABLED",
  "EMAIL_MARKETING_ENABLED",
  "EMAIL_TEST_RECIPIENT",
  "EMAIL_TEST_RUN_ID",
  "EMAIL_TEST_SEND_ENABLED",
];
const presence = names.map((name) => ({
  name,
  exists: rows.has(name),
  nonempty: rows.has(name) && rows.get(name) !== hash(""),
}));
const senderMatches =
  Boolean(local.EMAIL_FROM_ADDRESS) &&
  rows.get("EMAIL_FROM_ADDRESS") === hash(local.EMAIL_FROM_ADDRESS);
const supportMatches =
  Boolean(local.SUPPORT_EMAIL) &&
  rows.get("SUPPORT_EMAIL") === hash(local.SUPPORT_EMAIL);
const sender = (local.EMAIL_FROM_ADDRESS || "")
  .trim()
  .match(/^(?:[^<>\r\n]+<([^<>\r\n]+)>|([^<>\s]+))$/);
const approvedSender = "music@jonaferreira.com";
const quotedLocalMatches =
  rows.get("EMAIL_FROM_ADDRESS") ===
  hash(JSON.stringify(local.EMAIL_FROM_ADDRESS || ""));
const bareSenderMatches =
  rows.get("EMAIL_FROM_ADDRESS") === hash(approvedSender);
const knownSender = bareSenderMatches
  ? approvedSender
  : senderMatches
    ? local.EMAIL_FROM_ADDRESS
    : quotedLocalMatches
      ? JSON.stringify(local.EMAIL_FROM_ADDRESS)
      : null;
const compatible =
  bareSenderMatches ||
  ((senderMatches || quotedLocalMatches) &&
    (sender?.[1] || sender?.[2] || "")
      .trim()
      .toLowerCase()
      .match(/^[^<>,;:\s@]+@jonaferreira\.com$/) !== null);
const senderFormatValid =
  knownSender === null ? null : !quotedLocalMatches && compatible;
const supportCandidates = [
  ...new Set(
    (local.SUPPORT_EMAIL || "").match(
      /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    ) || [],
  ),
];
const supportCanonicalMatches =
  supportCandidates.length === 1 &&
  rows.get("SUPPORT_EMAIL") === hash(supportCandidates[0].toLowerCase());
const knownSupport = supportMatches
  ? local.SUPPORT_EMAIL
  : supportCanonicalMatches
    ? supportCandidates[0].toLowerCase()
    : null;
const supportFormatValid =
  knownSupport === null
    ? null
    : /^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/.test(knownSupport);
const deliverySwitches = Object.fromEntries(
  [
    "EMAIL_DELIVERY_ENABLED",
    "EMAIL_MARKETING_ENABLED",
    "EMAIL_TEST_SEND_ENABLED",
  ].map((name) => [
    name,
    !rows.has(name)
      ? "absent_fail_closed_in_new_worker"
      : rows.get(name) === hash("false")
        ? "false"
        : rows.get(name) === hash("true")
          ? "true"
          : "invalid_or_unknown",
  ]),
);
let publicOriginSafe = null;
if (
  local.PUBLIC_SITE_URL &&
  rows.get("PUBLIC_SITE_URL") === hash(local.PUBLIC_SITE_URL)
) {
  try {
    const u = new URL(local.PUBLIC_SITE_URL);
    publicOriginSafe =
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      u.pathname === "/" &&
      !u.search &&
      !u.hash;
  } catch {
    publicOriginSafe = false;
  }
}
console.log(
  JSON.stringify(
    {
      presence,
      senderValueMatched: senderMatches,
      localSenderAvailable: Boolean(local.EMAIL_FROM_ADDRESS),
      senderDomainCompatible: compatible,
      senderFormatValid,
      senderMismatchReason: quotedLocalMatches
        ? "hosted_literal_double_quotes"
        : bareSenderMatches && !senderMatches
          ? "local_display_name_vs_approved_bare_sender"
          : senderMatches
            ? null
            : "unknown",
      supportMailboxValueMatched: supportMatches,
      supportFormatValid,
      supportFormattingIssue:
        supportMatches && !supportFormatValid && supportCandidates.length === 1
          ? "wrapped_mailbox_requires_bare_address"
          : null,
      deliverySwitches,
      publicOriginSafe,
      providerAuthentication: "not_exercised",
      supportMailboxMonitored: "owner_must_confirm",
    },
    null,
    2,
  ),
);
if (
  compatible !== true ||
  senderFormatValid !== true ||
  supportFormatValid !== true ||
  publicOriginSafe !== true
)
  process.exitCode = 2;

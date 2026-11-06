// Compare only protected/immutable fingerprints. No addresses or payloads printed.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const before = JSON.parse(
  readFileSync("artifacts/email-rollout/before.json", "utf8"),
);
const after = JSON.parse(
  readFileSync("artifacts/email-rollout/after.json", "utf8"),
);
assert.deepEqual(
  after.protected,
  before.protected,
  "STOP: fan, consent or financial records changed; review before proceeding",
);
assert.deepEqual(
  after.delivery_immutable,
  before.delivery_immutable,
  "STOP: immutable delivery records changed",
);
console.log(
  "PASS: complete fan/consent/financial records and immutable delivery data preserved.",
);

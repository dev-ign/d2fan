# Developer guide

Start with `docs/integrations/SETUP_GUIDE.md`. No provider credentials or licensed private content are included.

## Content and configuration

- Add releases in `src/data/content.ts`, including slug, date, public art, preview and verified streaming URLs. `ContentRepository` powers Music, Hero, release routes and the global audio player. Do not import fixtures from feature components. Unsupported platform URLs are omitted; existing social search links remain labeled as searches until the owner supplies verified profiles.
- Public Vault metadata also lives in that file; prices, availability, support presets/min/max and canonical artist ID live in **one** `supabase/shared/catalog.json`, imported by browser and Edge Functions. No component accepts a price as payment authority.
- Add a matching catalog row and visual metadata for a new item. Private content paths belong only in `PRIVATE_FILE_PATHS`. Upload real licensed files to `vault-private`; test delivery before switching availability to `available` and deploying both sides.
- New UI translations: `src/config/messages.ts`. Editable bilingual email content: `supabase/functions/_shared/templates.ts`. Reminder logic: `schedule_reminders()` plus the worker. No broadcast builder exists.

## API and payment flow

Capture validates/normalizes input, atomically resolves a fan and idempotent capture request, records permission requests/events and queues email. It returns only a scoped capture capability, not fan data. Checkout validates that token, locks request identity with the attempt ID, enforces server price/min/max, persists contact before calling Stripe, then returns a hosted URL and status capability. On retries keep the same request ID and unchanged body. If the body changes, use a new ID. The UI does this deliberately.

Raw signed webhooks retrieve the current Stripe session and call `fulfill_checkout()` only for paid sessions. Purchase/entitlement/event/job/receipt writes are atomic; retries are deduplicated by SQL constraints. A tip creates no entitlement. A refunded purchase stays refunded even when a delayed success event is replayed. Full refund revokes access unless another paid purchase of the same item maintains it; partial refund leaves access intact. The owner must publish the actual refund policy before launch.

Return status requires a scoped capability; a Stripe session ID or email alone is insufficient. Private redemption rechecks entitlement and produces a five minute signed URL. Email recovery only sends links to the stored purchase email. No public endpoint returns fan lists or purchases by arbitrary email.

## Inspect and troubleshoot (privileged operator only)

Use the Supabase SQL editor with your authorized account. Filter every query to the canonical artist.

```sql
select id, email_normalized, preferred_language, email_verified_at, created_at
from public.fans order by created_at desc limit 50;
select id, fan_id, purpose, amount_minor, status, stripe_session_id, created_at
from public.checkout_attempts order by created_at desc limit 50;
select id, fan_id, status, vault_item_slug, amount_minor, paid_at
from public.purchases order by paid_at desc limit 50;
select item_slug, fan_id, status, purchase_id from public.vault_unlocks;
select id, kind, status, attempts, available_at, last_error, provider_id
from public.delivery_jobs order by created_at desc limit 50;
```

Do not screenshot/export private payload columns. A capture can succeed while email is pending; inspect the job and provider dashboard. `sent` means provider acceptance. Missing assets deliberately fail delivery; configure the map and upload before retry. Missing keys produce recoverable errors. A webhook 503 means processing failed; fix the underlying row/configuration and replay through Stripe. Never manually mark an attempt paid or grant an unlock to make the UI pass.

For failed jobs, inspect Resend suppression status, sender/domain, object paths, function logs' generic failure codes and Cron runs. Automatic retries: six attempts with backoff. For a failed job still inside the provider idempotency window and with a valid frozen token, reset its status/attempts/available_at using a privileged operation only after fixing the cause. Keep `dedupe_key` and body unchanged. Outside 24h, first confirm provider delivery using its dashboard. A manual resend must use a new audited job/key with fresh links; it can duplicate an already delivered message, so do not reset blindly. For purchase recovery prefer requesting a fresh access email through the website.

## Consent, export and data requests

`supabase/tests/export-consented.sql` is an operator query for verified, currently opted-in email contacts, language and attribution. Run it in the SQL editor, export results to CSV, and send outside this system. Do not expose it as a public endpoint/view. Recheck suppression lists before sending and honor subsequent unsubscribe requests; delete temporary CSVs after the approved task. Neutralize spreadsheet formula prefixes before opening untrusted contact fields in spreadsheet software.

Contact correction/channel linking requires proof of ownership. Never merge identities because a public form supplies someone else's email or phone. Handle deletion through a privileged, audited operator process: verify inbox ownership, stop queued marketing, pseudonymize fan/event personal data while preserving payment records required for accounting, revoke access/consent as appropriate, and apply provider deletion/suppression rules. Check retention obligations with the owner before deleting financial records.

## Run verification

```sh
nvm use
npm ci
npm run typecheck
npm run lint
npm run build
npm test
npm run test:db
# Install Deno 2.9.6, then:
npm run test:edge
npx playwright install chromium
npm run test:e2e
# Start npm run dev on port 4173 before visual QA:
npm run qa:visual
```

`test:db` uses PGlite (embedded PostgreSQL) to execute the migration and negative role/RPC checks; pgcrypto/storage infrastructure is substituted in that test. It does not certify hosted Supabase storage or a real provider. `test:edge` typechecks all functions and checks capabilities/input/origin/worker authorization/forged signatures. Browser payment/capture cases use explicit provider stubs; separate provider test-mode validation is mandatory. CI runs these without production secrets. No frontend Supabase or Stripe SDK was added.

## Rollback

Disable sales in the shared catalog first. Restore frontend and server to the same known revision. Preserve payment rows and webhook receipts. Migrations are forward-only; take a database backup before applying and use a reviewed corrective migration to recover. In an expendable **local** test stack, `supabase db reset` reconstructs from migration and deletes local test data. Never use reset against production. Rotate signing secrets with email-recovery instructions because existing links become invalid.

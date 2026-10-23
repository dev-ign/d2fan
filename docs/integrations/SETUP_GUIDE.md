# Connect your Phase 1 services

**Current status: CONFIGURATION REQUIRED.** No accounts were connected, no live payments activated, and no production deployment performed. The master prompt overrides the earlier checklist. Local code/tests do not establish provider test-mode success.

## What you need to provide

| Service  | You create/provide                                                          | Implemented here                                                                        | Configure here                                               | How to validate                                                    |
| -------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| Supabase | Separate test project and project ref; project URL/public key; server key   | Migration, RLS, 11 Edge Functions, private bucket                                       | `.env.local`, project Function Secrets, migration CLI        | Apply migration, deny anon direct reads, capture test contact      |
| Stripe   | Test/sandbox account, test secret, webhook signing secret                   | Hosted Checkout, bounded tips, canonical product price, verified/idempotent fulfillment | Supabase Function Secrets + Stripe Webhooks                  | Actual test-card purchase, replay, refund                          |
| Resend   | Account, verified sending domain/DNS, sender, support email, postal address | Bilingual transactional/confirmation/welcome/reminder templates and durable retries     | Function Secrets                                             | Send to a permitted test recipient; check inbox/provider dashboard |
| Meta     | Dataset/Pixel ID, CAPI token, supported Graph version, test-event code      | Optional Pixel/CAPI with shared event IDs                                               | Public Pixel env + Function Secrets                          | Opt-in Test Events journey, deduplication, withdrawal              |
| WhatsApp | Approved Meta/BSP integration and verified business/phone + templates       | Honest disabled UI; no fake send/phone trust                                            | Future adapter work described below                          | Remains disabled until code and provider checks exist              |
| Content  | Licensed free wallpaper AND licensed paid pack                              | Private delivery/recovery system and closed paid catalog                                | Private bucket, file-map secret, shared catalog availability | Redeem/revoke in test project before opening sales                 |
| Hosting  | Your selected static host and final site origin                             | Vite production build; portable SPA configuration instructions                          | Host env + route fallback                                    | Reload `/music/accion` and test redirect/recovery                  |
| Git      | Intended repository and authorized branch/remote                            | Files ready for review                                                                  | Restore `.git` or initialize your intended repo              | Review diff, commit, push explicitly to the intended remote        |

## 1. Local runtime and environment

Use Node from `.nvmrc` (24.22.1) or another supported runtime matching package engines; system Node 22.9 is too old for the installed jsdom dependencies. `nvm install && nvm use`, then:

```sh
npm ci
cp .env.example .env.local
cp supabase/.env.example supabase/.env.local
npm run dev
```

Keep both local env files private. Public Vite variables are embedded in the browser build. Never put a Stripe secret, service-role/secret key, Resend key, access-signing secret, scheduler secret or CAPI token in a `VITE_*` variable.

Fill `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; optional `VITE_META_PIXEL_ID`. Public site origin is configured on the server as `PUBLIC_SITE_URL`. A Stripe publishable key is unnecessary because Checkout is hosted.

## 2. Supabase test project

1. Create a test project in your Supabase organization. Save its project reference, URL and publishable key. Keep database password/server keys in your password manager.
2. Install the official Supabase CLI. From this folder run:

```sh
supabase login
supabase link --project-ref YOUR_TEST_PROJECT_REF
supabase db push
```

3. The migration creates `vault-private` as a **private** bucket and sensitive tables with RLS and no anon/authenticated table or RPC access. Verify in Dashboard → Database → Tables and Storage. Do not add permissive policies or make the bucket public.
4. Copy the server example to a private env file. Generate **three distinct** random values (`openssl rand -hex 32`) for `ACCESS_TOKEN_SECRET`, `RATE_LIMIT_SALT`, and `SCHEDULER_SECRET`. Do not share these in screenshots or chat.
5. Set `PUBLIC_SITE_URL` to your test frontend origin (scheme + hostname + optional port). `ALLOWED_ORIGINS` is a comma-separated exact-origin list, no trailing slash. For local frontend use `http://localhost:5173` and/or the actual `127.0.0.1` origin.
6. `SUPABASE_URL` and legacy `SUPABASE_SERVICE_ROLE_KEY` are injected into functions. Prefer setting `SB_SECRET_KEY` to a current secret key as an override if your project disables legacy keys. Custom secret names must not use the reserved `SUPABASE_` prefix. Never copy either privileged key into Vite.
7. Set project secrets and deploy:

```sh
supabase secrets set --env-file supabase/.env.local
supabase functions deploy
```

`verify_jwt=false` is intentional for public anonymous endpoints and Stripe. It is not authorization: public endpoints validate origin/input/rate, private operations require signed scopes, the worker checks `SCHEDULER_SECRET`, and Stripe verifies its raw-body signature. Supabase publishable keys identify the project; they do not prove fan ownership. See [Supabase function authentication](https://supabase.com/docs/guides/functions/auth).

For a fully local stack, install Docker, run `supabase start`, `supabase db reset`, and `supabase functions serve --env-file supabase/.env.local`. Use the local URL/keys from `supabase status`; do not paste status output containing keys into a public report. The migration's storage schema exists in a real Supabase stack; the embedded SQL test substitutes only that infrastructure schema.

## 3. Private content: required before sales

1. Supply licensed originals. Existing `public/assets/raw-vault-3.jpg` is a public preview, not a private pack. No exclusive has been fabricated.
2. In Dashboard → Storage → `vault-private`, upload the free wallpaper under `rewards/accion-wallpaper.jpg` and a distinct paid pack under `paid/accion-wallpaper-pack.zip`, or choose your own paths.
3. Set `PRIVATE_FILE_PATHS` to a JSON mapping with `lead-magnet` and `accion-wallpaper`. Object paths stay server-only. Do not upload paid originals under `public/` or include them in the frontend bundle.
4. Redeem the free reward and inspect the exact downloaded file. In the isolated test project, set only `accion-wallpaper` availability to `available` in `supabase/shared/catalog.json`, redeploy functions, rebuild the frontend, and complete a Stripe test purchase.
5. Confirm private direct URLs fail, signed downloads work, replay is harmless, email recovery works, and full refunds revoke access. Only then retain `available` for release. Other missing items stay `coming_soon`.

## 4. Stripe sandbox / test mode

1. Create or select your Stripe test environment. Use its **test secret** (`sk_test_...`) in `STRIPE_SECRET_KEY`. Do not enable live mode.
2. In Stripe Workbench → Webhooks/Event destinations, add `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`.
3. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and `charge.refunded`.
4. Put that destination's `whsec_...` signing secret in `STRIPE_WEBHOOK_SECRET`. Each destination/local listener has a different secret.
5. For Stripe’s own receipts, review Dashboard → Customer emails → successful payment receipts in your test environment. The app also queues its own transactional confirmation. No manual Stripe Price records are required: the server constructs Checkout price data from the shared catalog and records the exact amount on the attempt. Tips are $5–$1,000, integer cents. Hosted card Checkout presents eligible Apple Pay/Google Pay automatically according to Stripe account, device/browser and region eligibility. Verify those wallets in your test environment; availability is not guaranteed.
6. Local forwarding:

```sh
stripe login
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Use the listener's printed signing secret in local function secrets. Create the session through **this site**, then use Stripe's `4242 4242 4242 4242` test card, future expiry, and any valid CVC. A generic CLI-created test event has no app attempt metadata and cannot validate this fulfillment flow.

Confirm a single purchase, correct unlock, outbox job, verified in-page return, and email. Resend the actual event from Workbench; verify counts remain unchanged. Test declined card, cancellation, expiry, async notification if enabled, and refund. The [Stripe fulfillment guide](https://docs.stripe.com/checkout/fulfillment) explains why webhooks, rather than redirects, are the payment authority.

## 5. Resend email

1. Create a Resend account and add your sending domain. Install the DNS records Resend supplies (SPF/DKIM; configure an appropriate DMARC policy with your domain operator). Wait for verified status.
2. Create a sending API key. Set `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS` (for example your verified `Jona <music@your-domain>`), `SUPPORT_EMAIL` (monitored), and `BUSINESS_POSTAL_ADDRESS` (real business mailing address, used in marketing messages).
3. Before domain verification, Resend test restrictions limit recipients. Use an allowed test inbox. Do not assume arbitrary recipients work in sandbox.
4. Run the worker after capture/purchase, or enable the schedule below. Verify the provider dashboard AND your inbox. `delivery_jobs.status=sent` means API acceptance, not guaranteed inbox delivery. This implementation does not ingest bounce/complaint webhooks; inspect provider suppression/bounce data before any manual broadcasts and never bypass suppression.
5. Email marketing is unchecked by default. A confirmation link plus explicit confirmation button grants permission; unsubscribe link plus button revokes it. Purchases do not require marketing opt-in. Receipts/access are transactional. Welcome and reminder jobs recheck current permission just before sending.
6. Resend retries use frozen bodies and stable keys. [Provider idempotency lasts 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys); our six-attempt automatic retry window is bounded within it. Do not blindly reset old jobs outside that window. See developer recovery instructions.

## 6. Schedule the delivery worker

**Required for delivery:** invoke `scheduled-messaging` every minute. It checks expiry, enqueues the one eligible +24h reminder, then claims pending delivery jobs. Each call processes at most ten rows. The interval can yield up to one minute plus provider latency; a sub-minute inbox SLA is not guaranteed.

Use Supabase Cron + pg_net and Supabase Vault. In the test project's SQL editor enable `pg_cron`, `pg_net`, and `supabase_vault` through Extensions first. Create Vault secrets named `phase1_function_base` (value `https://YOUR_PROJECT_REF.supabase.co/functions/v1`) and `phase1_scheduler_secret` (same private `SCHEDULER_SECRET` used by the function). Create them through the Dashboard Vault UI so secret literals are not left in query history. Then run:

```sql
select cron.schedule('phase1-delivery-every-minute', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='phase1_function_base') || '/scheduled-messaging',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='phase1_scheduler_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);
```

Check Cron history, `net._http_response`, and private job rows for failures without copying secrets or contact payloads. Pause with `select cron.unschedule('phase1-delivery-every-minute');`. An authorized external scheduler can use the same endpoint/Bearer secret. Never expose this secret to the browser.

## 7. Meta Pixel / CAPI

1. In Events Manager create/select your dataset/Pixel. Set its numeric ID in both `VITE_META_PIXEL_ID` and server `META_PIXEL_ID`.
2. Generate an authorized CAPI access token; set only server `META_CAPI_ACCESS_TOKEN`. Choose a supported version from your Meta app as `META_API_VERSION` (for example the version shown by your current app dashboard; do not guess a deprecated version). Set `META_TEST_EVENT_CODE` from Test Events.
3. Rebuild the frontend after public env changes and redeploy secrets. Start with campaign measurement **off**: there should be no Pixel script/events. Enable it via the footer control and walk the capture/checkout journey.
4. Compare `event_name` + `event_id`: Lead and InitiateCheckout have browser/server pairs, Purchase has a browser pair if the return loads, VaultUnlock is server-only. Inspect Test Events for deduplication and correct value/currency. Disable measurement and verify future browser events stop. Email marketing permission is a separate control.
5. Never add email/phone or access tokens to campaign URLs. Withdrawal cancels matching queued jobs using this browser’s scoped tokens; in-flight/sent events cannot be recalled. Inspect the privacy review before launch. Configure your real privacy disclosures and jurisdiction-appropriate consent requirements. Meta is optional; leave env values blank if you do not want measurement yet.

Official reference: [Meta event deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/). The documentation endpoint was rate-limited during implementation; actual payload acceptance remains a provider test gate.

## 8. WhatsApp: intentionally disabled

No provider or verified phone flow was supplied, so **there is no active WhatsApp adapter to enable with a flag**. Fans see WhatsApp coming soon and explicitly choose email. No phone records or fictional WhatsApp sends are created.

To enable later within this scope: choose Meta WhatsApp Cloud API or an approved BSP (for example Twilio), create/verify the business portfolio and WABA, register/verify your sending phone, configure official webhook verification and request-signature checks, obtain least-privilege credentials, approve ES/EN delivery/marketing templates where required, implement phone ownership verification (OTP), then add the typed adapter + retry/status mapping. Required variables depend on the chosen provider: typically business/phone number ID, access token, webhook verify secret, app secret, and template IDs/language codes. Do not invent credentials in `.env.example` for an adapter that does not exist.

Test sandbox recipient allowlists and template/customer-service-window restrictions with the provider. Confirm separate WhatsApp opt-in, phone verification, revocation, and permission-safe channel linking before enabling the radio option. Email is offered as an explicit alternative, never silently substituted.

## 9. Hosting / release

No hosting provider configuration exists in the source. Use your chosen static host with `npm ci && npm run build`, output directory `dist`, and an SPA fallback to `index.html` for `/music/*` and homepage recovery fragments. Serve HTTPS, use the final origin in provider settings, and test direct release reloads. Do not add secret server env values to the static host build environment.

Apply migrations in a test project first; back up before production migration. Deploy server functions and frontend from the same catalog revision. Keep test and live keys/projects separate. Set a restrictive referrer policy (`no-referrer`), no caching of API responses, and a CSP validated against your fonts/media/Meta needs. Roll back frontend/functions together; disable item availability before rolling back commerce. Never delete successful purchase/entitlement rows as a rollback.

## 10. Final owner validation checklist

- [ ] Provide/restore intended Git repo, branch and remote.
- [ ] Create test Supabase project; apply migration, deploy functions and verify negative RLS/storage access.
- [ ] Upload licensed distinct free and paid files; set private file-map secret.
- [ ] Configure Stripe test keys/webhook and complete actual $5 item purchase + replay/refund.
- [ ] Verify Resend domain/sender and configure support/postal details.
- [ ] Activate minute worker schedule and confirm receipt, magnet, permission confirmation, welcome, recovery and one eligible reminder in actual inbox.
- [ ] Optional: configure Meta and inspect Test Events/deduplication.
- [ ] Keep WhatsApp disabled until its provider and verification implementation pass tests.
- [ ] Select hosting, configure HTTPS/origin/SPA fallback, run the complete test journey there.
- [ ] Review privacy/refund/tax wording and policies before live sale; authorize live activation separately.

# Maintained sandbox payment workflow

Use Node from `.nvmrc` and Deno 2.9.6. Ordinary `npm run dev` keeps all paid Vault items coming soon. Support contributions use the configured Stripe environment; there is no global runtime live-mode switch. Keep the existing test credentials and closed catalog until a separate launch decision.

## Operator runner

`npm run dev:payments` is an explicitly invoked payment tool, not a mock test. It reads the ignored frontend/backend env files, verifies the existing named sandbox account through Stripe's Account API, then starts Vite and a Deno adapter on loopback. Do not run it as part of unattended CI or auditing.

The backend env needs `STRIPE_SECRET_KEY` from that same sandbox, `SB_SECRET_KEY`, `ACCESS_TOKEN_SECRET`, `RATE_LIMIT_SALT`, `PRIVATE_FILE_PATHS`, and optional `DENO_BIN`. The frontend env needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Secrets never belong in `VITE_*`. Use the existing hosted webhook; do not replace its signing secret with a local listener's secret.

The runner prints a private one-hour localhost operator link. Opening it authorizes only Acción at the server-owned price of 500 USD cents. The separate `ACCION_TEST_TOKEN_SECRET` is generated for each run; `ACCION_TEST_CHECKOUT` is set only on the Deno process. Neither is an ordinary deployment setting. Restarting invalidates old operator capabilities without rotating ordinary fan access secrets.

Authorization checks signature, scope, artist, item, expiry, maximum one-hour lifetime, exact localhost origin, server flag, and test-key prefix. The adapter binds `127.0.0.1:54324`, checks Host, and wraps existing handlers. Capture disables marketing/measurement. Production Vite builds remove the test API path. Never deploy `scripts/payment-test-server.ts`.

Keep the adapter running while using the return/status/download flow. The browser must receive verified database completion before download is offered. Status refresh issues a fresh 15-minute access capability; redemption rechecks purchase and active entitlement and returns a five-minute signed Storage URL. A browser redirect or Stripe Session ID alone never grants access.

## Controlled provider validation

Only after explicit authorization, open the runner's link, select Acción, enter an owner-controlled recipient, and inspect the hosted Stripe test Checkout before using Stripe's documented successful or declined test card. Real provider tests create actual sandbox fan/attempt/payment records; preserve them. Marketing and measurement stay off. Replay, refunds, additional purchases and outgoing email require their own scope.

The existing webhook destination must subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, and `charge.refunded`. Both its Stripe key and signing secret must match the same sandbox. The source contains the deliberate sandbox account pin for startup verification; it is an identifier, not a credential.

## Regression commands

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:edge
PHASE1_POSTGRES_BIN=/path/to/postgresql-17/bin npm run test:db
npm run test:e2e
npm run test:payments
```

`test:payments` uses mocked provider responses and never invokes the operator runner. Both Playwright configurations support `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. `test:db` uses PGlite plus a private disposable PostgreSQL cluster for real lock/concurrency tests; it ignores ambient database connection settings and never uses the hosted database.

## Verified baseline and evidence

On October 25, 2026, the recorded controlled test completed one $5 Acción purchase, database fulfillment, browser confirmation and purchaser ZIP download. The historical download matched its recorded checksum/CRC; signed-link expiry and refresh were recorded. A declined card and cancelled return produced no purchase or entitlement. October 27 read-only checks independently confirm the paid test Session, matching paid purchase, one active entitlement, one purchase job, card-declined provider event, and the other Session's subsequent unpaid expiry. Both private files deny direct access.

No provider-backed tip, refund, replay or asynchronous-payment test is established. Refund, replay, tip isolation and concurrency have local SQL/adapter coverage. See [the current audit](../PHASE_1_AUDIT.md) for the exact evidence classification. Raw identifiers, screenshots, private download files and historical session notes stay local under `artifacts/` and the ignored root `PAYMENT_TESTING.md`; they are not required in a public repository.

Stop the runner to return to the ordinary closed-catalog experience. Preserve purchase, entitlement and webhook records. Do not reset the database or rotate `ACCESS_TOKEN_SECRET` as a rollback.

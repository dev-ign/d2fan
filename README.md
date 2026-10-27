# Jona Ferreira — direct to fan

React + TypeScript + Vite, one shared native audio engine, typed local content, and a Supabase Edge Function backend for Phase 1 fan capture and commerce.

Start with the [October 27 Phase 1 audit and Resend handoff](docs/PHASE_1_AUDIT.md) for current verification status. The original checklist is preserved in the [service connection guide](docs/integrations/SETUP_GUIDE.md).

The existing Supabase test project has both migrations and eleven deployed functions. The Stripe sandbox has one verified paid-item purchase; refund, replay, tip and asynchronous provider tests remain open. Resend delivery and scheduling are not validated or activated. WhatsApp stays disabled until an approved verified-phone integration exists.

```sh
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Use the Node version in `.nvmrc`; system Node 22.9 does not support the installed test dependency chain. Frontend env values are public. Server keys belong only in Supabase function secrets.

```sh
npm run typecheck
npm run lint
npm run build
npm test
npm run test:db
# Deno 2.9.6:
npm run test:edge
npx playwright install chromium
npm run test:e2e
npm run test:payments
```

- [Architecture](docs/architecture/PHASE_1_ARCHITECTURE.md)
- [Developer/content/operator guide](docs/PHASE_1_DEVELOPER_GUIDE.md)
- [Fan walkthrough](docs/PHASE_1_FAN_WALKTHROUGH.md)
- [Implementation report and acceptance status](docs/PHASE_1_IMPLEMENTATION_REPORT.md)
- [Provider validation checklist](docs/qa/PROVIDER_ACCEPTANCE.md)
- [Security/privacy and retention](docs/qa/SECURITY_AND_PRIVACY.md)
- [Controlled payment testing](docs/development/PAYMENT_TESTING.md)
- [Media, source masters and locale maintenance](docs/development/MEDIA_AND_LOCALE.md)

The private bucket contains the free reward and Acción paid pack. All public paid catalog items remain coming soon; the local operator runner deliberately enables only controlled sandbox testing. Do not sell public preview art as an exclusive. Camera/portrait masters stay in ignored `source-media/`; optimized runtime media is tracked. Private reward/paid files are absent from `public/`.

Use the supported Node runtime in `.nvmrc`. `test:db` needs working PostgreSQL binaries for its isolated concurrency suite; set `PHASE1_POSTGRES_BIN=/path/to/postgresql-17/bin` if the default installation is broken. Tests use local/mock boundaries and do not authorize new provider payments or email.

Git is on `main` with the existing `origin` remote. The audit prepares reviewed changes for an owner-approved commit; it does not commit, push, deploy or enable live payments.

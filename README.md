# Jona Ferreira — direct to fan

React + TypeScript + Vite, one shared native audio engine, typed local content, and a Supabase Edge Function backend for Phase 1 fan capture and commerce.

The October 23, 2026 master prompt takes precedence over the earlier checklist. See [implementation decisions](docs/IMPLEMENTATION_PLAN.md).

Start with [the service connection guide](docs/integrations/SETUP_GUIDE.md). It lists precisely what you must create for Supabase, Stripe test mode, Resend, optional Meta, licensed private content, scheduling and hosting. No external account is connected by this source tree. WhatsApp stays disabled until an approved verified-phone integration exists.

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
```

- [Architecture](docs/architecture/PHASE_1_ARCHITECTURE.md)
- [Developer/content/operator guide](docs/PHASE_1_DEVELOPER_GUIDE.md)
- [Fan walkthrough](docs/PHASE_1_FAN_WALKTHROUGH.md)
- [Implementation report and acceptance status](docs/PHASE_1_IMPLEMENTATION_REPORT.md)
- [Provider validation checklist](docs/qa/PROVIDER_ACCEPTANCE.md)
- [Security/privacy and retention](docs/qa/SECURITY_AND_PRIVACY.md)

Licensed private originals were not supplied. All paid catalog items remain coming soon. Do not sell the public preview art as an exclusive. Existing public images also have optimized WebP versions; no paid files are included in `public/`.

The supplied folder has no `.git` metadata or remote. No commits, pushes, production deployment or live payment activation were performed.
# d2fan

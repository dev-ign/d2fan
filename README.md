# Jona Ferreira — direct to fan

React + TypeScript + Vite, one shared native audio engine, typed local content, and a Supabase Edge Function backend for Phase 1 fan capture and commerce.

The artist site is live at [jonaferreira.com](https://jonaferreira.com). The November 18, 2026 accepted release enables fan-requested reward/confirmation delivery; marketing, test sends, commerce and schedulers remain disabled. Café is preserved for rollback. Local launch/evidence reports under `docs/` are intentionally ignored by Git and may be absent from a fresh clone; the production reproduction notes below are tracked.

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
- [Email safety fixes and controlled-test approval](docs/integrations/EMAIL_SAFETY_HANDOFF.md)
- [Media, source masters and locale maintenance](docs/development/MEDIA_AND_LOCALE.md)

The private bucket contains the free reward and Acción paid pack. All public paid catalog items remain coming soon; the local operator runner deliberately enables only controlled sandbox testing. Do not sell public preview art as an exclusive. Camera/portrait masters stay in ignored `source-media/`; optimized runtime media is tracked. Private reward/paid files are absent from `public/`.

Use the supported Node runtime in `.nvmrc`. `test:db` needs working PostgreSQL binaries for its isolated concurrency suite; set `PHASE1_POSTGRES_BIN=/path/to/postgresql-17/bin` if the default installation is broken. Tests use local/mock boundaries and do not authorize new provider payments or email.

## Accepted release and production configuration

- Frontend: Vercel project `d2fan-stage-a`, accepted CLI prebuilt deployment `dpl_Dsvm8adoEZeAsZs3iVfCnoDU4sLc`. The existing project is now connected to `dev-ign/d2fan`, with `main` as the production branch. The accepted prebuilt release has no deployment commit metadata; new Git builds record their source commit. Initial CI/CD setup keeps automatic production domain assignment off, so Git builds cannot replace the accepted live release until separate owner activation approval.
- Frontend reproduction uses the locked dependencies, supported Node runtime, and externally supplied `VITE_SUPABASE_URL` and public `VITE_SUPABASE_PUBLISHABLE_KEY`; `VITE_COMMERCE_ENABLED=false`. Preserve the accepted optional pixel setting. Never place a privileged key in `VITE_*`. The accepted build manifest remains in private release evidence; compare rebuilt files rather than inferring equivalence from a commit name.
- Supabase project `ylpioamwlgunckivzwof` has five migrations through `20261116232720_scoped_email_job_dispatch`. That migration is already applied; do not rerun it. Operational pre-hardening/drain files are historical, separately gated test/recovery inputs, not pending migrations.
- Hosted `PUBLIC_SITE_URL=https://jonaferreira.com`. `ALLOWED_ORIGINS` retains `http://localhost:5173`, `http://127.0.0.1:4173`, `https://d2fan-stage-2fvle4rhj-jonas-projects-ba33a3c2.vercel.app`, `https://jonaferreira.com` and `https://www.jonaferreira.com`. Configure these server-side; the SPA uses its own origin.
- Hosted `EMAIL_DELIVERY_ENABLED=true` is limited to fresh fan-requested reward/confirmation jobs. `EMAIL_MARKETING_ENABLED=false`, `EMAIL_TEST_SEND_ENABLED=false`, and `COMMERCE_ENABLED` is absent/false. Local example/send switches stay false. A scheduler credential authenticates the internal capture handoff; it does not authorize a scheduler or batch dispatch. Preserve sender/signing/storage credentials outside Git. Marketing requires a legitimate business postal address and separate activation approval.
- `vercel.json` contains the SPA rewrite only. External project routing owns `^/cafe/?$ → /`, HTTP 307 with `Cache-Control: no-store` (route `cafe-homepage-20261118`). Apex serves D2C; www redirects HTTP 308 to apex. Keep that rule outside the source rewrite and retain the `all_except_custom_domains` protection policy. Independent Vercel URLs stay protected.
- Café rollback target is `jfmusic` deployment `dpl_CPSTbY35tp2Nw9P3Yipmxzt5Pasn`. Before any public mail, pause delivery, restore the reviewed backend origin values, clear www's redirect before moving it back to Café, then move apex back with its former www 308 and disable only the new `/cafe` rule. After public mail, keep D2C serving already-issued root-fragment links; a full Café return requires a separately approved link-continuity solution. Never roll back fan/consent/audit data.

Supabase deploys versioned dependency closures rather than one shared source checkout. The accepted configuration revisions are capture v27, consent v24, worker v24 and checkout v22. The worker's entry/messaging/email-store modules and checkout's commerce denial entry match the reconciled source. Capture and consent retain older copies of unrelated exports in their bundles; the repository preserves the union of the accepted capture/consent logic and existing stronger test-mode/payment/status guards. Complete shared-module byte parity is not asserted. The worker handshake's `sending:false` describes that read-only request, not the live delivery switch. Preserve frozen accepted release payloads and review the exact affected closure before any future deployment.

## GitHub-to-Vercel workflow

Vercel builds this existing project natively from Git: `npm ci`, `npm run build`, output `dist`, Node 26.x. There is no separate Actions deployment pipeline. The existing **Phase 1 quality / verify** job continues to run on pushes and pull requests. The production-only Vercel Deployment Check **GitHub Actions quality** imports the exact commit's GitHub `verify` result and blocks production domain assignment until it passes (30-minute timeout). A failed or missing check must not be bypassed with Force Promote. [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks) enforce this gate; a green GitHub run alone is not the release policy.

1. Create a feature branch, make the scoped change, and run relevant local checks.
2. Push the branch and open a pull request. Vercel creates a protected preview, and GitHub runs the existing quality workflow.
3. Review the preview and require the quality job to pass before merging. No branch-protection rule is silently claimed by this documentation; the Vercel production gate remains authoritative even for direct main pushes.
4. Merge the approved change into `main`. Vercel builds with the production environment. During initial setup, **Auto-assign Custom Production Domains is disabled**: successful builds remain staged, and the accepted deployment keeps serving apex/www.
5. Before the first production release, obtain explicit owner approval for the reviewed deployment and activation of automatic domain assignment. Verify its commit, CI check and build settings first; enabling assignment can release an already-ready staged build. Do not enable it as a routine setup step.
6. After approved activation, main builds are released automatically only after the required Vercel GitHub check passes. Verify apex, www, `/cafe`, assets, languages and commerce-off behavior after release. On failure, use the accepted D2C target as rollback; `vercel rollback` disables automatic domain assignment, which must be deliberately restored before subsequent automatic releases. Preserve issued fan links and the separate Café rollback limitation above.

Vercel Production and Preview contain only the accepted browser-visible `VITE_SUPABASE_URL`, public publishable key, optional pixel setting and `VITE_COMMERCE_ENABLED=false`. No service-role, email-provider, Stripe, signing or scheduler credential belongs in Vercel's frontend build. Public configuration equality supports artifact comparison; it does not authorize preview fan-data writes. Preview origins are deliberately absent from Supabase's production allowlist, so review signup/consent/reward UI with existing mocked tests and read-only screens. Do not submit live fan forms, send test mail or add preview origins to production as part of UI review.

Git releases deploy the frontend only. Supabase migrations/functions, email or marketing activation, commerce, schedulers, DNS and project routing still require their own explicit authorization. The production `/cafe` rule, canonical domains and `all_except_custom_domains` protection are external project settings and must remain intact.

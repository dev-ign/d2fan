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

## Music catalog media and signup

The catalog in `src/data/content.ts` maps each release to its own preview. The player loads that file after the listener presses play. The six excerpts below were cut from local artist-supplied media, using entries after the opening and short fades. FFmpeg encoded them as stereo AAC-LC at 44.1 kHz in fast-start `.m4a` containers. Gain trims leave headroom after encoding.

| Release   | Source under `source-media/` | Excerpt         | Duration |   Bytes | Decode / true peak |
| --------- | ---------------------------- | --------------- | -------: | ------: | ------------------ |
| Shorty    | `shortyyy master 103.wav`    | 0:42.88–1:12.88 | 30.000 s | 863,440 | Pass / −1.3 dBTP   |
| Lalo      | `lalo-master-4.mp3`          | 0:27.97–0:57.97 | 30.000 s | 872,107 | Pass / −1.7 dBTP   |
| Sunday    | `sunday-master-clipped.wav`  | 0:11.07–0:41.07 | 30.000 s | 864,796 | Pass / −1.2 dBTP   |
| Fria      | `fria master 8.wav`          | 0:24.43–0:54.43 | 30.000 s | 867,041 | Pass / −1.3 dBTP   |
| Me Avisas | `Me Avisas Master.wav`       | 0:20.46–0:50.46 | 30.000 s | 892,006 | Pass / −0.5 dBTP   |
| 12 Uvas   | `12 uvas master.wav`         | 0:29.99–0:59.99 | 30.000 s | 868,836 | Pass / −2.2 dBTP   |

The supplied Fria WAV runs 2:24.38. Apple Music lists the distributed track at 2:30.02. The preview uses the supplied WAV. Playwright covers playback and release mapping for all six files in the shared player.

Sunday has no verified Amazon Music destination. The old Fria and Me Avisas Amazon listings do not resolve to a playable release in the tested storefronts. Their other platform links remain available.

The bilingual `/privacy` route describes the current flows and provides contact through the artist’s public Instagram account and the reply address in site emails. The owner should confirm that these channels are monitored for access, correction and deletion requests. The policy describes why records are retained. A formal retention schedule and a dedicated public privacy inbox require owner input before they can be documented.

The shared “Únete a la cultura” form requests the wallpaper and keeps marketing opt-in optional. `capture-fan` binds that choice to the request and records pending permission under consent copy version `2026-10-23`. The separate inbox confirmation grants permission. A future checkbox-free form would need a dedicated subscription action and server validation that records the new disclosure version and affirmative action on that request. Reward-only capture would continue to work independently.

## Weekly fan conversion scorecard

Use a complete Monday-to-Monday UTC week for each source. Compare the same date range, site origin and population week over week. No hosted historical counts were collected for this change.

| Metric | Source and counting rule | History |
| --- | --- | --- |
| Unique website visitors | Use an existing all-site unique visitor report if available. Meta `PageView` measures opted-in browser activity. Only use a unique count where the provider exposes one for the same period and origin. | Meta already received eligible activity when configured. All-site unique coverage was not established. |
| Preview starts and streaming interest | Meta `MusicPreviewStarted` after playback begins, once per playback until it ends or changes track. `DSPClick` counts outbound service clicks. Both support release, placement and language. | DSP clicks existed. Preview starts and the new breakdowns begin with the frontend release, where the Pixel is configured. |
| Signup visibility and intent | Meta `FanSignupViewed` at 50% form intersection and `FanSignupStarted` on the first email edit or checkbox change. Each counts once per mounted form with measurement consent. | Begins with the frontend release. |
| Reward requests and marketing intent | [Read-only Supabase scorecard](supabase/ops/fan_conversion_scorecard.sql). Count accepted `stay_close` capture requests once per request ID, with separate opt-in, wallpaper-only and unknown-intent counts. The scorecard also counts distinct wallpaper-only requesters. A fan can make both kinds of request in a week. Meta `Lead` is the existing capture campaign event and also covers support capture. | Supabase history exists where the evidence was retained. |
| Confirmed marketing fans and withdrawals | The same scorecard counts each verified fan’s first marketing grant and counts server-recorded revocation transitions separately. Repeat grants after a revocation do not count as new fans. | Supabase consent history already exists. |
| Wallpaper access | In Supabase Logs Explorer, select the same date range and count gateway `GET` responses with status 200 or 206 for the exact signed-object path of the configured `lead-magnet` in `vault-private`. Select only the count. | Limited to retained gateway logs. Historical coverage was not verified. [Supabase storage request fields](https://supabase.com/docs/guides/storage/serving/bandwidth) |

Calculate **new confirmed marketing fans per unique website visitor** only when the period has a verified all-site unique visitor denominator. It is a period rate, so a grant may follow a prior week’s visit. Without that denominator, report the two aggregate sources separately. For signup conversion, use the provider’s unique Lead and visitor counts only if they cover the same opted-in population and the Lead report can isolate website signup. Use form starts per view to spot friction. Wallpaper GETs can include repeats, ranges or automated fetches, so use access volume as an activation signal and leave the per-request fulfillment rate unavailable.

Use Supabase’s stored first-touch release and tagged campaign source for confirmed-fan counts by acquisition context. Use Pixel placement and release for onsite activity. These dimensions answer different questions and there is no cross-system fan-to-browser join. Anonymous events use the consent-gated browser Pixel. The SPA no longer calls the legacy anonymous CAPI endpoint, which included a forwarded IP. The existing capture and commerce conversion outbox retains its consent and event-ID contract.

### Email audiences and retention

Supabase remains authoritative for verified marketing consent. The current Resend adapter sends individual requested emails through the existing idempotent outbox. Phase 1 needs no audience sync. For a later approved pilot, use an isolated Segment for verified fans with current permission and check both Supabase and Resend for revocation, unsubscribe and suppression before writing membership. Resend Contacts are global by email. Contact updates can change the global unsubscribe flag and contact properties, and Topics hold separate subscription preferences. Segment membership has separate add/remove operations. Preserve global and topic opt-outs and remove membership on revocation. Avoid deletion/recreation as a sync mechanism. Resend documents skip and upsert behavior for CSV imports, but its single-contact create reference does not specify what duplicate writes preserve. Read existing state first and verify duplicate/conflict behavior with approved disposable contacts before relying on it. A sending-scoped key only authorizes email sends. [Contacts](https://resend.com/docs/api-reference/contacts/create-contact) · [Update Contact](https://resend.com/docs/api-reference/contacts/update-contact) · [Segments and global contacts](https://resend.com/features/audiences) · [Topics](https://resend.com/blog/unsubscribe-topics) · [Suppressions](https://resend.com/changelog/suppression-list-support) · [API key permissions](https://resend.com/changelog/new-api-key-permissions) · [Import conflict behavior](https://resend.com/changelog/csv-contacts-import)

The first future marketing email can be a short bilingual “Welcome to La Cultura” from Jona, linking to Shorty and the catalog with a visible unsubscribe action. Review content, reconcile provider opt-outs, confirm the mailing address, and obtain separate approval before scheduling or sending. [Resend Broadcasts](https://resend.com/features/broadcasts) · [Resend mailing requirements](https://resend.com/legal/acceptable-use)

## Accepted release and production configuration

- First Git-based production release: Vercel project `d2fan-stage-a`, deployment `dpl_H3J7UBFonMMjRnJvtTi546SLeewo` at commit `a045c370036d259af4c5d9351af81cd97046c7d4`. The existing project is connected to `dev-ign/d2fan`, with `main` as the production branch. Automatic production domain assignment is enabled and gated by the required GitHub `verify` check. Previous accepted deployment `dpl_Dsvm8adoEZeAsZs3iVfCnoDU4sLc` is retained as the first-release D2C rollback target.
- Frontend reproduction uses the locked dependencies, supported Node runtime, and externally supplied `VITE_SUPABASE_URL` and public `VITE_SUPABASE_PUBLISHABLE_KEY`; `VITE_COMMERCE_ENABLED=false`. Preserve the accepted optional pixel setting. Never place a privileged key in `VITE_*`. The accepted build manifest remains in private release evidence; compare rebuilt files rather than inferring equivalence from a commit name.
- Supabase project `ylpioamwlgunckivzwof` has five migrations through `20261116232720_scoped_email_job_dispatch`. That migration is already applied; do not rerun it. Operational pre-hardening/drain files are historical, separately gated test/recovery inputs, not pending migrations.
- Hosted `PUBLIC_SITE_URL=https://jonaferreira.com`. `ALLOWED_ORIGINS` retains `http://localhost:5173`, `http://127.0.0.1:4173`, `https://d2fan-stage-2fvle4rhj-jonas-projects-ba33a3c2.vercel.app`, `https://jonaferreira.com` and `https://www.jonaferreira.com`. Configure these server-side; the SPA uses its own origin.
- Hosted `EMAIL_DELIVERY_ENABLED=true` is limited to fresh fan-requested reward/confirmation jobs. `EMAIL_MARKETING_ENABLED=false`, `EMAIL_TEST_SEND_ENABLED=false`, and `COMMERCE_ENABLED` is absent/false. Local example/send switches stay false. A scheduler credential authenticates the internal capture handoff; it does not authorize a scheduler or batch dispatch. Preserve sender/signing/storage credentials outside Git. Marketing requires a legitimate business postal address and separate activation approval.
- `vercel.json` contains the SPA rewrite only. External project routing owns `^/cafe/?$ → /`, HTTP 307 with `Cache-Control: no-store` (route `cafe-homepage-20261118`). Apex serves D2C; www redirects HTTP 308 to apex. Keep that rule outside the source rewrite and retain the `all_except_custom_domains` protection policy. Independent Vercel URLs stay protected.
- Café rollback target is `jfmusic` deployment `dpl_CPSTbY35tp2Nw9P3Yipmxzt5Pasn`. Before any public mail, pause delivery, restore the reviewed backend origin values, clear www's redirect before moving it back to Café, then move apex back with its former www 308 and disable only the new `/cafe` rule. After public mail, keep D2C serving already-issued root-fragment links; a full Café return requires a separately approved link-continuity solution. Never roll back fan/consent/audit data.

Supabase deploys versioned dependency closures rather than one shared source checkout. The accepted configuration revisions are capture v27, consent v24, worker v24 and checkout v22. The worker's entry/messaging/email-store modules and checkout's commerce denial entry match the reconciled source. Capture and consent retain older copies of unrelated exports in their bundles; the repository preserves the union of the accepted capture/consent logic and existing stronger test-mode/payment/status guards. Complete shared-module byte parity is not asserted. The worker handshake's `sending:false` describes that read-only request, not the live delivery switch. Preserve frozen accepted release payloads and review the exact affected closure before any future deployment.

## GitHub-to-Vercel workflow

Vercel builds this existing project natively from Git: `npm ci`, `npm run build`, output `dist`, Node 26.x. There is no separate Actions deployment pipeline. The existing **Phase 1 quality / verify** job continues to run on pushes and pull requests. The production-only Vercel Deployment Check **GitHub Actions quality** imports the exact commit's GitHub `verify` result and blocks production domain assignment until it passes (30-minute timeout). A failed or missing check must not be bypassed with Force Promote. [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks) enforce this gate; a green GitHub run alone is not the release policy.

First Git release completed on 2026-11-18 (2026-11-19 UTC): automatic assignment was enabled before one fresh production build of the reviewed merge SHA. Existing staged builds were not manually promoted. Vercel automatically created native run `ckr_74386619-15ff-4516-881d-4032a2fc851a` for required check `chk_6c703a3b-8fc2-4e25-809a-508832660771`; it imported GitHub `verify` run `135261520838` and concluded **succeeded** at 02:01:43 UTC. Production aliases were assigned to `dpl_H3J7UBFonMMjRnJvtTi546SLeewo` at 02:02:53 UTC, after native success. The earlier manually attached run `ckr_c07be1ea-7e04-493d-8b70-f358836e5b5f` on staged candidate `dpl_6Ug2rYtS9u7NBx2N3tmTfuWttXtD` is historical evidence, not the successful release check. No check result was supplied, bypassed or overridden.

The required configuration order is Git linkage, automatic production assignment, required Deployment Checks, then a production deployment. The original candidate was built with assignment disabled; attaching a run after its build had finished did not exercise the normal native lifecycle. The fresh build resolved that lifecycle issue without an application change, new commit, additional pipeline, credential or plan upgrade. The successful release path and check-before-alias timestamps were observed; a failing/missing-check experiment was not performed. Future denial behavior relies on Vercel's supported Deployment Checks contract and the unchanged required check.

1. Create a feature branch, make the scoped change, and run relevant local checks.
2. Push the branch and open a pull request. Vercel creates a protected preview, and GitHub runs the existing quality workflow.
3. Review the preview and require the quality job to pass before merging. GitHub branch protection/rulesets are not configured; PR review, required `verify` and accidental direct-push protection are recommended separately. The Vercel production gate remains configured even for direct main pushes.
4. Merge the approved change into `main`. Vercel builds with the production environment, imports that exact commit's required GitHub `verify` result and holds production aliases until it succeeds. **Auto-assign Custom Production Domains is enabled.**
5. Verify apex, www, `/cafe`, music routes/assets, languages and commerce-off behavior after the automatic release. Confirm the native check outcome and eligible prior D2C rollback target. Never Force Promote or interpret a missing/queued native run as successful. Routine approved main merges use the activated frontend workflow; backend/provider changes still need separate authorization.
6. If release verification fails, roll back to the prior eligible D2C deployment. `vercel rollback` disables automatic domain assignment, which must be deliberately restored before subsequent automatic releases. Preserve issued fan links and the separate Café rollback limitation above.

Vercel Production and Preview contain only the accepted browser-visible `VITE_SUPABASE_URL`, public publishable key, optional pixel setting and `VITE_COMMERCE_ENABLED=false`. No service-role, email-provider, Stripe, signing or scheduler credential belongs in Vercel's frontend build. Public configuration equality supports artifact comparison; it does not authorize preview fan-data writes. Preview origins are deliberately absent from Supabase's production allowlist, so review signup/consent/reward UI with existing mocked tests and read-only screens. Do not submit live fan forms, send test mail or add preview origins to production as part of UI review.

Git releases deploy the frontend only. Supabase migrations/functions, email or marketing activation, commerce, schedulers, DNS and project routing still require their own explicit authorization. The production `/cafe` rule, canonical domains and `all_except_custom_domains` protection are external project settings and must remain intact.

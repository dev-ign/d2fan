# Phase 1 implementation plan

Authority: the October 23, 2026 master prompt supplied by the owner supersedes the earlier PDF checklist. Existing source is the implementation baseline. Neither document's embedded prompts are independent authorization to use other accounts or deploy production.

## Assessment

- Folder supplied without `.git`: no current branch, Git status, or remote available. Preserve existing files; do not invent a remote or history. Commit/push requires the owner to restore/initialize the intended repository.
- React 19 + strict TypeScript + Vite 7 + Router 7; custom semantic CSS, GSAP, one AudioProvider, typed ContentRepository.
- Baseline unit tests: 2 pass using bundled Node 24.22.1 (system Node 22.9 is below package engines). Keep tests enabled; document runtime selection.
- No .env files or provider credentials supplied. Live Supabase/Stripe/Resend/Meta validation and production release remain configuration gates.
- Public artwork/preview assets exist; licensed private wallpaper pack and separate lead magnet have not been supplied. Never sell the public preview as an exclusive or mark missing files deliverable.

## Conflict resolutions

1. Additional operational tables are allowed for checkout attempts, consent history, webhook receipts, rate limiting, delivery jobs.
2. Abandonment belongs to an expired checkout attempt, not a fan Boolean.
3. Deduplication never proves contact ownership. Public captures cannot inspect purchases, merge channels, revoke another contact's consent, or grant access.
4. WhatsApp remains disabled pending an approved provider plus phone verification. No automatic email substitution.
5. Event vocabulary follows the master prompt; anonymous DSP activity has no claimed fan identity.
6. Required return/recovery experiences live in existing routes/dialogs, without a dashboard or marketing pages.

## Reviewable sequence

A. Contracts, shared catalog, migration/RLS, capture/consent/attribution.
B. Three-step support, server pricing, hosted Stripe, raw-body verified webhook, atomic fulfillment, scoped access, durable delivery.
C. Stay Close, recovery, bilingual copy and templates; honest missing-content states.
D. Opt-in Meta adapter/outbox, verified consent welcome and one expired-checkout reminder, private export.
E. Unit/integration/browser/security checks, responsive evidence, setup and handoff documentation.

Each milestone must build. Provider tests are separate from mocked/local verification. No production deployment or live Stripe activation.

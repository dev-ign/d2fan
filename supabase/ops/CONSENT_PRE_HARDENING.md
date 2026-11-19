# Consent pre-hardening — local candidate

> Historical pre-launch review record from November 7–10, 2026. Atomic consent
> and the later scoped-dispatch migration are already applied to the live site.
> Retain these SQL files for local regression/recovery review; do not execute this
> old procedure against current production. The test-data backup waiver below
> never applies to live fan data. Hosted operations require a new exact approval.

This is a separate operator operation, not a Supabase migration. No hosted
execution is authorized by this document. Base: `31084a321251ca514ec762cb21b007cded76c33d`.

## Drain compatibility candidate — November 10, 2026

**GO for renewed Approval 3 review; hosted execution remains unapproved.** The
earlier drain artifact `3c9224efc2a142aae2c29f991fa3907c2ba6234c831d73debd22862784b1b9ad`
was rejected for the platform-launcher case described below. The replacement is
`88f6b59f6e7b8b94a670b4c08db3e675f577c2353d461d3ea8cb650b0d5319e9`.
Only activity classification/visibility changed; prepared-transaction, catalog,
privilege, capability and original-cohort checks are unchanged. Pre-hardening and
atomic migration retain their original checksum pins.

The sole NULL-state exception requires all of:

- Server-reported `backend_type='pg_cron launcher'`, a valid backend start, no
  client socket, and `wait_event_type='Extension'`.
- NULL activity state, transaction start, assigned XID and snapshot horizon.
- No virtual-XID or permanent transaction-ID lock owned/awaited by that PID.

`application_name` is never an authority. PostgreSQL's [background-worker
registration](https://www.postgresql.org/docs/17/bgworker.html) distinguishes the
server worker type from client labels; [pg_cron 1.6.4 registration](https://github.com/citusdata/pg_cron/blob/v1.6.4/src/pg_cron.c)
sets this exact launcher type. The name alone does not establish safety.
[PostgreSQL 17 transaction locks](https://www.postgresql.org/docs/17/view-pg-locks.html)
provide the independent veto: every transaction, including a read-only transaction
without an assigned permanent XID, retains a virtual-XID lock until completion.
Missing privilege, disabled tracking, unknown types/states, or transaction evidence
still yield NO-GO. No arbitrary worker or client exemption was added.

The necessary read-only hosted check confirmed PostgreSQL 17.11, preloaded
pg_cron (available version 1.6.4, extension not installed in this database), and
the observed launcher waiting in Extension with no client socket, timestamp,
XID, xmin or transaction lock. A real preloaded launcher in the existing local
PostgreSQL 17.11 image reproduced the case; no cron schema or job was created.

Activity and lock views are not a globally atomic no-work snapshot. The proof
still starts after confirmed hardening COMMIT: an old SQL frame must retain its
transaction/VXID until it finishes, while later invocations enter hardened bodies.
The fixed original cohort remains intact; the exception never removes a member
with a transaction start. Trusted native extensions and the owner/schema-change
freeze remain assumptions. Do not swap drain artifacts mid-cutover or reset an
existing cohort. Use a fresh dedicated session for the newly reviewed candidate.

Local command: `PHASE1_POSTGRES_BIN=/path/to/postgresql17/bin node supabase/tests/refund_concurrency.mjs --pre-hardening --cron-launcher`.
The optional flag preloads the already-installed extension only in the new private
test cluster; ordinary runs are unchanged and nothing is installed automatically.
All required launcher/transaction/visibility/cohort cases passed, followed by the
existing consent regressions, eight refund/fulfillment races and email concurrency.
Negative launcher projections use real backend transactions and `pg_locks`, not
only truth-table fixtures. Real disabled-tracking and restricted-monitor sessions
also refuse GO. A second disposable cluster with two-phase commit enabled refused
GO with both zero prepared transactions and an actual prepared transaction.
Repeated inspections preserved the original client-side baseline.

Critical self-review found no remaining broad exemption or unfinished-transaction
pass. Independent renewed review of this new artifact is still required; the old
review does not attest these changed bytes. No full hosted drain or Approval 3
operation was executed. After renewed review, the exact next approval is only the
existing pre-hardening operation plus this checksum-pinned post-commit drain for
`ylpioamwlgunckivzwof`, with the existing stop/preservation gates. Atomic migration,
deployments, sending, secret changes, resets and Stripe remain excluded.

## Earlier preflight — November 10, 2026, before the correction

**Historical result: NO-GO for the earlier drain artifact.** At that preflight,
the reviewed executables were unchanged. Read-only verification found a database-attached
`pg_cron launcher` with NULL activity state, NULL transaction start and no assigned
XID. The exact visibility predicate in `consent_drain.sql` rejects this row, so
the reviewed drain cannot currently produce GO. Global monitoring permission is
present; this is a platform-background-session compatibility gap, not evidence
that consent transactions have drained. Do not omit NULL-state sessions, terminate
the launcher, change pool/server settings, or reset the baseline to force GO.
The smallest next review is a local-only, narrowly bounded treatment of this
observed launcher, with failure tests for hidden/disabled/unknown activity and
real original transactions. Any executable revision needs a new checksum and
renewed review before Approval 3 can be authorized.

Fresh checks confirmed the healthy `d2fan` project in `us-east-2`, PostgreSQL
17.11, exactly the three historical migrations, and no atomic consent capability.
All eleven tables and nine inspected functions retain `postgres` ownership;
the nine function bodies match historical migration source pins. Tables have
RLS enabled and no policies. Application roles have no public-schema
CREATE, owner membership or unexpected RPC access. No inherited TRIGGER/callback
grants would remain after the reviewed explicit revokes. Only the two expected
delivery triggers exist. The executor has public-schema CREATE and effective
`pg_read_all_stats`; `track_activities=on`, `max_prepared_transactions=0`, and no
prepared transactions were observed. No conflicting inventory lock was observed;
no lock was acquired as a test. All six historical jobs remain quarantined, none
processing, with twelve audit rows. All three email switches remain false.
Required backend settings are present; their aggregate inventory is unchanged
since Approval 2. No values or individual secret digests were logged.
No Cron schema or stored HTTP queue was found; external schedulers remain unknown.
The launcher alone does not establish that any email job is scheduled.

Approval 2 remains deployed: `manage-consent` v14, ID
`83aa060c-ba7b-4274-8ae4-ef2b42f6121e`, ACTIVE, `verify_jwt=false`, bundle
`9d3821de8fb9b199d61175f9deec2f4a501281d34f1186c75f8b8891147e3dae`.
Its source/bundle identity is unchanged. The November 7 correlated GET/Boot proof
is historical health evidence, not consent acceptance; no new invocation or
deployment occurred. `capture-fan` v15 still derives delivery status from
configuration rather than persisted job evidence. `scheduled-messaging` v14
still omits request binding from confirmation tokens. The fixes exist locally;
each affected deployment needs separate approval. Payment entry points remain at
their earlier revisions; local test-mode guards are not proof of deployed parity.

Git decision: **Option A**, retain the coherent uncommitted candidate. After
`git fetch origin`, `main` and `origin/main` both identify the base above (0 ahead,
0 behind); the other local branches contain no commits absent from `main`.
Nothing is staged. Only the existing three ops files and two test files are
modified/untracked; no credential, generated artifact or unrelated change is in
that candidate. No branch, commit, push, merge or reset is needed for readiness.

## Owner-approved backup waiver — November 7, 2026

The owner confirms that all existing records in project `ylpioamwlgunckivzwof`
are disposable development/test data, with no preservation requirement, and
accepts their loss if reconstruction becomes necessary. For this pre-launch
test-project cutover, the following prerequisites are explicitly waived:

- Full logical backup creation.
- Role-recovery manifest preparation.
- Isolated restore validation.

These items no longer block the cutover; no backup infrastructure or additional
recovery tooling is required. This supersedes the backup gates in earlier consent
readiness reports, not their historical evidence. It does not apply to future
customer/production data.

The waiver does not authorize deletion, reset, reseeding, reconstruction, restore,
or any hosted execution. Security, privilege, concurrency, consent, atomic rollback,
disabled-delivery and separate-approval requirements remain mandatory. Existing
state/quarantine checks detect unintended writes; they are not backup requirements.

The November 10 execution scope requires preserving existing records and objects
outside the exact separately approved changes. The earlier acceptance of test-data
loss risk does not authorize causing loss, deletion, reset or reconstruction.

## Scope and ordering

1. Retain the completed Approval 2 evidence; do not redeploy `manage-consent`.
   Obtain renewed review of the replacement drain candidate before requesting
   hosted Approval 3. Confirm project `ylpioamwlgunckivzwof`,
   PostgreSQL 17, the three historical migrations, disabled email switches and
   the six quarantined jobs. Retain the protected-record baseline privately.
2. Independently approve the exact pre-hardening file below. Freeze other
   owner/admin schema, function and role changes for the cutover window.
3. Execute pre-hardening once and confirm COMMIT. Capture and drain the cohort.
4. Only after GO, obtain separate approval for the original atomic migration,
   with the pending migration set verified to contain only that reviewed file.
   Recheck drain/catalog evidence immediately before the attempt.
5. Attest final guards/private ACLs and PostgREST cache readiness, then separately
   approve request-bound worker deployment and synthetic acceptance. Keep all
   delivery switches disabled; never process the historical jobs by default.

The atomic migration remains byte-for-byte unchanged. This operation neither
creates nor fabricates migration-history entries. It repeats only prerequisites
that the atomic migration safely reasserts; do not add a later-sorted migration
or run `db push` to execute this prerequisite.

## Approval 2 — completed; deployment reference only

The following scope records the completed deployment. It is not a request to
repeat it. The next hosted operation remains Approval 3, after renewed review.

Deploy only `manage-consent` in project `ylpioamwlgunckivzwof` from the reviewed
commit above. Scope: `supabase/functions/manage-consent/index.ts`; its shared
`platform.ts`, `handlers.ts`, `security.ts`, `payment-test.ts`, `email-policy.ts`;
and `supabase/shared/{catalog.json,contracts.ts,validation.ts}`, using the existing
dependency lock. Do not deploy other function entry points or prune functions.

Before deployment, refresh project/function identity and confirm the reviewed
source and dependencies. Preserve `verify_jwt=false` and all existing environment
values, including signing material and origins. Required configuration remains
`SUPABASE_URL`, `ALLOWED_ORIGINS`, `RATE_LIMIT_SALT`, `ACCESS_TOKEN_SECRET`, and
either `SB_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`; do not print or change them.

Record the submitted artifact identity and resulting function ID/version/status
and JWT setting. Attest serving identity through deployment/source metadata. If
insufficient, include exactly one GET with an existing allowed Origin in the
deployment approval: expect HTTP 405 before rate limiting/RPC execution, correlated
to invocation metadata identifying the new revision. A 405 alone is not source
attestation or an old-invocation drain guarantee. Do not use POST, consent tokens,
or a worker request as a probe. Stop if identity or boot health cannot be verified.

The three-argument revoke-only-compatible unsubscribe contract remains unchanged.
Bound confirmation fails closed with retryable HTTP 503 until the four-argument
RPC/cache is available; unbound links remain rejected. No legacy grant fallback
is permitted. Later approvals remain separate: pre-hardening/drain, exact atomic
migration once, request-bound worker deployment, then scoped synthetic acceptance.
Email activation, historical job processing, Stripe, secret changes and resets
are excluded from every step.

## Checksum pins

Run `shasum -a 256` on both operation files and the atomic migration before use.

- `consent_pre_hardening.sql`: 1167a72ddc974bf44811569a0b6563fb2bc5f3edc6831f11bb9538539619f03a
- `consent_drain.sql`: 88f6b59f6e7b8b94a670b4c08db3e675f577c2353d461d3ea8cb650b0d5319e9
- Atomic migration: `af5d4945b620863fd3dd5848b2e5f04906351ca71b705b187596c76601bb99a7`

## Execution and drain (future approval required)

Use PostgreSQL 17 `psql -X -v ON_ERROR_STOP=1` with protected client connection
configuration pointing to the verified project. Do not put credentials in the
command line or transcripts. Use a fresh dedicated autocommit session; never
wrap these files in another transaction. No connection/pool changes are needed.

```psql
\i supabase/ops/consent_pre_hardening.sql
-- Require successful COMMIT; an error is STOP, not permission to retry.
\i supabase/ops/consent_drain.sql
-- CAPTURED is not GO. Keep this session and its consent_baseline variable.
\i supabase/ops/consent_drain.sql
```

The drain script uses short READ ONLY transactions and client-side psql variables,
not database objects. It captures every other open transaction in this database,
including active/idle-in-transaction and database-attached background sessions.
Idle connections with no transaction are excluded. PID, backend start and
transaction start identify each original member; XID is recorded but may change
from unassigned to assigned without proving completion. A new transaction on the
same backend does not remain in the old cohort.

Monitoring requires existing effective `pg_read_all_stats` privileges or a
superuser, `track_activities=on`, and visible activity identity/state. There is no
automatic permission grant. Require the target's existing
`max_prepared_transactions=0` as well as zero prepared transactions: this excludes
a transaction preparing between the separate activity/prepared observations.
Do not change the setting to satisfy this gate. Missing/disabled visibility,
enabled two-phase commit or prepared transactions,
remaining original members, changed server/database identity, changed definitions,
owners/ACLs/triggers, or premature private capability cause NO-GO. The nine source
fingerprints in the script pin the reviewed function bodies, not customer data.
The only NULL-state exception is the transaction-free, server-classified launcher
defined above; ordinary clients, unknown workers/states, and active transaction
evidence remain subject to NO-GO or the unchanged original-cohort gate.

Wait between manual inspections (for example at least five seconds); do not use
`\watch`, automatic retries, query-text filtering, session termination, or a fixed
sleep as proof. Proceed only on `GO: original cohort drained`, with every check
true and no remaining original members. Retain the capture/result evidence in a
private operator transcript; never edit/reset the baseline to force GO. A lost
session or server restart requires a new verified post-hardening capture/drain.

The proof assumes trusted owners do not change protections during the release
window. New calls use the hardened definitions; old requests reaching SQL later
also encounter them. Existing old frames may finish before drain: pre-hardening
is not retroactive authorization enforcement. The final grant guard/private writer
arrive only with the atomic migration. No temporary unsafe privilege is restored.

## Failure and recovery

NOWAIT inventory locks precede all mutations. They permit normal RowExclusive
payment DML while excluding trigger DDL. Catalog lock waits retain the reviewed
five-second timeout. On a known failure, require rollback/disconnection and verify
no partial catalog change. Do not increase timeouts or retry automatically.

On uncertain commit, inspect definitions, ownership, ACLs and the unchanged
migration history before deciding what committed. Keep a successfully committed
hardening in place; repair forward under separate approval. Never restore the
unconditional legacy grant writer. A current recovery point is neither required
nor asserted under the owner waiver. If reconstruction becomes necessary, stop
and obtain separate explicit approval; accepted data-loss risk is not permission
to delete, reset or reconstruct the database.

## Local validation

With native PostgreSQL 17 binaries:

```sh
PHASE1_POSTGRES_BIN=/path/to/postgresql17/bin node supabase/tests/refund_concurrency.mjs --pre-hardening
```

The existing runner creates/removes a private cluster, scrubs ambient PG settings
and never reads a database URL. The staged path reuses final consent, eight real
refund/fulfillment races and email concurrency coverage. It pauses a harmless old
`check_rate` frame to exercise replacement/drain; it does not reproduce the audit
callback escalation. The default historical cutover path is unchanged.

This local evidence does not prove hosted drain visibility, handler identity,
schema-cache readiness or provider behavior. Backup recoverability is waived,
not verified. Email, Stripe,
workers, hosted SQL, commits and pushes remain outside this task.

Validated on November 7, 2026 using the existing PostgreSQL 17.11 image with
`--network none`, no published ports and private disposable clusters:

- `--pre-hardening`: staged checks, final atomic consent regressions, all eight
  refund/fulfillment concurrency cases and email concurrency passed.
- `--pre-hardening --consent-only`: final drain correction and consent checks passed.
- A separate disposable cluster with `max_prepared_transactions=1` refused GO
  both with an empty inventory and with an actual prepared transaction; every
  other drain prerequisite passed. No hosted setting was changed.

A separate review agent checked SQL, races, privileges, compatibility and scope.
Its 2PC observation-race finding was fixed with the zero-setting gate above.
No unresolved critical/high finding remains. Native Edge checks were not rerun:
no Edge source changed and native Deno is unavailable here. This is local review
readiness, not approval for hosted operations.

## Minimum launch scope and remaining gates

Keep Supabase + Resend. The full roadmap is not the launch checklist. The table
separates local implementation from hosted acceptance; P0 applies to the capability
being opened, not automatically to an earlier music-only release.

| Area                | Evidence and remaining action                                                                                                                                                                                                                                                                                              | Launch gate                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Fan capture         | Local persisted-job status fix and mocked capture/retry checks exist; accept the hosted flow and separately deploy the status fix before enabling delivery.                                                                                                                                                                | P0 hosted acceptance; status parity P1 while email is off |
| Consent             | Atomic confirmation/replay/unsubscribe code and PostgreSQL 17 tests exist; resolve drain, apply Approvals 3/4, then accept mutations. Current v14 handler cannot confirm through the absent RPC.                                                                                                                           | P0 before confirmed subscriptions                         |
| Database            | Reviewed pre-hardening/atomic checksums, ownership, RLS and historical inventory match; launcher correction is locally validated, with renewed review and hosted post-commit drain outstanding.                                                                                                                            | P0 for Approval 3                                         |
| Stripe              | One historical sandbox purchase/download; local refund races pass. Current local client/webhook reject live mode and paid catalog is coming soon. Reconcile/deploy known source, perform approved sandbox acceptance, then separately review live-mode implementation/configuration. Changing a key alone is insufficient. | P0 before live payments                                   |
| Rewards             | Private bucket exists; historical free/paid download evidence and local mocked UI checks exist. Verify actual configured objects and signed access through approved hosted acceptance.                                                                                                                                     | P0 before promising a reward                              |
| Transactional email | Existing Resend adapter, frozen bodies, leases, 23-hour retry bound and controlled tests exist; delivery is disabled and provider/inbox acceptance is outstanding.                                                                                                                                                         | P0 before promising email                                 |
| Marketing           | Welcome/reminder eligibility rechecks exist. Postal address is empty; release-announcement kind/template/dispatch support is absent. Add only that bounded extension before the first announcement.                                                                                                                        | P0 for marketing activation; can follow capture launch    |
| Frontend            | ES-first, EN, unchecked consent, retries, focus and mobile flows have targeted local coverage. No configured safe public HTTPS origin is established.                                                                                                                                                                      | P0 hosted smoke; further polish P1                        |
| Analytics           | Bounded attribution and consent-gated Pixel/CAPI outbox exist; real provider deduplication is unverified and worker dispatch remains paused.                                                                                                                                                                               | P1 provider measurement acceptance                        |
| Operations          | Database/audit records and correlated function logs exist; use existing provider suppression/failure reports and operator review, without adding a dashboard.                                                                                                                                                              | P0 controlled-send/recovery checks                        |
| Deployment          | Required backend settings exist; current site origin fails HTTPS readiness. Approve frontend hosting/origin changes and known-source deployments separately, then smoke-test direct routes and the fan journey.                                                                                                            | P0 for public workflows                                   |

P1: delivery-status deployment where delivery is already disabled, visual/performance
polish without a reproduced defect, and provider analytics validation. P2: advanced
segmentation, campaign dashboards, analyst/creative automation, WhatsApp, subscriptions
and multi-artist products. Do not build these to unblock the current cutover.

A discovery-first launch may precede commerce/marketing only if unavailable support,
subscription and reward promises are withheld. Capture/free reward can follow after
consent, HTTPS and actual-file acceptance, with marketing delivery and paid items
still disabled. The current support CTA must not imply that live checkout is ready.

### Small release-announcement workflow — not executable yet

The current claim/dispatch allowlists and templates do not support announcements.
Do not repurpose welcome/reminder jobs or use a stale CSV/Resend audience as send
authorization. A later small extension should reuse the current outbox and final
eligibility boundary, not add a campaign service:

1. Owner drafts one campaign ID, release URL, ES/EN copy and required footer.
2. Determine candidate fans through current database `email_permission`; retain
   IDs for the reviewed job scope, not a second authoritative audience datastore.
3. Preview both languages with unsubscribe links, approved sender and postal copy.
4. After separate implementation/deployment and per-campaign approval, enqueue
   one job per eligible fan with a stable campaign/fan dedupe key.
5. Recheck authoritative permission at the database dispatch gate and immediately
   before provider dispatch, including frozen retries. Review provider suppressions.
6. Preserve frozen bodies, stable keys and the existing retry deadline; never
   revive quarantined jobs or promise recall of an already in-flight email.
7. Review existing audit/provider acceptance, delivery and suppression reports;
   investigate failures without broad replay or automatic campaign retries.

### Approval mapping and exact execution boundary

Preserve the established numbering: **3** pre-hardening plus post-commit drain;
**4** the exact atomic migration once; **5** request-bound worker deployment;
**6** scoped synthetic acceptance. The new prompt's logical "Approval 5 acceptance"
maps to existing **6**. Its "Approval 6 email activation" is a later, separately
approved activation, not authorization under existing 6. Capture/payment deployments,
public hosting, origin/secrets changes and live Stripe work have their own scopes.

After renewed drain review and explicit Approval 3: refresh every gate, use a
verified owner/session-mode PostgreSQL 17 psql connection with ON_ERROR_STOP and
fresh autocommit, execute only the checksum-pinned pre-hardening transaction, require
COMMIT, then capture/check the fixed cohort in that same dedicated client session.
MCP snapshots before hardening cannot substitute for this client-side baseline.
Recheck definitions, owners, effective ACLs, two-trigger inventory, absent new
capability, unchanged record/quarantine baselines and disabled switches. Leave
successful hardening in place. Stop on any identity, privilege, visibility, history,
lock, data, quarantine, configuration or statement failure; do not retry uncertain
commits. No global drain, termination, lock rehearsal or migration was performed here.

Before Approval 4, recheck the successful prerequisite and its drain; verify that
only the atomic migration is pending. After commit verify the private writer,
guards, grants/RLS, RPC signatures and positive PostgREST cache evidence. Keep
email disabled. Then approve worker deployment and synthetic acceptance separately:
capture/duplicate/expiry/replay, unsubscribe against pending confirmation, concurrent
requests, denial/idempotency, and history consistency. Controlled transactional
delivery follows sender/domain, HTTPS, suppression, preview, lease/retry and
allowlisted-recipient verification; marketing/postal/campaign approval comes later.
Never enable all three sending switches together for convenience.

### November 10 validation and limits

Reused the unchanged November 7 PostgreSQL 17.11 and native Deno CI evidence;
did not rerun database/payment suites or install Deno. The launcher visibility case
was not covered by that disposable local cluster. The exact reviewed visibility
predicate was evaluated read-only against current hosted metadata and returned false.

Using Node 26.13.0 and an isolated copy of the reviewed source, targeted validation:

- `npm test -- src/services/phase1.test.ts src/services/attribution.test.ts src/i18n/site.test.ts`: 9 passed.
- Playwright `phase1.spec.ts`, `stay-close.spec.ts`, `localization.spec.ts`: 19/21
  initially passed; two layout checks failed because the isolated dependency symlink
  blocked font assets in Vite. After correcting only that temporary setup, both
  failed cases passed. No product code was changed for an environment failure.
- Existing `check-email-configuration.mjs`: exit 2, an expected configuration gate:
  HTTPS origin is not ready; postal is also empty. Sender/support format checks
  pass; all three switches are false. Provider authentication was not exercised.

Backend/browser responses were mocked for local tests; no hosted mutations, worker
requests, emails or Stripe calls were made. Browser output stays in the temporary
validation directory. No production deployment, secret change, database lock,
commit or push was performed. Approval 3 is prepared but has not passed or executed.

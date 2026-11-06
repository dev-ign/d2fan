# D2C Music — Agent Operating Rules

These instructions apply to the entire repository unless a more specific `AGENTS.md` overrides them. Preserve existing architecture and product behavior. Prefer the smallest safe, reviewable change.

## 1. Scope and diff discipline — mandatory

- Work only on files directly required by the approved task. Do not refactor, reformat, rename, reorganize, or upgrade unrelated code.
- Before editing, inspect `git status --short` and relevant files. Treat pre-existing modifications and untracked files as user work; never overwrite, revert, stage, or clean them without explicit approval.
- Do not modify lockfiles, dependencies, generated artifacts, snapshots, fixtures, or configuration unless strictly required by the task and explain why.
- Do not add speculative abstractions, scaffolding, helper utilities, documentation, or tests for future features.
- Prefer modifying an existing test over adding a duplicate. Never bulk-generate tests, snapshots, mocks, or fixture data.
- Keep patches narrowly scoped. At the end, report changed files and why each was necessary; flag unexpected diff growth.

## 2. Risk-based testing — mandatory

**Do not run every test suite on every change.** Select validation based on the change's impact. Run the smallest relevant checks first, and normally run each selected check only once after the final edit.

- **Copy, styles, layout, static assets:** manual inspection or a narrowly targeted UI check; no database, payment, email, or full integration suite by default.
- **Localized component or pure-function change:** run the closest existing unit/component test(s), if available; run targeted type/lint checks only when applicable.
- **Cross-cutting type or shared-contract change:** run relevant consumer tests and typecheck; broaden only where dependencies actually require it.
- **Payments, entitlements, consent, authentication, RLS, webhooks, migrations, or messaging:** run focused security/invariant and regression tests covering the changed behavior and adjacent failure paths. Do not skip essential tests in these areas just to minimize output.
- **Build or full suite:** run only when the change is broad, the targeted checks cannot provide sufficient confidence, a release gate explicitly requires it, or the user specifically requests it. Explain the reason first if a costly run is optional.
- Do not run multiple overlapping commands that validate the same behavior. Do not repeatedly rerun successful tests without relevant changes.
- If a test fails, investigate the cause, make the smallest correction, and rerun the failed test plus directly affected checks—not the entire suite by default.
- If tests cannot run because of missing services, credentials, or infrastructure, report them as **not run**; never claim a pass or substitute fabricated results.

## 3. Rules for writing tests

- Add or update tests **only when behavior, a bug fix, a contract, or a security invariant warrants them**. Do not add tests for text-only or cosmetic changes unless a specific regression warrants one.
- Prefer existing test files, helpers, and fixtures. Keep cases concise, deterministic, and directly tied to the change.
- Avoid exhaustive permutation matrices, duplicated happy-path tests, broad snapshots, unnecessary mocks, and test-only production abstractions.
- For security-sensitive changes, cover the primary success case and meaningful denial/failure/replay/concurrency cases as applicable; do not trade away safety for fewer tests.
- Do not alter unrelated tests just to make the suite green. Report pre-existing failures separately.

## 4. External side effects and protected systems

- Default to local, read-only inspection. Do not deploy, migrate hosted databases, resume/pause services, change secrets, enable messaging, send email/SMS, run live payments, or modify external provider configuration without explicit, operation-specific approval.
- Preserve existing fan, consent, purchase, entitlement, payment, webhook, and audit records. Never reset or reseed a shared/hosted database without explicit approval.
- Keep email delivery, marketing, and test-send switches disabled unless explicitly approved for a precisely scoped test. Do not run background workers or process quarantined jobs by default.
- Use test-mode Stripe credentials and disposable, approved fixtures for payment acceptance. Never assume a configured credential is a test key; fail closed where required.
- Never expose secrets or personally identifying fan records in logs, diffs, test output, or reports.

## 5. Execution protocol

1. Restate the narrow objective and identify affected files and risks.
2. Inspect existing implementation and tests; reuse what's already there.
3. Make the minimum necessary edit.
4. Choose a **minimal validation plan** proportionate to risk; do not automatically run lint + typecheck + build + all tests.
5. Execute selected checks once after edits. Expand only for a concrete failure, uncovered dependency, or explicit release requirement.
6. Review `git diff --stat`, `git diff --check`, and the relevant diff. Remove accidental noise without disturbing pre-existing changes.
7. Report: files changed, behavior changed, exact checks run and results, checks deliberately not run, remaining risks, and approvals needed.

## 6. No automatic scope expansion

If a newly discovered issue is outside the approved task, document it and ask before fixing it—except for a directly blocking defect that must be addressed to safely complete the task, in which case explain the necessity and keep the fix minimal. Never silently turn a small change into a repository-wide cleanup.

**Priority:** correctness and security first; minimal scope and targeted testing second; speed third. "Minimal testing" never means bypassing essential payment, consent, authentication, or data-integrity verification.

## D2C Product Strategy & Roadmap

The project's master strategy and implementation roadmap is located at:

`docs/strategy/D2C_MASTER_ROADMAP.md`

### When to consult it
- Before planning new features, major implementations, or architectural changes.
- When proposing new development phases or prioritizing the backlog.
- When evaluating whether a feature aligns with the project's business goals.
- When the user explicitly asks to continue the D2C roadmap.

### When NOT to consult it
- Small bug fixes.
- Minor UI refinements or styling adjustments.
- Focused test corrections.
- Documentation-only changes.
- Tasks with clearly defined requirements that do not affect product direction.

### Rules
- Preserve the existing product strategy unless the user explicitly approves a change.
- Do not implement roadmap items without explicit authorization.
- Treat the roadmap as planning context, not as an instruction to expand task scope.
- If the roadmap conflicts with the user's latest instructions, follow the latest instructions.
- If the roadmap is unavailable, continue narrowly scoped tasks without blocking.
- Do not modify the roadmap automatically after every task.
- Update roadmap progress only when explicitly requested or when closing an approved major phase.
- Preserve the existing minimal-diff, focused-testing, and security requirements.

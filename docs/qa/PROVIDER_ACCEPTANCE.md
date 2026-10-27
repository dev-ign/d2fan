# Provider test-mode acceptance record (owner to execute)

This is the original owner acceptance procedure. The [October 27 audit](../PHASE_1_AUDIT.md) records the current scenario-by-scenario evidence: one real paid-item flow is verified, while provider tip/replay/refund/async tests and Resend delivery remain open. Execute new provider actions only with explicit authorization. Never attach keys, full contact lists, payment details, signed download links, or access tokens.

1. Open `/?utm_source=instagram&utm_medium=reel&utm_campaign=accion&utm_content=creative_a`. Browser stores bounded context and removes query parameters before measurement.
2. Join via email with optional marketing permission. Check one normalized fan, first/last touch, capture event, pending permission, real free file, accepted email. Confirm the inbox link/button; check granted permission and one welcome job.
3. Start $15 support through contact step. Check same fan and a separate pending attempt before payment. Leave it unpaid. No purchase/unlock is expected. After actual expiry and 24h, only a verified/current opt-in fan is eligible for one reminder.
4. Upload the licensed paid pack and open only the test catalog item. Complete its $5 Stripe test Checkout. Check paid purchase, correct active entitlement, canonical events, one delivery job, verified in-page download and access email. Record measured email latency; no sub-minute inbox SLA is claimed.
5. Resend the actual Stripe event, including concurrent retries. Confirm unchanged purchase/unlock/job counts. Replay unpaid completed, async success/failure, expiry after paid, and refund/success ordering. No phantom access.
6. Refresh the return, close/reopen, use recovery from another session, expire access link, request fresh inbox recovery. A session ID, arbitrary email, fan ID, bad token or expired token must not expose private data.
7. Inspect Meta Test Events with measurement off/on/withdrawn. Lead/InitiateCheckout/Purchase pairs share IDs, unlock is server-only, value/currency are correct, and raw contacts/tokens are absent. Verify actual deduplication in provider UI.
8. Test declined card, cancel, expired checkout, timeout, missing Resend key, invalid private path, suppressed/bounced email, worker failure/retry and anon storage/data access. Paid state survives email failure.
9. Check keyboard-only forms, focus restoration, reduced motion, 320/390/768/1024/1440 layouts and intermediate header widths on the hosted build. Verify mobile wallets on eligible devices and direct `/music/accion` refresh.
10. Confirm owner-approved email sender/privacy/refund/tax wording, contact export permissions, schedule monitoring and rollback procedure. Keep live mode off until separately authorized.

Record each item as PASS/FAIL with actual evidence. The local mocks and embedded DB tests in the implementation report are useful prerequisites, not substitutes for this record.

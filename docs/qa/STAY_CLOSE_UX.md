# Stay Close capture UX refinement

October 23, 2026. The owner confirmed a real hosted `capture-fan` submission persisted a fan before this change. This pass changes frontend presentation/layout only; hosted capture, database schemas, deduplication, consent confirmation/revocation, checkout and AudioProvider are unchanged.

## Outcomes

- Failed capture keeps the form, values, consent selection and request ID for a safe retry; no success or download is shown.
- Accepted capture replaces the form with “You're in La Cultura.” and confirms that contact was saved. When no `magnetUrl` is returned, the panel clearly says the exclusive is still being prepared.
- A returned `magnetUrl` supplies the download CTA directly, using the existing backend-signed Storage URL. A queued email is never described as sent or delivered. EN/ES copy is centralized in the existing message configuration.
- Unchecked marketing consent still sends `emailMarketing: false`. The confirmation does not claim a new marketing subscription or revoke existing preferences. Selected permission continues through the existing separate confirmation architecture.
- A persistent polite status announcement reports the accepted outcome; focus moves to the confirmation heading and scrolls the panel into view without hiding it behind the fixed header. The download follows in keyboard order.

## Positioning findings and fix

The original section had no fixed-header anchor allowance. Initial deep-link scrolling also ran before web fonts settled. Header heights (132/110/74px) now share one responsive CSS custom property with the document scroll padding. Initial hash alignment waits for font metrics and a layout frame; ordinary anchor clicks retain the existing smooth/reduced-motion behavior. GSAP reveal transforms settle to zero and were not the source of the persistent tablet collision; the animation hook was preserved.

At tablet widths the intro still used a desktop flex row, squeezing its paragraph into a narrow, tall column under the header. Artwork and footer used fixed absolute positions, causing collisions as the form/confirmation changed height. The intro now stacks when that row no longer fits. A scoped desktop/tablet grid aligns form/result and artwork, with a normal-flow footer; mobile artwork follows the content. Tablet form controls stack to preserve usable input width. Existing artwork, dark/lime colors, typography and other sections are retained.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`: PASS.
- `npm test`: 6 passing unit tests, including shared audio.
- `npm run test:db`: PASS, including canonical fan deduplication, consent, replay/transaction and negative access checks in embedded PostgreSQL. No hosted schema was applied.
- `npm run test:e2e` with installed Chrome: 17 passing browser tests. Coverage includes all three capture outcomes, EN/ES, explicit consent true/false, stable retry IDs, focus/live status, the signed-link request, unchanged audio/checkout/release flows, direct hashes, normal/reduced motion, native menu clicks and cross-route anchors.
- Layout assertions cover 320/390/768/1024/1440px. Both intro heading AND paragraph remain below the fixed header. Confirmation title remains visible, artwork stays separate, email controls retain usable width, and no horizontal overflow occurs. Header geometry additionally covers intermediate widths in the regression suite.
- axe WCAG A/AA/2.1 scan: zero violations in failure/unavailable/available outcomes at 320/768/1440px. See `artifacts/qa-stay-close/accessibility.json`. This is automated coverage, not a manual screen-reader certification.

All automated capture/download outcomes use deterministic HTTP stubs; no real fan emails were submitted, no provider delivery is claimed, and the owner's hosted integration was left untouched. The existing API request shape and services were preserved. No new dependency was added.

## Screenshots

Screenshots use `fan@example.com` and mocked capture responses, never the owner's real test contact.

| Experience                | Before                                                                                  | After                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Desktop accepted capture  | [Form remained after success](../../artifacts/qa-stay-close/before-success-1440.png)    | [Dedicated confirmation](../../artifacts/qa-stay-close/after-success-1440.png)              |
| Mobile section/navigation | [Fixed artwork covered the action](../../artifacts/qa-stay-close/before-anchor-390.png) | [Header offset and normal-flow artwork](../../artifacts/qa-stay-close/after-anchor-390.png) |
| Available exclusive       | —                                                                                       | [Secure download CTA](../../artifacts/qa-stay-close/after-reward-1440.png)                  |
| Tablet confirmation       | —                                                                                       | [Stacked intro and separate artwork](../../artifacts/qa-stay-close/after-success-768.png)   |

Additional responsive captures are in `artifacts/qa-stay-close/`.

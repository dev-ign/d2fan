# Premium experience — walkthrough and engineering handoff

This refinement keeps the existing dark/lime identity, catalog, audio engine and provider architecture. It replaces fixed-height, widely spaced compositions with viewport-aware scenes; makes navigation feel like a restrained floating interface; and turns release pages into focused destinations where listening comes first.

## Start the local review

Use the Node version in `.nvmrc` (24.22.1), install the locked dependencies with `npm ci` on a fresh checkout, then:

```bash
npm run dev -- --port 4173 --host 127.0.0.1
```

For the production preview used for final visual QA:

```bash
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

Open the homepage and `/music/accion`. Set the browser to **1366 × 768** and **390 × 844** first. These are explicitly covered by tests and production screenshots, rather than inferred from a 1440px desktop check.

## A fan's walkthrough

### 1. Arrive at the artist campaign

The portrait is immediately visible and stays the main visual asset. One continuous gradient darkens its top enough for navigation and fades the lower photograph into the site's ink background. There are no separate biography background plates or competing hero overlays.

The artist name and established display/editorial fonts remain. The short biography stays in the hero; the extra visible genre paragraph is removed. The full biography data is retained.

Press the horizontal three-dot button, named **Read artist biography**. It opens the existing biography dialog with the complete text and portrait-view controls. Escape closes it and returns focus to the ellipsis. The button also has a native tooltip and a visible focus outline.

The featured release is now a compact music object: existing optimized cover, title, subtle **LATEST RELEASE** label and direction arrow. It continues to use the configured featured release and opens its release route. Its entrance follows the main hero copy; its hover moves only three pixels.

The social links are inside the hero footer. At both priority viewports the biography, featured release and social footer fit without overlap. Mobile links wrap into compact rows with 44px touch targets. The existing URLs and search-destination labels are preserved.

### 2. Move through the floating navigation

At the top, the homepage navigation has no visible shell background. After crossing 40px of scroll, the same-size shell receives a dark translucent surface, a thin border, restrained 12px blur and a soft shadow. It remains inset from the viewport edges. The fallback without backdrop filtering is a more opaque dark surface.

There is no height animation or layout shift. The scroll subscription notifies React only when crossing the threshold; it is passive and cleans up on unmount. At tablet/mobile widths, the menu replaces the inline links and support action, while the homepage audio control stays available.

Open the menu. It uses the existing accessible Dialog infrastructure: background inertness, scroll locking, initial focus, a Tab/Shift+Tab loop, Escape and focus restoration. The decorative 01/02/03 numbering is hidden from assistive technology. Links return to Music, the Vault or Stay Close; Support opens the existing support flow.

### 3. Browse distinct scenes

On suitable desktop sizes, each major section fills the viewport with a navigation safe area inside its own scene. This keeps the previous scene's footer from appearing behind the new scene's navigation. Primary music controls, Vault cards/actions and the Stay Close form fit at 1440 × 900, 1440 × 800, 1366 × 768, 1280 × 800 and 1024 × 768.

These are minimum heights, not fixed-height clipping containers. Content may grow for small windows, narrow screens, longer text or form outcomes. There is no nested page scroller or wheel interception.

Proximity snapping is enabled only at widths of at least 1100px, heights of at least 800px, with a fine pointer and no reduced-motion preference. It is therefore **off at 1366 × 768 and on phones**. It also turns off for focused form fields and dialogs. The utility footer has an end-alignment target so its recovery/privacy controls remain reachable. This last boundary was verified after testing exposed an initial snap-back problem.

### 4. Listen in La Música

The carousel, selection state and AudioProvider remain intact. Artwork is sized against the viewport, with tighter editorial spacing and comfortable playback controls. The selected release still drives the background, independently of the track currently playing. Browsing another release does not stop the current preview.

Try arrows, cover selection and keyboard release tabs. The existing decoded-image crossfade, latest-selection handling, bounded image cache and reduced-motion behavior are unchanged. **Listen on** still opens the streaming menu; **Release page** opens that release.

No platform URLs were invented. The catalog currently supplies Apple Music destinations; other destinations appear only when real URLs are added to release metadata.

### 5. Explore the Vault

The same locked previews, products, prices and coming-soon states remain. The card grid is composed to fit desktop heights and stacks naturally on phones. Hover changes the image scale subtly; the blur stays fixed rather than animating an expensive filter or revealing private content.

Open a preview or the archive. Existing support, entitlement, recovery and secure delivery mechanisms continue to own access. This refinement does not turn coming-soon content into a purchasable item.

### 6. Join La Cultura

The email input and submission button now share one rounded outer boundary, matching heights and a shared focus treatment. On narrow screens they stack inside that same boundary, preserving usable email width instead of squeezing both controls.

Language, the existing email channel, disabled WhatsApp state and explicit marketing permission remain. Marketing is unchecked by default. Saving a contact sends `emailMarketing: false` unless the user opts in; a separate confirmation is still required before marketing begins.

The outcomes remain distinct:

- Invalid input or a failed capture keeps the form, entered details and a recoverable message. An unchanged retry keeps its request ID.
- Saved contact without a reward URL replaces the form with **You're in La Cultura.** and clearly says the exclusive is being prepared.
- Saved contact with a backend reward URL shows the existing signed download link.

The success title receives focus and a polite status announces the result. A queued email is never described as sent or delivered. A new unchecked submission neither claims a marketing subscription nor changes existing preferences.

### 7. Open a single-release destination

Open `/music/accion` directly, refresh, and try another configured release slug. Each page resolves its own catalog data and reuses the existing artwork background theme.

The focused header contains the brand and hamburger menu. The waveform/player chrome is absent from this layout, while the AudioProvider remains mounted. Start audio on the homepage, visit a release, then return through the menu: the shared player still represents the same playback session.

The valid release page has no back-to-music link above the artwork and no provisional-design disclaimer. Artwork, artist/title/date and direct streaming actions come first. Local preview is secondary; its loading, retry and pause states remain usable.

**Stay close** is a compact, optional invitation below listening. Streaming never requires signup. The form uses the same capture component and endpoint as the homepage. It does not promise a track-specific reward. If the backend returns the existing Acción reward, that returned download can be shown truthfully; without a URL the compact form simply confirms the saved contact.

The existing API supports `source: "stay_close"` for this invitation. Release context travels through `lastTouch.release`, rather than adding a new source enum or changing a backend contract. First-touch attribution is preserved. A frontend fix prevents subsequent reads, after query parameters are consumed, from erasing the latest campaign. An explicit new campaign still replaces last touch.

On phones, the first viewport communicates artwork, artist, title and how to listen. The capture and consent controls remain nearby and may continue below the fold. Small screens and mobile landscape scroll naturally; controls are not reduced to fit a rigid one-screen box.

## Design and component architecture

| Area                    | Implementation                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Hero and socials        | `src/features/hero/Hero.tsx`; existing portrait, data and biography dialog                                            |
| Floating header         | `src/components/Header.tsx`, typed `home`/`release` variant; `src/hooks/useScrolled.ts`                               |
| Navigation panel        | `src/components/NavigationMenu.tsx`, existing `Dialog`, centralized `src/config/navigation.ts`                        |
| Shared capture          | `src/features/fan-capture/FanCaptureForm.tsx`; existing validation, fanService, analytics permission and attribution  |
| Release destination     | `src/features/music/ReleasePage.tsx`; repository lookup, existing themes, shared audio and capture                    |
| Streaming labels        | `src/config/streaming.ts`; existing release links remain canonical                                                    |
| Presentation            | `src/styles/experience.css`; obsolete feature-layout rules removed from `globals.css` rather than competing with them |
| Shared geometry         | `src/styles/tokens.css`; navigation safe area, spacing scale and radii                                                |
| Motion                  | `src/hooks/useSectionMotion.ts`; scoped GSAP timelines, `useGSAP`, matchMedia and refresh lifecycle                   |
| Attribution regression  | `src/services/attribution.ts` and its focused unit tests                                                              |
| Regression/visual tools | `tests/premium-experience.spec.ts`, existing experience/Stay Close tests, `scripts/visual-qa.mjs`                     |
| Delivery/CI             | `index.html` critical font preloads; workflow uploads ignored premium browser evidence                                |

Hero entrance uses 16px translation with a 65ms stagger; section groups use 20px and a 200ms total stagger; release foreground uses 14px with an 80ms stagger. The shared duration is 650ms with `power2.out`. Reduced motion skips decorative timelines and keeps content visible. The app bar uses CSS transitions, not a GSAP scroll animation.

GSAP remains scoped to each main element. Contexts revert on route/unmount/dependency changes. Font readiness, image loads and observed content-size changes schedule a bounded refresh; observers, listeners and frames are cleaned up. No permanent `will-change`, animated background blur, new animation library or global motion orchestrator is introduced. A three-cycle StrictMode browser check measured exactly three homepage ScrollTriggers and zero after each transition to a release page, with no page errors.

## Visual evidence

All generated evidence remains local and ignored under `artifacts/qa-premium/`; none is committed as application source. CI also uploads the premium browser-test evidence.

Baseline screenshots are in `before/`: `hero-1366.png`, `music-1366.png`, `vault-1366.png`, `stay-close-1366.png`, `release-1366.png`, and their 390px counterparts.

Production after screenshots use exact dimensions in `after/`:

| View                            | Desktop                        | Mobile                                               |
| ------------------------------- | ------------------------------ | ---------------------------------------------------- |
| Hero / integrated social footer | `hero-1366x768.png`            | `hero-390x844.png`                                   |
| Glass navigation / music        | `music-1366x768.png`           | `music-390x844.png`                                  |
| Vault                           | `vault-1366x768.png`           | `vault-390x844.png`                                  |
| Stay Close form                 | `stay-close-1366x768.png`      | `stay-close-390x844.png`                             |
| Saved / reward pending          | `capture-success-1366x768.png` | `capture-success-390x844.png`                        |
| Release                         | `release-1366x768.png`         | `release-390x844.png` and `release-full-390x844.png` |
| Release menu                    | `release-menu-1366x768.png`    | `release-menu-390x844.png`                           |

Additional screenshots cover 1440 × 900, 1440 × 800, 1280 × 800, 1024 × 768, 768 × 1024, 430 × 932, 375 × 812, 320 × 568 and 844 × 390. Geometry and accessibility results are saved beside them. No screen-recording file was attached for this turn; comparison uses the actual baseline and the written creative direction.

## Validation

With Node 24.22.1 and Deno 2.9.6:

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run test:db
npm run test:edge
npm run test:e2e -- --workers=2
VISUAL_QA_URL=http://127.0.0.1:4174 npm run qa:visual
```

All pass. Unit/component tests: **15 across five files**. Edge checks: **11 entrypoints type-check and five handler tests pass**. Embedded PostgreSQL checks pass, including fan deduplication, consent confirmation/revocation, transaction/replay behavior and negative access cases. Browser suite: **32 tests pass**, including the existing 320px and delayed-font overflow checks. No assertions are skipped or made unconditional.

The new browser coverage includes the priority hero sizes, desktop scene composition, hidden release player chrome with preserved playback, menu focus trapping/restoration, release capture validation/retry, first/last attribution, EN/ES and explicit consent, signed rewards, small/landscape reflow and snap/footer accessibility. Stay Close anchor tests now check the visible heading against the floating header and the correctly aligned scene; they no longer mistake the scene's background boundary for content clearance.

Production-preview QA covered **11 viewport pairs**, **22 WCAG A/AA/2.1 axe scans**, zero automated violations, zero page errors and no document horizontal overflow. Scans include primary scenes, glass header, saved capture, release, release capture, menu, biography and support. Screenshot pixels behind transparent navigation were also checked because image-background contrast is not fully assessed by axe; the five sampled final backdrop ratios range from 4.84:1 to 6.57:1.

Capture/download tests use deterministic HTTP stubs and `fan@example.com`. No real contact records, marketing sends, payments or provider settings are changed by these tests. Physical iOS/Android keyboards, Safari and manual screen-reader certification remain outside this local Chromium audit.

## Performance

Paired production mobile Lighthouse samples use the same local settings:

| Metric              | Before |  After |
| ------------------- | -----: | -----: |
| Performance         |     86 |     94 |
| Accessibility       |    100 |    100 |
| LCP                 |  3.91s |  2.86s |
| Total blocking time |   19ms | 17.5ms |
| CLS                 |      0 |      0 |

An earlier after-run scored 95 with 2.88s LCP; both reports are retained to make run-to-run variation visible. These are simulated local samples, not field Core Web Vitals or proof that one individual change caused the gain. LCP remains above 2.5s. Existing cover assets and portrait are reused; there are no new bitmap bytes or dependencies. Two existing critical WOFF2 fonts are preloaded early, with Vite resolving them to fingerprinted production URLs. The hero image retains high fetch priority and explicit intrinsic dimensions.

Production JavaScript is 436.89KB / 148.88KB gzip, versus 432.36KB / 147.32KB gzip before. CSS is 41.21KB / 9.43KB gzip, versus 35.63KB / 8.56KB gzip. The refinement adds about 2.4KB combined gzip CSS/JS, plus about 0.1KB gzip HTML. Background image decoding/cache and the audio engine are unchanged.

## Platforms and publishing handoff

There is **no new third-party platform to connect for this refinement**. The hosted Supabase capture integration remains in place. No migration, Edge Function deployment, Stripe configuration change, Storage permission change or new secret is needed.

For existing platform setup and owner-run acceptance steps, use [the service connection guide](integrations/SETUP_GUIDE.md) and [provider acceptance checklist](qa/PROVIDER_ACCEPTANCE.md). Those cover Supabase, private rewards, Stripe test mode, Resend, scheduling, optional Meta measurement and hosting. Actual provider email delivery and Stripe test-mode acceptance still require those owner checks; a mocked browser success is not a delivery claim.

When publishing this frontend later, build with the existing public Vite configuration and configure the host to serve `index.html` for direct React Router routes such as `/music/accion`. Only the existing publishable Supabase key belongs in public frontend configuration. Keep privileged credentials server-side. Review both priority viewports and one real capture with your own test address after publishing.

No production deployment or merge is part of this refinement. Generated screenshots, reports, environment files and caches stay ignored. The source, tests and this walkthrough form the reviewable change on `premium-refinement`; actual remote CI conclusions are reported in the final handoff after pushing.

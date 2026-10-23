# Release-driven theme implementation

## Plan and scope

- Preserve the existing React/Vite repository, carousel layout, shared audio, Stay Close changes, and backend.
- Reuse existing optimized WebP covers. Canonical release `coverArt` supplies the default; optional `theme.backgroundImage` supplies a composed override.
- One pure resolver supplies safe complete presentation settings; one decorative background component manages decoded layers and opacity crossfades.
- Selection drives music themes; route-resolved metadata drives landing-page themes. No audio-derived theme state.
- Verify defaults/overrides, loading failure, interruption/cleanup, keyboard/audio independence, direct routes, reduced motion, responsive layout and contrast. Capture desktop/mobile themes and compare local production performance.
- Existing pending Stay Close edits remain separate. No database migration, Edge Function redeploy, provider change, image pipeline, or dependency is required.

## Implementation

`MusicRelease.coverArt` is the canonical public cover field (renamed from `artworkUrl` in release metadata and its display consumers; Vault records retain their existing field). Optional `ReleaseTheme` supports only `backgroundImage`, `overlayColor`, `overlayOpacity` and `backgroundPosition`. The local repository remains the source. No backend data model or service changed.

`resolveReleaseTheme()` chooses `theme.backgroundImage` → `coverArt` → dark fallback, and returns complete settings. Default overlay is `#180e12` at 0.8 opacity. The resolver checks the brightest possible white cover against the muted foreground token, increases insufficient opacity, and falls back from an overly bright overlay color. Normal muted text on themed surfaces uses `--bone-1`; decorative backgrounds remain `aria-hidden` and pointer-inert. No release-specific selectors or color maps exist.

`ReleaseThemeBackground` owns no content, selection, routing or audio. It loads the requested image before rendering it, uses native decode with load/error fallback, and crossfades opacity over 600ms. A small reducer manages a stable base, one incoming layer and the latest pending result. On interruption, the current fade reverses over the stable base before admitting the latest decoded request. Unentered obsolete layers are dropped immediately. Cancellation flags prevent slow obsolete image loads from becoming current. Old layers are removed on transition completion with bounded timeout cleanup. There are never more than two decorative image layers; no repeated animation queue accumulates.

The existing covers supply color naturally. A fixed 24px contained blur is never animated. Image layers extend past the clip bounds, and dark edge gradients blend with the existing section. CSS lives in `src/styles/release-theme.css`; it changes only containers marked `release-theme-host`. The existing layout and GSAP reveal hook are retained. Reduced motion explicitly disables the fade, overriding the existing global minimal-duration rule.

Background loading near La Música is deferred with IntersectionObserver until the section approaches the viewport (200px margin). Direct release pages use immediate loading with high fetch priority. An eight-entry LRU-style promise cache reuses loaded/decoded URLs; failures are evicted for retry. There is no full-catalog preload. Existing carousel neighbor covers already provide the adjacent artwork requests, and duplicate URLs share browser caching. No new image derivative, image-processing tool, runtime dependency, state library or animation framework was added.

## Maintenance

Add the next release as one entry in `src/data/content.ts`:

```ts
{
  id: "next-single",
  artistId: artist.id,
  slug: "next-single",
  title: "Next Single",
  releaseDate: "2026-11-01",
  coverArt: "/assets/next-single.webp",
  previewUrl: "/assets/preview-next-single.m4a",
  featured: false,
  streamingLinks: { /* verified destinations only */ },
}
```

That cover automatically powers the foreground art and theme in the carousel and `/music/next-single`. Keep cover assets optimized using the existing asset workflow. If a special composition is later available, add only this optional property to that entry:

```ts
theme: {
  backgroundImage: "/assets/next-single-background.webp",
  overlayColor: "#210c15",
  overlayOpacity: 0.9,
  backgroundPosition: "65% 40%",
}
```

No component, CSS selector, migration or Edge Function redeploy is needed. Overlay color accepts a six-digit hex value; opacity is 0–1 and is strengthened when necessary for contrast. A different position can be used without a different image. An invalid/missing background uses the cover or safe dark fallback. A failed next image keeps the last successfully rendered theme.

## Verification and evidence

- `npm run typecheck`, `npm run lint`, `npm run build`: PASS.
- `npm test`: PASS, 13 tests across four files, including cover fallback/overrides, white-cover contrast guard, repository lookup, decoded readiness, unchanged selections/cache reuse, stale load rejection, initial failure, interrupted transition cleanup and the existing audio engine tests.
- Browser suite: existing capture/checkout/consent/navigation/Stay Close regressions plus theme tests for arrows/keyboard/artwork selection, shared audio continuing independently, actual intermediate opacity frames, rapid/interrupted navigation, direct page/refresh/SPA route, missing artwork, reduced motion, bounded DOM layers and unchanged section geometry.
- Responsive checks: 1440, 1024, 768, 390 and 320px, no horizontal overflow, stable other-surface backgrounds, and no focus theft on theme changes.
- axe scan: zero WCAG A/AA/2.1 violations in Acción, Darte Nota and Café music themes plus Café landing page at 390/1440px. The pure contrast guard separately tests an all-white image, which automated image-background scans alone cannot fully evaluate. This does not certify every device/screenreader.

Screenshots (music crops omit the fixed header so its viewport position does not obscure the section in full-element captures):

| Surface      | Desktop                                                               | Mobile                                                              |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Acción       | [1440px](../../artifacts/qa-release-themes/music-accion-1440.png)     | [390px](../../artifacts/qa-release-themes/music-accion-390.png)     |
| Darte Nota   | [1440px](../../artifacts/qa-release-themes/music-darte-nota-1440.png) | [390px](../../artifacts/qa-release-themes/music-darte-nota-390.png) |
| Café         | [1440px](../../artifacts/qa-release-themes/music-cafe-1440.png)       | [390px](../../artifacts/qa-release-themes/music-cafe-390.png)       |
| Café release | [1440px](../../artifacts/qa-release-themes/release-cafe-1440.png)     | [390px](../../artifacts/qa-release-themes/release-cafe-390.png)     |

## Performance

All six cover assets are existing WebP files: Acción 6,378 bytes; Darte Nota 3,444; Contenta 53,124; Café 59,158; Caramelo 32,812; Viaje Astral 82,640. Total catalog cover size: 237,556 bytes. No additional bitmap bytes were created. Theme loading requests only the selected cover or its override; the browser reuses URLs already used by foreground art.

Paired local production Lighthouse mobile runs are saved as `lighthouse-before.json` and `lighthouse-after.json`. Baseline performance 87 / accessibility 100, LCP 3.9s, TBT 20ms, CLS 0; themed build performance 86 / accessibility 100, LCP 4.0s, TBT 10ms, CLS 0. The approximately 0.1s difference is reported rather than hidden; both runs remain around the existing four-second LCP level. Single simulated runs do not establish a statistically meaningful regression or field Core Web Vitals. The underlying 2.5s LCP goal remains unmet and needs host/font/render tuning outside this scoped feature.

The final build is 432.36KB JavaScript (147.32KB gzip) and 35.59KB CSS (8.54KB gzip), versus the preceding 428.23KB / 145.71KB gzip JavaScript and 35.72KB / 8.67KB gzip CSS. The theme adds about 1.6KB gzip JavaScript; the source-scan boundary makes CSS slightly smaller. Final build figures and final browser counts are recorded below after the last validation. No all-catalog decode or expensive animated blur was introduced. Tailwind class detection is scoped to `src/` so generated report HTML and documentation cannot inflate product CSS ([official source-exclusion guidance](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path)).

## Changed files

- `src/domain/types.ts`, `releaseTheme.ts` and resolver tests.
- `src/components/ReleaseThemeBackground.tsx`, image loader, transition reducer and component tests.
- `src/styles/release-theme.css` and its import in `src/main.tsx`; Tailwind application-source boundary in `globals.css`.
- Existing metadata/display references in `src/data/content.ts`, MusicSection, Hero, Header, ReleasePage and the audio test fixture. AudioProvider itself is unchanged.
- `tests/release-themes.spec.ts`, theme QA artifacts and this maintenance/validation guide.

No database, Supabase function, payment, messaging, analytics or consent source is changed for this task. Existing pending Stay Close changes in shared files are preserved separately from the theme commit.

## Final validation and Git

Final commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e`. The browser run passes 23 tests (17.8s); the unit/component run passes 13 tests in four files. Production CSS/JS remain within the previous Phase 1 bundle budgets; exact sizes are recorded by the final build output and performance artifacts.

Work is isolated on local branch `feat/release-themes`. The theme-only commit excludes the pending Stay Close edits, including those in shared App source. No push, production deployment, migration or function deployment is performed. Apply the same local frontend build process when you choose to publish.

## Acceptance status

| Requirement                                                     | Evidence                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Selection-driven music theme, independent audio                 | Browser arrow/keyboard/artwork selection and live shared-preview test                                                                   |
| Route-driven release theme, direct load/refresh/SPA             | Browser route tests and landing screenshots                                                                                             |
| Central defaults and optional override, future release fallback | Typed model, pure resolver/repository tests; no per-release styling                                                                     |
| Smooth decoded crossfade and rapid latest-selection behavior    | Intermediate computed-opacity assertion, readiness tests and bounded-layer/slow-load interruption test                                  |
| Failure fallback and cleanup                                    | Initial/next-image failure tests, reducer cleanup checks, max two DOM layers                                                            |
| Reduced motion and focus preservation                           | Explicit zero-duration override, keyboard focus assertions                                                                              |
| Contrast                                                        | Worst-white-cover numeric guard plus zero axe violations across eight sampled surfaces                                                  |
| Responsive layout and scoped changes                            | Five viewport widths, stable section height and unchanged other-surface computed backgrounds                                            |
| Lightweight assets/performance                                  | Existing WebP bytes only, near-viewport decoding/cache, about 1.6KB gzip JS; LCP remains about 4s, not a demonstrated field improvement |
| Existing functionality and pending changes preserved            | Full capture/checkout/audio/navigation regression suite; separate staging of App/CSS hunks                                              |

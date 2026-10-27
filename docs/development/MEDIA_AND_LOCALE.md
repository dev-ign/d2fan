# Media and locale maintenance

## Runtime media

`src/features/hero/HeroVideo.tsx` selects one silent decorative video per mount from `public/assets/hero/bts-{desktop,mobile}.mp4`, with matching WebP posters. Portrait screens through 760px, plus portrait tablets through 960px, select mobile. Reduced motion keeps the poster and removes the video source. Offscreen/hidden documents pause; autoplay/delivery failures retain the poster. This video is independent of the single global audio player.

The current 59.13-second chronological edit preserves all 1,774 frames at 30 fps. Desktop is 1920×1080, 26,161,120 bytes; mobile is 720×1280, 9,089,264 bytes. Posters total 63,264 bytes. These delivery assets belong in Git. The 253 MB approved camera edit, earlier 471 MB master and previous encodes remain locally in ignored `source-media/`; arrange a separate source-media backup when moving machines.

`sh scripts/encode-hero.sh [source] [output-directory] [report-directory]` requires FFmpeg/ffprobe and Python Pillow. Defaults read `source-media/new-hero-video.mp4`, write delivery files to `public/assets/hero`, and write diagnostics to `artifacts/media/hero-encoding.json`. The script contains the shot-specific portrait framing and frame/cadence validation. Encoding diagnostics and contact sheets are local artifacts, never runtime dependencies. `python3 scripts/hero-contact-sheet.py` assembles captures made by `tests/hero-video.spec.ts`; it requires Pillow.

`BiographyGallery.tsx` keeps five slides: two crops of the original portrait plus `jona1.webp`, `jona2.webp`, `jona7.webp` under `public/assets/photoss/`. Runtime paths retain the supplied `photoss` spelling. The three WebPs total 355,368 bytes and remain tracked. Unused PNG masters totaling 6,243,004 bytes were preserved byte-for-byte under ignored `source-media/biography/`, outside Vite's public copy step. `python3 scripts/encode-biography.py` reads those masters and recreates the public WebPs using Pillow quality 88. It fails clearly if masters are absent.

Vite denies `source-media` paths in development; the production build copies only runtime public assets. Never place private licensed reward/purchase content there. Those files belong in private Supabase Storage with server-only `PRIVATE_FILE_PATHS` mappings.

## Locale and navigation

`LocaleProvider` wraps router/audio state. `jona:locale` in localStorage selects English only for the exact `en` value; otherwise the default is Spanish. Storage failure preserves an in-memory choice. The provider updates HTML language, title and description. `src/config/messages.ts` combines form copy with typed `src/i18n/site.ts` dictionaries. `site.test.ts` checks keys and interpolation parity. The globe menu supports keyboard selection and focus return.

Language changes preserve audio, release selection and form drafts. Server errors are English; Spanish views substitute generic localized feedback. New contacts send the selected language to capture. Existing fans retain their original preferred language: public repeat capture deliberately does not update a verified profile. Emails use that stored value, while Stripe Checkout currently uses its automatic locale.

`useRouteScroll` owns initial hero positioning, explicit anchors and history restoration. `useActiveSection` owns the viewport-based navigation highlight. Do not reintroduce independent effects that reset scroll during playback/modal/locale changes.

`tests/localization.spec.ts` and `tests/hero-video.spec.ts` cover nine widths, navigation/history, posters/playback, reduced motion and gallery behavior. Chrome emulation does not establish physical iOS/Safari, screen-reader or real touch-device compatibility. Historical screenshot reports remain local; this document preserves the operational decisions.

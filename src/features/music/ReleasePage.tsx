import { useLocale, text, audioError } from "../../hooks/useLocale";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
} from "lucide-react";
import type { MusicRelease } from "../../domain/types";
import { catalog } from "../../config/runtime";
import { localContentRepository } from "../../repositories/localContentRepository";
import { resolveReleaseTheme } from "../../domain/releaseTheme";
import { ReleaseThemeBackground } from "../../components/ReleaseThemeBackground";
import { FanCaptureForm } from "../fan-capture/FanCaptureForm";
import { WallpaperPreview } from "../fan-capture/WallpaperPreview";
import { runtime } from "../../config/runtime";
import { useAudio } from "../../hooks/useAudio";
import { useSectionMotion } from "../../hooks/useSectionMotion";
import { artist } from "../../data/content";
import { formatReleaseDate } from "../../data/releaseMetadata";
import { StreamingLinks } from "./StreamingLinks";
import { ReleaseShare } from "./ReleaseShare";

export function ReleasePage() {
  const { t, locale } = useLocale();
  const { slug } = useParams();
  const [release, setRelease] = useState<MusicRelease | null | undefined>(
    undefined,
  );
  const audio = useAudio();
  const scope = useSectionMotion(release?.id ?? false);
  useEffect(() => {
    let live = true;
    void localContentRepository
      .getReleaseBySlug(catalog.artistId, slug ?? "")
      .then((item) => {
        if (live) setRelease(item);
      });
    return () => {
      live = false;
    };
  }, [slug]);
  if (release === undefined)
    return <main className="release-page" aria-busy="true" />;
  if (!release)
    return (
      <main className="release-page">
        <div className="container">
          <p className="eyebrow">{t.release.missing}</p>
          <h1 className="display-heading">
            {t.release.notFirst} <em>{t.release.notSecond}</em>
          </h1>
          <Link to="/" className="button button--outline">
            <ArrowLeft size={16} />
            {t.release.back}
          </Link>
        </div>
      </main>
    );
  const current = audio.release?.id === release.id;
  const playing = current && audio.status === "playing";
  const loading = current && audio.status === "loading";
  const failed = current && audio.status === "error";
  const upcoming = release.publicationStatus === "upcoming";
  const releaseLabel = upcoming
    ? t.release.upcoming
    : release.publicationStatus === "released"
      ? t.release.outNow
      : t.common.single;
  return (
    <main
      ref={scope}
      className="release-page release-theme-host"
      aria-labelledby="release-title"
    >
      <ReleaseThemeBackground theme={resolveReleaseTheme(release)} priority />
      <div className="container release-page-inner">
        <div className="release-page-grid">
          <div className="release-artwork reveal">
            <img
              src={release.coverArt}
              alt={text(t.common.cover, { title: release.title })}
              width="640"
              height="640"
              fetchPriority="high"
            />
          </div>
          <div className="release-page-copy reveal">
            <p
              className="eyebrow release-artist"
              data-preserve-display-case={release.preserveDisplayCase}
            >
              {release.artistCredit ?? artist.displayName}
            </p>
            <h1
              id="release-title"
              className="display-heading"
              data-preserve-display-case={release.preserveDisplayCase}
            >
              {release.title}
            </h1>
            <p className="release-date">
              {releaseLabel} ·{" "}
              <time dateTime={release.releaseDate}>
                {formatReleaseDate(release.releaseDate, locale)}
              </time>
            </p>
            <div className="release-listening">
              <div className="release-page-actions">
                <StreamingLinks release={release} />
                {!upcoming && release.previewUrl && (
                  <button
                    className="preview-action"
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void (current ? audio.toggle() : audio.play(release))
                    }
                  >
                    {loading ? (
                      <LoaderCircle size={18} className="spin-icon" />
                    ) : failed ? (
                      <RotateCw size={18} />
                    ) : playing ? (
                      <Pause size={18} />
                    ) : (
                      <Play size={18} />
                    )}
                    {loading
                      ? t.player.loading
                      : failed
                        ? t.player.retry
                        : playing
                          ? t.player.pause
                          : t.player.play}
                  </button>
                )}
              </div>
              {current && audio.error && (
                <p className="preview-error" role="alert">
                  {audioError(audio.error, t)}
                </p>
              )}
              {release.campaignId && (
                <ReleaseShare
                  key={release.id}
                  slug={release.slug}
                  title={release.title}
                  credit={release.artistCredit ?? artist.displayName}
                  campaignId={release.campaignId}
                />
              )}
              <Link className="fan-jump" to="#release-signup">
                {runtime.laCulturaWallpapers
                  ? t.wallpapers.offer
                  : t.stay.rewardCta}{" "}
                <ArrowDown size={14} aria-hidden="true" />
              </Link>
            </div>
            <section
              className="release-capture"
              id="release-signup"
              tabIndex={-1}
              aria-labelledby="release-capture-heading"
            >
              <div className="release-capture-intro">
                <h2 id="release-capture-heading">
                  {t.release.stay} <em>{t.release.close}</em>
                </h2>
                <p>
                  {runtime.laCulturaWallpapers
                    ? t.wallpapers.description
                    : release.campaignId
                      ? t.stay.campaignIntro
                      : t.stay.releaseIntro}
                </p>
              </div>
              {runtime.laCulturaWallpapers && <WallpaperPreview />}
              <FanCaptureForm key={release.id} releaseSlug={release.slug} />
            </section>
            {release.campaignId && (
              <Link className="release-link release-discovery" to="/#music">
                {t.release.explore}
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

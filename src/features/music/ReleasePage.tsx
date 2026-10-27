import { useLocale, text, audioError } from "../../hooks/useLocale";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  LoaderCircle,
  Pause,
  Play,
  RotateCw,
} from "lucide-react";
import type { MusicRelease } from "../../domain/types";
import { catalog } from "../../config/runtime";
import { platformNames } from "../../config/streaming";
import { localContentRepository } from "../../repositories/localContentRepository";
import { resolveReleaseTheme } from "../../domain/releaseTheme";
import { ReleaseThemeBackground } from "../../components/ReleaseThemeBackground";
import { FanCaptureForm } from "../fan-capture/FanCaptureForm";
import { useAudio } from "../../hooks/useAudio";
import { useSectionMotion } from "../../hooks/useSectionMotion";
import { analytics } from "../../services/analytics";

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
            <p className="eyebrow release-artist">JONA FERREIRA</p>
            <h1 id="release-title" className="display-heading">
              {release.title}
            </h1>
            <p className="release-date">
              {t.common.single} ·{" "}
              {new Date(`${release.releaseDate}T12:00:00`).toLocaleString(
                locale === "es" ? "es" : "en-US",
                { month: "long", day: "numeric", year: "numeric" },
              )}
            </p>
            <div className="release-listening" aria-label={t.release.listen}>
              <div className="release-page-actions">
                {Object.entries(release.streamingLinks).map(
                  ([platform, url]) =>
                    url && (
                      <a
                        key={platform}
                        className="button button--bone"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          analytics.track("DSPClick", {
                            release_slug: release.slug,
                            platform,
                          })
                        }
                      >
                        {
                          platformNames[
                            platform as keyof typeof release.streamingLinks
                          ]
                        }
                        <ArrowUpRight size={17} aria-hidden="true" />
                      </a>
                    ),
                )}
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
              </div>
              {current && audio.error && (
                <p className="preview-error" role="alert">
                  {audioError(audio.error, t)}
                </p>
              )}
            </div>
            <section
              className="release-capture"
              aria-labelledby="release-capture-heading"
            >
              <div className="release-capture-intro">
                <h2 id="release-capture-heading">
                  {t.release.stay} <em>{t.release.close}</em>
                </h2>
                <p>{t.release.invitation}</p>
              </div>
              <FanCaptureForm key={release.id} compact />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

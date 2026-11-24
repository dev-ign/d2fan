import { useLocale, text, audioError } from "../../hooks/useLocale";
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LoaderCircle, Play, RotateCw } from "lucide-react";
import type { MusicRelease } from "../../domain/types";
import { useAudio } from "../../hooks/useAudio";
import { Waveform } from "../../components/Waveform";
import { ReleaseThemeBackground } from "../../components/ReleaseThemeBackground";
import { resolveReleaseTheme } from "../../domain/releaseTheme";
import { StreamingMenu } from "./StreamingMenu";
import { formatReleaseDate } from "../../data/releaseMetadata";

export function MusicSection({
  releases,
  featuredReleaseId,
}: {
  releases: MusicRelease[];
  featuredReleaseId: string;
}) {
  const { t, locale } = useLocale();
  const [selectedId, setSelectedId] = useState<string>();
  const index = Math.max(
    releases.findIndex(
      (release) => release.id === (selectedId ?? featuredReleaseId),
    ),
    0,
  );
  const indicators = useRef<HTMLDivElement>(null);
  const audio = useAudio();
  const active = releases[index];

  useLayoutEffect(() => {
    const strip = indicators.current;
    const selected = strip?.children.item(index) as HTMLElement | null;
    if (!strip || !selected) return;

    const revealSelection = (behavior: ScrollBehavior) => {
      const start = selected.offsetLeft;
      const end = start + selected.offsetWidth;
      if (start < strip.scrollLeft - 1) {
        strip.scrollTo({ left: start, behavior });
      } else if (end > strip.scrollLeft + strip.clientWidth + 1) {
        strip.scrollTo({ left: end - strip.clientWidth, behavior });
      }
    };
    revealSelection(
      matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    );
    let width = strip.clientWidth;
    const observer = new ResizeObserver(() => {
      if (strip.clientWidth === width) return;
      width = strip.clientWidth;
      revealSelection("instant");
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, [index]);

  if (!active) return null;
  const previous = releases[index === 0 ? releases.length - 1 : index - 1];
  const next = releases[(index + 1) % releases.length];
  const activePlaying =
    audio.release?.id === active.id && audio.status === "playing";
  const activeLoading =
    audio.release?.id === active.id && audio.status === "loading";
  const activeError =
    audio.release?.id === active.id && audio.status === "error";

  function select(nextIndex: number) {
    const normalized = (nextIndex + releases.length) % releases.length;
    setSelectedId(releases[normalized].id);
  }
  async function togglePreview() {
    if (audio.release?.id === active.id) await audio.toggle();
    else await audio.play(active);
  }
  return (
    <section
      className="music-section release-theme-host"
      id="music"
      aria-labelledby="music-title"
    >
      <ReleaseThemeBackground theme={resolveReleaseTheme(active)} />
      <div className="container music-content">
        <div className="section-intro music-intro reveal">
          <h2 id="music-title" className="editorial-heading">
            <span>{t.music.first}</span>
            <em>{t.music.second}</em>
          </h2>
        </div>
        <div className="music-main">
          <div className="release-details reveal">
            <div className="release-head">
              {active.previewUrl && (
                <button
                  className="round-play"
                  type="button"
                  onClick={() => void togglePreview()}
                  disabled={activeLoading}
                  aria-label={
                    activeLoading
                      ? text(t.music.loading, { title: active.title })
                      : activeError
                        ? text(t.music.retry, { title: active.title })
                        : activePlaying
                          ? text(t.music.pause, { title: active.title })
                          : text(t.music.play, { title: active.title })
                  }
                >
                  {activeLoading ? (
                    <LoaderCircle className="spin-icon" size={28} />
                  ) : activeError ? (
                    <RotateCw size={28} />
                  ) : activePlaying ? (
                    <img
                      src="/assets/pause.svg"
                      alt=""
                      width="26"
                      height="26"
                    />
                  ) : (
                    <Play fill="currentColor" size={28} />
                  )}
                </button>
              )}
              <div>
                <h3 data-preserve-display-case={active.preserveDisplayCase}>
                  {active.title}
                </h3>
                <p>
                  {active.artistCredit && <>{active.artistCredit} · </>}
                  {active.publicationStatus === "released"
                    ? t.release.outNow
                    : t.common.single}{" "}
                  · {formatReleaseDate(active.releaseDate, locale)}
                </p>
              </div>
            </div>
            {audio.release?.id === active.id && audio.error && (
              <p className="preview-error" role="alert">
                {audioError(audio.error, t)}
              </p>
            )}
            <div className="release-actions">
              <StreamingMenu key={active.id} release={active} />
              <Link className="release-link" to={`/music/${active.slug}`}>
                {t.music.releasePage} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
          <div className="artwork-stage reveal" aria-label={t.music.artwork}>
            <button
              type="button"
              className="neighbor-art neighbor-art--left"
              onClick={() => select(releases.indexOf(previous))}
              aria-label={text(t.common.select, { title: previous.title })}
            >
              <img
                src={previous.coverArt}
                alt=""
                width="640"
                height="640"
                loading="lazy"
              />
            </button>
            <div className="active-art" key={active.id}>
              <img
                src={active.coverArt}
                alt={text(t.common.cover, { title: active.title })}
                width="640"
                height="640"
                loading="lazy"
              />
              {audio.release?.id === active.id && (
                <span className="playing-chip">
                  <Waveform active={activePlaying} bars={5} />
                  {activeLoading
                    ? t.music.chipLoading
                    : activeError
                      ? t.music.chipError
                      : activePlaying
                        ? t.music.chipPlaying
                        : t.music.chipPaused}
                </span>
              )}
            </div>
            <button
              type="button"
              className="neighbor-art neighbor-art--right"
              onClick={() => select(releases.indexOf(next))}
              aria-label={text(t.common.select, { title: next.title })}
            >
              <img
                src={next.coverArt}
                alt=""
                width="640"
                height="640"
                loading="lazy"
              />
            </button>
          </div>
        </div>
        <div className="music-controls reveal">
          <span>
            {index + 1} / {releases.length}
          </span>
          <button
            className="circle-arrow"
            type="button"
            aria-label={t.music.previous}
            onClick={() => select(index - 1)}
          >
            <img src="/assets/arrow-left.svg" alt="" width="16" height="16" />
          </button>
          <button
            className="circle-arrow"
            type="button"
            aria-label={t.music.next}
            onClick={() => select(index + 1)}
          >
            <img src="/assets/arrow-right.svg" alt="" width="16" height="16" />
          </button>
        </div>
        <div
          className="release-tabs reveal"
          ref={indicators}
          role="group"
          aria-label={t.music.choose}
        >
          {releases.map((release, tabIndex) => (
            <button
              key={release.id}
              type="button"
              className={index === tabIndex ? "selected" : ""}
              onClick={() => select(tabIndex)}
              aria-current={index === tabIndex ? "true" : undefined}
            >
              {release.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

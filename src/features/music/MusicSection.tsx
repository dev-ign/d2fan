import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LoaderCircle, Play, RotateCw } from "lucide-react";
import type { MusicRelease } from "../../domain/types";
import { useAudio } from "../../hooks/useAudio";
import { Waveform } from "../../components/Waveform";
import { ReleaseThemeBackground } from "../../components/ReleaseThemeBackground";
import { resolveReleaseTheme } from "../../domain/releaseTheme";
import { analytics } from "../../services/analytics";

const platformNames: Record<keyof MusicRelease["streamingLinks"], string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtube: "YouTube Music",
  amazonMusic: "Amazon Music",
};

export function MusicSection({ releases }: { releases: MusicRelease[] }) {
  const [index, setIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const audio = useAudio();
  const active = releases[index];
  const previous = releases[index === 0 ? releases.length - 1 : index - 1];
  const next = releases[(index + 1) % releases.length];
  const activePlaying =
    audio.release?.id === active.id && audio.status === "playing";
  const activeLoading =
    audio.release?.id === active.id && audio.status === "loading";
  const activeError =
    audio.release?.id === active.id && audio.status === "error";

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  if (!active) return null;
  function select(nextIndex: number) {
    const normalized = (nextIndex + releases.length) % releases.length;
    setIndex(normalized);
    setMenuOpen(false);
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
            <span>LA</span>
            <em>MUSICA.</em>
          </h2>
          <p>
            Preview the full discography and access the music on streaming
            platforms.
          </p>
        </div>
        <div className="music-main">
          <div className="release-details reveal">
            <div className="release-head">
              <button
                className="round-play"
                type="button"
                onClick={() => void togglePreview()}
                disabled={activeLoading}
                aria-label={
                  activeLoading
                    ? `Loading ${active.title} preview`
                    : activeError
                      ? `Retry ${active.title} preview`
                      : activePlaying
                        ? `Pause ${active.title} preview`
                        : `Play ${active.title} preview`
                }
              >
                {activeLoading ? (
                  <LoaderCircle className="spin-icon" size={28} />
                ) : activeError ? (
                  <RotateCw size={28} />
                ) : activePlaying ? (
                  <img src="/assets/pause.svg" alt="" width="26" height="26" />
                ) : (
                  <Play fill="currentColor" size={28} />
                )}
              </button>
              <div>
                <h3>{active.title}</h3>
                <p>
                  Single ·{" "}
                  {new Date(`${active.releaseDate}T12:00:00`).toLocaleString(
                    "en-US",
                    { month: "long", year: "numeric" },
                  )}
                </p>
              </div>
            </div>
            {audio.release?.id === active.id && audio.error && (
              <p className="preview-error" role="alert">
                {audio.error}
              </p>
            )}
            <div className="release-actions">
              <div className="stream-anchor" ref={menuRef}>
                <button
                  className="button button--outline"
                  type="button"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  Listen on{" "}
                  <img src="/assets/down.svg" alt="" width="12" height="12" />
                </button>
                {menuOpen && (
                  <div className="stream-menu" role="menu">
                    <p className="eyebrow">
                      OPEN {active.title.toUpperCase()} IN
                    </p>
                    {Object.entries(active.streamingLinks).map(
                      ([platform, url]) =>
                        url && (
                          <a
                            role="menuitem"
                            key={platform}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              setMenuOpen(false);
                              analytics.track("DSPClick", {
                                release_slug: active.slug,
                                platform,
                              });
                            }}
                          >
                            {
                              platformNames[
                                platform as keyof MusicRelease["streamingLinks"]
                              ]
                            }
                            <img
                              src="/assets/external.svg"
                              alt=""
                              width="12"
                              height="12"
                            />
                          </a>
                        ),
                    )}
                  </div>
                )}
              </div>
              <Link className="release-link" to={`/music/${active.slug}`}>
                Release page <ArrowRight size={18} />
              </Link>
            </div>
          </div>
          <div
            className="artwork-stage reveal"
            aria-label="Release artwork carousel"
          >
            <button
              type="button"
              className="neighbor-art neighbor-art--left"
              onClick={() => select(releases.indexOf(previous))}
              aria-label={`Select ${previous.title}`}
            >
              <img src={previous.coverArt} alt="" />
            </button>
            <div className="active-art" key={active.id}>
              <img src={active.coverArt} alt={`${active.title} cover art`} />
              {audio.release?.id === active.id && (
                <span className="playing-chip">
                  <Waveform active={activePlaying} bars={5} />
                  {activeLoading
                    ? "LOADING PREVIEW"
                    : activeError
                      ? "PREVIEW UNAVAILABLE"
                      : activePlaying
                        ? "NOW PLAYING"
                        : "PREVIEW PAUSED"}
                </span>
              )}
            </div>
            <button
              type="button"
              className="neighbor-art neighbor-art--right"
              onClick={() => select(releases.indexOf(next))}
              aria-label={`Select ${next.title}`}
            >
              <img src={next.coverArt} alt="" />
            </button>
          </div>
        </div>
        <div className="music-controls">
          <span>{Math.min(Math.floor(index / 2) + 1, 3)} / 3</span>
          <button
            className="circle-arrow"
            type="button"
            aria-label="Previous release"
            onClick={() => select(index - 1)}
          >
            <img src="/assets/arrow-left.svg" alt="" width="16" height="16" />
          </button>
          <button
            className="circle-arrow"
            type="button"
            aria-label="Next release"
            onClick={() => select(index + 1)}
          >
            <img src="/assets/arrow-right.svg" alt="" width="16" height="16" />
          </button>
        </div>
        <div
          className="release-tabs"
          role="group"
          aria-label="Choose a release"
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

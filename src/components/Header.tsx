import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LoaderCircle, Menu, Pause, Play, RotateCw, X } from "lucide-react";
import { useAudio } from "../hooks/useAudio";
import { Waveform } from "./Waveform";
import { useScrolled } from "../hooks/useScrolled";
import { NavigationMenu } from "./NavigationMenu";
import { navigation } from "../config/navigation";

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function Header({
  onSupport,
  variant = "home",
}: {
  onSupport: () => void;
  variant?: "home" | "release";
}) {
  const { pathname } = useLocation();
  const [playerOpen, setPlayerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const playerRef = useRef<HTMLDivElement>(null);
  const audio = useAudio();
  const scrolled = useScrolled();

  useEffect(() => {
    if (pathname !== "/") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-30% 0px -50% 0px" },
    );
    const observed = new Set<string>();
    const attach = () => {
      ["music", "vault", "stay-close"].forEach((id) => {
        const node = document.getElementById(id);
        if (node && !observed.has(id)) {
          observer.observe(node);
          observed.add(id);
        }
      });
      if (observed.size === 3) pending.disconnect();
    };
    const pending = new MutationObserver(attach);
    pending.observe(document.getElementById("root")!, {
      childList: true,
      subtree: true,
    });
    attach();
    return () => {
      observer.disconnect();
      pending.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (!playerOpen || variant === "release") return;
    const close = (event: MouseEvent) => {
      if (!playerRef.current?.contains(event.target as Node))
        setPlayerOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlayerOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [playerOpen, variant]);

  return (
    <>
      <header
        className={`site-header site-header--${variant}${scrolled ? " site-header--floating" : ""}`}
        data-scrolled={scrolled}
      >
        <div className="header-inner">
          <Link
            to="/"
            className="wordmark"
            onClick={() => setMobileOpen(false)}
          >
            JONA FERREIRA
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            {navigation.map(({ label, id }) => (
              <Link
                key={id}
                className={
                  activeSection === id && pathname === "/" ? "is-active" : ""
                }
                aria-current={
                  activeSection === id && pathname === "/"
                    ? "location"
                    : undefined
                }
                to={`/#${id}`}
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            {variant === "home" && (
              <>
                <button
                  className="button button--lime support-header"
                  onClick={onSupport}
                  type="button"
                >
                  SUPPORT THE JOURNEY
                </button>
                <div className="player-anchor" ref={playerRef}>
                  <button
                    className="wave-button"
                    type="button"
                    aria-label="Open audio player"
                    aria-expanded={playerOpen}
                    onClick={() => setPlayerOpen(!playerOpen)}
                  >
                    <Waveform active={audio.status === "playing"} bars={9} />
                  </button>
                  {playerOpen && (
                    <div className="player-popover">
                      <p className="eyebrow">GLOBAL PLAYER</p>
                      {audio.release ? (
                        <>
                          <div className="player-track">
                            <img
                              src={audio.release.coverArt}
                              alt=""
                              width="64"
                              height="64"
                            />
                            <div>
                              <strong>{audio.release.title}</strong>
                              <span>Jona Ferreira · 30-second preview</span>
                            </div>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => void audio.toggle()}
                              disabled={audio.status === "loading"}
                              aria-label={
                                audio.status === "loading"
                                  ? "Loading preview"
                                  : audio.status === "error"
                                    ? "Retry preview"
                                    : audio.status === "playing"
                                      ? "Pause preview"
                                      : "Play preview"
                              }
                            >
                              {audio.status === "loading" ? (
                                <LoaderCircle className="spin-icon" size={18} />
                              ) : audio.status === "error" ? (
                                <RotateCw size={18} />
                              ) : audio.status === "playing" ? (
                                <Pause size={18} />
                              ) : (
                                <Play size={18} />
                              )}
                            </button>
                          </div>
                          <label className="sr-only" htmlFor="player-progress">
                            Playback position
                          </label>
                          <input
                            id="player-progress"
                            className="player-range"
                            type="range"
                            min="0"
                            max={audio.duration || 30}
                            value={Math.min(
                              audio.currentTime,
                              audio.duration || 30,
                            )}
                            onChange={(event) =>
                              audio.seek(Number(event.target.value))
                            }
                          />
                          <div className="player-times">
                            <span>{formatTime(audio.currentTime)}</span>
                            <span>{formatTime(audio.duration || 30)}</span>
                          </div>
                          {audio.error && (
                            <p className="player-error" role="alert">
                              {audio.error}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="player-empty">
                          Choose a release below to hear a preview.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              className="mobile-menu icon-button"
              type="button"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              aria-controls={mobileOpen ? "site-menu" : undefined}
              aria-haspopup="dialog"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {mobileOpen && (
        <NavigationMenu
          onClose={() => setMobileOpen(false)}
          onSupport={onSupport}
        />
      )}
    </>
  );
}

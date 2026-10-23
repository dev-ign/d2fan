import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Pause, Play } from "lucide-react";
import { catalog } from "../config/runtime";
import { TransactionExperience } from "../features/checkout/TransactionExperience";
import { PrivacyControls } from "../features/fan-capture/PrivacyControls";
import { attribution } from "../services/attribution";
import { analytics } from "../services/analytics";
import { AudioProvider } from "./AudioProvider";
import { useAudio } from "../hooks/useAudio";
import { ReleaseThemeBackground } from "../components/ReleaseThemeBackground";
import { resolveReleaseTheme } from "../domain/releaseTheme";
import { Header } from "../components/Header";
import { SupportDialog } from "../components/SupportDialog";
import { Hero, SocialStrip } from "../features/hero/Hero";
import { MusicSection } from "../features/music/MusicSection";
import { VaultSection } from "../features/vault/VaultSection";
import { StayClose } from "../features/stay-close/StayClose";
import { localContentRepository } from "../repositories/localContentRepository";
import { useSectionMotion } from "../hooks/useSectionMotion";
import type { Artist, MusicRelease, VaultItem } from "../domain/types";

function HomePage({ onSupport }: { onSupport: (item?: VaultItem) => void }) {
  const [content, setContent] = useState<{
    artist: Artist;
    releases: MusicRelease[];
    vault: VaultItem[];
  } | null>(null);
  const scope = useSectionMotion(Boolean(content));
  useEffect(() => {
    let live = true;
    void Promise.all([
      localContentRepository.getArtistBySlug(catalog.artistId),
      localContentRepository.listReleases(catalog.artistId),
      localContentRepository.listVault(catalog.artistId),
    ]).then(([artist, releases, vault]) => {
      if (live && artist) setContent({ artist, releases, vault });
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!content || !window.location.hash) return;
    let live = true;
    let frame = 0;
    // Font metrics can change the sections above the target after initial render.
    void document.fonts.ready.then(() => {
      if (!live) return;
      frame = requestAnimationFrame(() =>
        document
          .getElementById(window.location.hash.slice(1))
          ?.scrollIntoView({ block: "start", behavior: "instant" }),
      );
    });
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [content]);
  return (
    <main
      ref={scope}
      className={content ? undefined : "home-loading"}
      aria-busy={!content}
    >
      {content && (
        <>
          <Hero
            artist={content.artist}
            featured={
              content.releases.find(
                (release) => release.id === content.artist.featuredReleaseId,
              ) ?? content.releases[0]
            }
          />
          <SocialStrip />
          <MusicSection releases={content.releases} />
          <VaultSection items={content.vault} onSupport={onSupport} />
          <StayClose />
        </>
      )}
    </main>
  );
}

function ReleasePage() {
  const { slug } = useParams();
  const [release, setRelease] = useState<MusicRelease | null | undefined>(
    undefined,
  );
  const audio = useAudio();
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
  if (release === undefined) return <main className="release-page" />;
  if (!release)
    return (
      <main className="release-page">
        <div className="container">
          <p className="eyebrow">RELEASE NOT FOUND</p>
          <h1 className="display-heading">
            NOT <em>HERE.</em>
          </h1>
          <Link to="/" className="button button--outline">
            <ArrowLeft size={16} /> Back to music
          </Link>
        </div>
      </main>
    );
  const playing =
    audio.release?.id === release.id && audio.status === "playing";
  return (
    <main className="release-page release-theme-host">
      <ReleaseThemeBackground theme={resolveReleaseTheme(release)} priority />
      <div className="container release-page-inner">
        <Link to="/#music" className="back-link">
          <ArrowLeft size={17} /> ALL MUSIC
        </Link>
        <div className="release-page-grid">
          <img src={release.coverArt} alt={`${release.title} cover art`} />
          <div>
            <p className="eyebrow red-text">JONA FERREIRA · SINGLE</p>
            <h1 className="display-heading">{release.title}</h1>
            <p>
              {new Date(`${release.releaseDate}T12:00:00`).toLocaleString(
                "en-US",
                { month: "long", day: "numeric", year: "numeric" },
              )}
            </p>
            <div className="release-page-actions">
              <button
                className="button button--bone"
                type="button"
                onClick={() =>
                  void (audio.release?.id === release.id
                    ? audio.toggle()
                    : audio.play(release))
                }
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}{" "}
                {playing ? "Pause preview" : "Play preview"}
              </button>
              {release.streamingLinks.appleMusic && (
                <a
                  className="button button--outline"
                  href={release.streamingLinks.appleMusic}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apple Music <ArrowUpRight size={17} />
                </a>
              )}
            </div>
            <p className="provisional-note">
              Release page preview. Full editorial content is pending an
              approved design.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function AppShell() {
  const [supportItem, setSupportItem] = useState<VaultItem | "tip" | null>(
    null,
  );
  const [resumeAmount, setResumeAmount] = useState<number>();
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
    attribution();
    if (window.location.search)
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.hash,
      );
    analytics.track("PageView");
  }, [location.pathname, location.hash]);
  return (
    <>
      <Header
        onSupport={() => {
          setResumeAmount(undefined);
          setSupportItem("tip");
        }}
      />
      <Routes>
        <Route
          path="/"
          element={
            <HomePage onSupport={(item) => setSupportItem(item ?? "tip")} />
          }
        />
        <Route path="/music/:slug" element={<ReleasePage />} />
        <Route
          path="*"
          element={
            <main className="release-page">
              <div className="container">
                <h1 className="display-heading">
                  PAGE <em>NOT FOUND.</em>
                </h1>
                <Link to="/" className="button button--outline">
                  Go home
                </Link>
              </div>
            </main>
          }
        />
      </Routes>
      <TransactionExperience
        onResume={(amount) => {
          setResumeAmount(amount);
          setSupportItem("tip");
        }}
      />
      <PrivacyControls />
      {supportItem !== null && (
        <SupportDialog
          initialAmount={resumeAmount}
          item={supportItem === "tip" ? undefined : supportItem}
          onClose={() => setSupportItem(null)}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AudioProvider>
        <AppShell />
      </AudioProvider>
    </BrowserRouter>
  );
}

import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useMatch,
} from "react-router-dom";
import { catalog } from "../config/runtime";
import { TransactionExperience } from "../features/checkout/TransactionExperience";
import { PrivacyControls } from "../features/fan-capture/PrivacyControls";
import { attribution } from "../services/attribution";
import { analytics } from "../services/analytics";
import { AudioProvider } from "./AudioProvider";
import { Header } from "../components/Header";
import { SupportDialog } from "../components/SupportDialog";
import { Hero } from "../features/hero/Hero";
import { MusicSection } from "../features/music/MusicSection";
import { ReleasePage } from "../features/music/ReleasePage";
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
      className={content ? "home-experience" : "home-loading"}
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
          <MusicSection releases={content.releases} />
          <VaultSection items={content.vault} onSupport={onSupport} />
          <StayClose />
        </>
      )}
    </main>
  );
}

function AppShell() {
  const [supportItem, setSupportItem] = useState<VaultItem | "tip" | null>(
    null,
  );
  const [resumeAmount, setResumeAmount] = useState<number>();
  const location = useLocation();
  const releaseRoute = useMatch("/music/:slug");
  useEffect(() => {
    document.documentElement.dataset.experience =
      location.pathname === "/" ? "home" : "release";
    if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" });
    attribution();
    if (window.location.search)
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.hash,
      );
    analytics.track("PageView");
    let live = true;
    let frame = 0;
    if (["#music", "#vault", "#stay-close", "#top"].includes(location.hash)) {
      void document.fonts.ready.then(() => {
        if (!live) return;
        frame = requestAnimationFrame(() =>
          document
            .getElementById(location.hash.slice(1))
            ?.scrollIntoView({ block: "start" }),
        );
      });
    }
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
  }, [location.pathname, location.hash]);
  return (
    <>
      <Header
        key={location.pathname}
        variant={releaseRoute ? "release" : "home"}
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
      <footer className="experience-footer">
        <TransactionExperience
          onResume={(amount) => {
            setResumeAmount(amount);
            setSupportItem("tip");
          }}
        />
        <PrivacyControls />
      </footer>
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

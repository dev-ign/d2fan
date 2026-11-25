import { LocaleProvider } from "./LocaleProvider";
import { useLocale } from "../hooks/useLocale";
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useMatch,
} from "react-router-dom";
import { catalog, runtime } from "../config/runtime";
import { TransactionExperience } from "../features/checkout/TransactionExperience";
import { PrivacyControls } from "../features/fan-capture/PrivacyControls";
import { PrivacyPage } from "../features/fan-capture/PrivacyPage";
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
import { useRouteScroll } from "../hooks/useRouteScroll";
import { useReleaseClock } from "../hooks/useReleaseClock";
import type { Artist, MusicRelease, VaultItem } from "../domain/types";
import { releases } from "../data/content";
import {
  getReleaseMetadata,
  resolveReleasePublication,
} from "../data/releaseMetadata";

function HomePage({
  onSupport,
  serverTime,
}: {
  onSupport: (item?: VaultItem) => void;
  serverTime?: number;
}) {
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
  const publishedCatalog = content?.releases.map((release) =>
    resolveReleasePublication(release, serverTime),
  );
  return (
    <main
      ref={scope}
      className={content ? "home-experience" : "home-loading"}
      aria-busy={!content}
    >
      {content && publishedCatalog && (
        <>
          <Hero
            artist={content.artist}
            featured={
              publishedCatalog.find(
                (release) => release.id === content.artist.featuredReleaseId,
              ) ?? publishedCatalog[0]
            }
          />
          <MusicSection
            releases={publishedCatalog.filter(
              (release) => release.publicationStatus !== "upcoming",
            )}
            featuredReleaseId={content.artist.featuredReleaseId}
          />
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
  const privacyRoute = Boolean(useMatch("/privacy"));
  useRouteScroll();
  const { t, locale } = useLocale();
  const serverTime = useReleaseClock();
  const releaseSlug = releaseRoute?.params.slug;
  const release = releases.find((item) => item.slug === releaseSlug);
  useLayoutEffect(() => {
    const metadata =
      release &&
      getReleaseMetadata(
        resolveReleasePublication(release, serverTime),
        locale,
      );
    const { title, description } =
      metadata ?? (privacyRoute ? t.privacy : t.meta);
    document.title = title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", description);
    document.head
      .querySelectorAll("[data-release-meta]")
      .forEach((node) => node.remove());
    for (const { tag, attrs } of metadata?.tags ?? []) {
      const node = document.createElement(tag);
      node.setAttribute("data-release-meta", "");
      for (const [name, value] of Object.entries(attrs)) {
        node.setAttribute(name, value);
      }
      document.head.append(node);
    }
  }, [release, serverTime, locale, privacyRoute, t.meta, t.privacy]);
  useEffect(() => {
    attribution();
    if (window.location.search)
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.hash,
      );
    analytics.track("PageView", release ? { release_slug: release.slug } : {});
  }, [location.pathname, release]);
  return (
    <>
      <Header
        key={location.pathname}
        variant={releaseRoute || privacyRoute ? "release" : "home"}
        onSupport={() => {
          setResumeAmount(undefined);
          setSupportItem("tip");
        }}
      />
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              serverTime={serverTime}
              onSupport={(item) => setSupportItem(item ?? "tip")}
            />
          }
        />
        <Route
          path="/music/:slug"
          element={<ReleasePage serverTime={serverTime} />}
        />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="*"
          element={
            <main className="release-page">
              <div className="container">
                <h1 className="display-heading">{t.common.notFound}</h1>
                <Link to="/" className="button button--outline">
                  {t.common.home}
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
        <Link className="footer-privacy-link" to="/privacy">
          {t.privacy.title}
        </Link>
      </footer>
      {supportItem !== null &&
        (supportItem === "tip"
          ? runtime.supportEnabled
          : runtime.commerceEnabled) && (
          <SupportDialog
            initialAmount={resumeAmount}
            item={supportItem === "tip" ? undefined : supportItem}
            onClose={() => setSupportItem(null)}
          />
        )}
    </>
  );
}

const Studio = lazy(() => import("../features/studio/Studio"));

export default function App() {
  if (/^\/studio(?:\/|$)/.test(window.location.pathname)) {
    return (
      <Suspense fallback={<p role="status">Opening Artist Studio…</p>}>
        <Studio />
      </Suspense>
    );
  }
  return (
    <LocaleProvider>
      <BrowserRouter>
        <AudioProvider>
          <AppShell />
        </AudioProvider>
      </BrowserRouter>
    </LocaleProvider>
  );
}

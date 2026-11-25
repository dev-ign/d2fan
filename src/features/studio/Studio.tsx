import { useEffect, useLayoutEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  AudioLines,
  CircleDollarSign,
  Clapperboard,
  ExternalLink,
  LayoutDashboard,
  Link2,
  LogOut,
  Music2,
  Users,
} from "lucide-react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import type {
  StudioReadiness,
  StudioReport,
} from "../../../supabase/shared/studio";
import {
  defaultCampaign,
  readOwnerLink,
  studioClient,
  useStudioRequest,
} from "./client";
import { StudioAuthCard, StudioMfa, StudioSignIn } from "./StudioAuth";
import type { InstagramCallback } from "./ContentSocial";
import { StudioContent } from "./StudioContent";
import { StudioOwnerSetup } from "./StudioOwnerSetup";
import {
  Campaigns,
  Fans,
  Overview,
  Readiness,
  Releases,
  Revenue,
  StudioLoad,
} from "./StudioViews";
import "./studio.css";

const navigation = [
  { path: "/", label: "Overview", Icon: LayoutDashboard },
  { path: "/content", label: "Content", Icon: Clapperboard },
  { path: "/fans", label: "Fans", Icon: Users },
  { path: "/releases", label: "Releases", Icon: Music2 },
  { path: "/campaigns", label: "Campaigns", Icon: Link2 },
  { path: "/revenue", label: "Revenue", Icon: CircleDollarSign },
  { path: "/readiness", label: "Readiness", Icon: Activity },
];

interface StudioOAuth {
  instagram?: InstagramCallback;
  clearInstagram: () => void;
}

function StudioWorkspace({
  session,
  readiness,
  signOut,
  instagram,
  clearInstagram,
}: {
  session: Session;
  readiness: StudioReadiness;
  signOut: () => void;
} & StudioOAuth) {
  const accessToken = session.access_token;
  const overview = useStudioRequest<StudioReport>(accessToken, {
    view: "report",
    campaign: defaultCampaign,
  });
  return (
    <BrowserRouter basename="/studio">
      <div className="studio-shell">
        <a className="studio-skip" href="#studio-main">
          Skip to content
        </a>
        <aside className="studio-sidebar">
          <div className="studio-brand">
            <span className="studio-brand-icon">
              <AudioLines size={22} />
            </span>
            <span>
              Jona Ferreira{" "}
              <small>
                {import.meta.env.VITE_STUDIO_SYNTHETIC_DATA === "true"
                  ? "Studio · Synthetic data"
                  : "Artist Studio"}
              </small>
            </span>
          </div>
          <nav aria-label="Artist Studio navigation">
            {navigation.map(({ path, label, Icon }) => (
              <NavLink to={path} end={path === "/"} key={path}>
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="studio-sidebar-footer">
            <a href="/" className="studio-text-link">
              Artist website <ExternalLink size={15} aria-hidden="true" />
            </a>
            <button className="studio-text-link" onClick={signOut}>
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </aside>
        <main id="studio-main" className="studio-main" tabIndex={-1}>
          <Routes>
            <Route
              index
              element={
                overview.data ? (
                  <Overview report={overview.data} />
                ) : (
                  <StudioLoad error={overview.error} retry={overview.retry} />
                )
              }
            />
            <Route
              path="content"
              element={
                <StudioContent
                  accessToken={accessToken}
                  callback={instagram}
                  clearCallback={clearInstagram}
                />
              }
            />
            <Route path="fans" element={<Fans accessToken={accessToken} />} />
            <Route
              path="releases"
              element={<Releases asOf={overview.data?.as_of} />}
            />
            <Route
              path="campaigns"
              element={<Campaigns accessToken={accessToken} />}
            />
            <Route
              path="revenue"
              element={
                overview.data ? (
                  <Revenue report={overview.data} />
                ) : (
                  <StudioLoad error={overview.error} retry={overview.retry} />
                )
              }
            />
            <Route
              path="readiness"
              element={
                <Readiness readiness={readiness} report={overview.data} />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function StudioGate({
  client,
  session,
  signOut,
  ...oauth
}: {
  client: SupabaseClient;
  session: Session;
  signOut: () => void;
} & StudioOAuth) {
  const access = useStudioRequest<StudioReadiness>(session.access_token, {
    view: "session",
  });
  if (access.data)
    return (
      <StudioWorkspace
        session={session}
        readiness={access.data}
        signOut={signOut}
        {...oauth}
      />
    );
  if (access.error === "mfa_required")
    return <StudioMfa client={client} signOut={signOut} />;
  if (!access.error)
    return (
      <StudioAuthCard title="Checking access">
        <p role="status">Verifying your owner session…</p>
      </StudioAuthCard>
    );
  return (
    <StudioAuthCard
      title={
        access.error === "forbidden"
          ? "Access restricted"
          : "Session unavailable"
      }
    >
      <p role="alert">
        {access.error === "forbidden"
          ? "This account does not have access to Artist Studio."
          : "Artist Studio could not verify this session."}
      </p>
      {access.error !== "forbidden" && (
        <button className="studio-button" onClick={access.retry}>
          Try again
        </button>
      )}
      <button className="studio-button studio-signout" onClick={signOut}>
        Sign out
      </button>
    </StudioAuthCard>
  );
}

function StudioSession({
  client,
  ...oauth
}: { client: SupabaseClient } & StudioOAuth) {
  const [session, setSession] = useState<Session | null>();
  const [ownerLink, setOwnerLink] = useState(readOwnerLink);
  const [signOutError, setSignOutError] = useState<"local" | "global">();
  useEffect(() => {
    if (ownerLink && location.hash)
      history.replaceState(
        history.state,
        "",
        location.pathname + location.search,
      );
  }, [ownerLink]);
  useEffect(() => {
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, [client]);

  async function signOut(scope: "local" | "global" = "local") {
    setSession(undefined);
    oauth.clearInstagram();
    setSignOutError(undefined);
    try {
      const { error } = await client.auth.signOut({ scope });
      if (error) throw error;
      setSession(null);
    } catch {
      setSignOutError(scope);
    }
  }

  if (signOutError)
    return (
      <StudioAuthCard title="Sign out needs another attempt">
        <button
          className="studio-button"
          onClick={() => void signOut(signOutError)}
        >
          Retry sign out
        </button>
      </StudioAuthCard>
    );
  if (ownerLink)
    return (
      <StudioOwnerSetup
        client={client}
        session={session}
        link={ownerLink}
        cancel={() => {
          setOwnerLink(undefined);
          void signOut();
        }}
        finish={() => {
          setOwnerLink(undefined);
          void signOut("global");
        }}
      />
    );
  if (session === undefined)
    return (
      <StudioAuthCard title="Opening Artist Studio">
        <p role="status">Checking for an existing session…</p>
      </StudioAuthCard>
    );
  if (!session) return <StudioSignIn client={client} />;
  return (
    <StudioGate
      client={client}
      session={session}
      signOut={() => void signOut()}
      {...oauth}
    />
  );
}

export default function Studio() {
  const [instagram, setInstagram] = useState<InstagramCallback | undefined>(
    () => {
      if (location.pathname !== "/studio/content") return;
      const params = new URLSearchParams(location.search);
      if (params.get("error") === "access_denied") return { denied: true };
      const state = params.get("state");
      if (!state || !/^[a-f\d-]{72}$/.test(state)) return;
      const code = params.get("code");
      if (code && code.length <= 2048) return { code, state };
    },
  );
  useLayoutEffect(() => {
    if (instagram && location.search)
      history.replaceState(history.state, "", location.pathname);
  }, [instagram]);
  useEffect(() => {
    document.title = "Artist Studio — Jona Ferreira";
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    return () => robots.remove();
  }, []);

  return studioClient ? (
    <StudioSession
      client={studioClient}
      instagram={instagram}
      clearInstagram={() => setInstagram(undefined)}
    />
  ) : (
    <StudioAuthCard title="Studio setup required">
      <p>A private data environment is required for this deployment.</p>
    </StudioAuthCard>
  );
}

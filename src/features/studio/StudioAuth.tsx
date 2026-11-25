import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AudioLines } from "lucide-react";

export function StudioAuthCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="studio-auth">
      <div className="studio-auth-card">
        <div className="studio-brand">
          <span className="studio-brand-icon">
            <AudioLines size={22} />
          </span>
          <span>
            Jona Ferreira <small>Artist Studio</small>
          </span>
        </div>
        <h1>{title}</h1>
        {children}
        <a className="studio-back" href="/">
          Back to artist site
        </a>
      </div>
    </main>
  );
}

export function StudioSignIn({ client }: { client: SupabaseClient }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setFailed(false);
    try {
      const { error } = await client.auth.signInWithPassword({
        email: String(fields.get("email")).trim(),
        password: String(fields.get("password")),
      });
      setFailed(Boolean(error));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudioAuthCard title="Sign in">
      <p>Use your private Artist Studio account.</p>
      <form className="studio-form" onSubmit={signIn}>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {failed && (
          <p className="studio-error" role="alert">
            Unable to sign in. Check your email and password.
          </p>
        )}
        <button className="studio-button studio-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </StudioAuthCard>
  );
}

export function StudioMfa({
  client,
  signOut,
}: {
  client: SupabaseClient;
  signOut: () => void;
}) {
  const [factor, setFactor] = useState<{
    id: string;
    qr?: string;
    secret?: string;
  }>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void client.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage("Could not load your authenticator. Try again.");
      else {
        const verified = data.totp[0];
        if (verified) setFactor({ id: verified.id });
        setLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [client, retry]);

  async function enroll() {
    setBusy(true);
    setMessage("");
    try {
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      for (const enrollment of factors.data.all) {
        if (
          enrollment.status === "unverified" &&
          enrollment.friendly_name === "Artist Studio"
        ) {
          const removed = await client.auth.mfa.unenroll({
            factorId: enrollment.id,
          });
          if (removed.error) throw removed.error;
        }
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Artist Studio",
      });
      if (error) throw error;
      setFactor({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch {
      setMessage("Could not set up the authenticator. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factor) return;
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    setBusy(true);
    setMessage("");
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (error) throw error;
    } catch {
      setMessage(
        "That code could not be verified. Enter the current code and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudioAuthCard title="Verify your sign-in">
      {message && (
        <p className="studio-error" role="alert">
          {message}
        </p>
      )}
      {!loaded &&
        (message ? (
          <button
            className="studio-button"
            onClick={() => {
              setMessage("");
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        ) : (
          <p role="status">Checking your authenticator…</p>
        ))}
      {loaded &&
        (factor ? (
          <form className="studio-form" onSubmit={verify}>
            {factor.qr && (
              <>
                <p>
                  Scan the QR code with your authenticator app. Keep the setup
                  key private.
                </p>
                <img
                  className="studio-qr"
                  src={factor.qr}
                  width="176"
                  height="176"
                  alt="Authenticator setup QR code"
                />
                <details>
                  <summary>Enter a setup key instead</summary>
                  <code>{factor.secret}</code>
                </details>
              </>
            )}
            <label>
              Authenticator code
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
            <button className="studio-button studio-primary" disabled={busy}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          </form>
        ) : (
          <div className="studio-form">
            <p>
              Set up a time-based code in your authenticator app to protect fan
              and revenue data.
            </p>
            <button
              className="studio-button studio-primary"
              disabled={busy}
              onClick={() => void enroll()}
            >
              Set up authenticator
            </button>
          </div>
        ))}
      <button className="studio-button studio-signout" onClick={signOut}>
        Sign out
      </button>
    </StudioAuthCard>
  );
}

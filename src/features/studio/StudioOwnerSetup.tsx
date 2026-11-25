import { useState, type FormEvent } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { StudioReadiness } from "../../../supabase/shared/studio";
import { useStudioRequest, type OwnerLink } from "./client";
import { StudioAuthCard, StudioMfa } from "./StudioAuth";

export function StudioOwnerSetup({
  client,
  link,
  session,
  cancel,
  finish,
}: {
  client: SupabaseClient;
  link: OwnerLink;
  session?: Session | null;
  cancel: () => void;
  finish: () => void;
}) {
  const [userId, setUserId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirmLink() {
    setBusy(true);
    try {
      const { data, error } = await client.auth.verifyOtp({
        type: link.type,
        token_hash: link.hash,
      });
      if (error || !data.session) throw new Error("invalid_link");
      setUserId(data.session.user.id);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (userId && session?.user.id === userId)
    return (
      <StudioOwnerPassword
        client={client}
        session={session}
        cancel={cancel}
        finish={finish}
      />
    );

  return (
    <StudioAuthCard
      title={
        link.type === "invite"
          ? "Set up your owner account"
          : "Reset your owner password"
      }
    >
      {failed ? (
        <p role="alert">
          This link has expired or has already been used. Request a new link
          from your Studio operator.
        </p>
      ) : (
        <p>
          Confirm this private link to continue to authenticator verification.
        </p>
      )}
      {!failed && (
        <button
          className="studio-button studio-primary"
          disabled={busy || Boolean(userId)}
          onClick={() => void confirmLink()}
        >
          {busy || userId ? "Checking link…" : "Continue"}
        </button>
      )}
      <button className="studio-button studio-signout" onClick={cancel}>
        Back to sign in
      </button>
    </StudioAuthCard>
  );
}

function StudioOwnerPassword({
  client,
  session,
  cancel,
  finish,
}: {
  client: SupabaseClient;
  session: Session;
  cancel: () => void;
  finish: () => void;
}) {
  const access = useStudioRequest<StudioReadiness>(session.access_token, {
    view: "session",
  });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password"));
    if (password !== fields.get("confirm")) {
      setStatus("Enter the same password in both fields.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      finish();
    } catch {
      setStatus(
        "The password could not be saved. Try a different password or request a fresh link.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (access.error === "mfa_required")
    return <StudioMfa client={client} signOut={cancel} />;
  if (!access.data)
    return (
      <StudioAuthCard title="Checking owner access">
        {access.error ? (
          <p role="alert">The Studio could not authorize this setup session.</p>
        ) : (
          <p role="status">Verifying your owner session…</p>
        )}
        {access.error && access.error !== "forbidden" && (
          <button className="studio-button" onClick={access.retry}>
            Try again
          </button>
        )}
        <button className="studio-button studio-signout" onClick={cancel}>
          Back to sign in
        </button>
      </StudioAuthCard>
    );
  return (
    <StudioAuthCard title="Choose your owner password">
      <p>
        Use at least 12 characters. After saving, sign in with your new password
        and authenticator.
      </p>
      <form className="studio-form" onSubmit={save}>
        <label>
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <label>
          Confirm password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        {status && (
          <p className="studio-error" role="alert">
            {status}
          </p>
        )}
        <button className="studio-button studio-primary" disabled={busy}>
          Save password
        </button>
      </form>
      <button className="studio-button studio-signout" onClick={cancel}>
        Back to sign in
      </button>
    </StudioAuthCard>
  );
}

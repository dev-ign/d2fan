import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { checkoutService, fanService, vaultService } from "../../services/fan";
import { analytics } from "../../services/analytics";
import type { CheckoutStatus } from "../../../supabase/shared/contracts";
type Mode = "reward" | "status" | "access" | "confirm" | "unsubscribe";
export function TransactionExperience({
  onResume,
}: {
  onResume: (amountMinor: number) => void;
}) {
  const [context] = useState<{ mode: Mode; token: string } | null>(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    for (const mode of [
      "reward",
      "status",
      "access",
      "confirm",
      "unsubscribe",
    ] as const) {
      const token = params.get(mode);
      if (token) {
        try {
          sessionStorage.setItem(
            "jona:accessContext",
            JSON.stringify({ mode, token, expires: Date.now() + 86400000 }),
          );
        } catch {
          /* Email recovery remains available. */
        }
        return { mode, token };
      }
    }
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("jona:accessContext") ?? "null",
      );
      if (
        saved &&
        saved.expires > Date.now() &&
        ["reward", "status", "access", "confirm", "unsubscribe"].includes(
          saved.mode,
        ) &&
        typeof saved.token === "string"
      )
        return saved;
    } catch {
      /* Storage is optional. */
    }
    return null;
  });
  const [open, setOpen] = useState(Boolean(context));
  const [recover, setRecover] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<CheckoutStatus>();
  const [links, setLinks] = useState<{ title: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (context) {
      history.replaceState(null, "", location.pathname);
      if (context.mode === "status") analytics.remember(context.token);
    }
    return () => {
      mounted.current = false;
    };
  }, [context]);
  useEffect(() => {
    if (!context || context.mode !== "status" || !open) return;
    let live = true;
    let timeout: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function check() {
      const result = await checkoutService.status(context!.token);
      if (!live) return;
      if (result.success) {
        setStatus(result.data);
        setMessage("");
        if (result.data.status === "completed" && result.data.eventId)
          analytics.track(
            "Purchase",
            {
              value: result.data.amountMinor / 100,
              currency: result.data.currency.toUpperCase(),
            },
            result.data.eventId,
          );
        if (
          ["draft", "pending_payment"].includes(result.data.status) &&
          ++polls < 20
        )
          timeout = setTimeout(() => void check(), 3000);
      } else setMessage(result.error.message);
    }
    void check();
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [context, open]);
  async function redeem() {
    if (busy) return;
    setBusy(true);
    const result =
      context?.mode === "reward"
        ? await vaultService.reward(context.token)
        : await vaultService.redeem(
            context?.mode === "access"
              ? context.token
              : (status?.accessToken ?? ""),
          );
    if (mounted.current) {
      if (result.success) {
        setLinks(result.data.links);
        setMessage("Your private download is ready for five minutes.");
      } else setMessage(result.error.message);
      setBusy(false);
    }
  }
  async function consentAction(
    mode: Exclude<Mode, "reward" | "status" | "access">,
  ) {
    setBusy(true);
    const result = await vaultService.consent(context!.token, mode);
    setMessage(result.success ? result.data.message : result.error.message);
    setBusy(false);
  }
  async function recovery(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await fanService.recover(email);
    setMessage(result.success ? result.data.message : result.error.message);
    setBusy(false);
  }
  return (
    <>
      <button
        className="recover-access text-action"
        type="button"
        onClick={() => {
          setRecover(true);
          setMessage("");
        }}
      >
        Already purchased? Recover access
      </button>
      {open && context && (
        <Dialog
          title="Your purchase and access"
          onClose={() => {
            setOpen(false);
            try {
              sessionStorage.removeItem("jona:accessContext");
            } catch {
              /* Optional storage. */
            }
          }}
          className="support-dialog"
        >
          <p className="eyebrow red-text">DIRECT FROM JONA</p>
          <h2 className="display-heading">
            STAY <em>CLOSE.</em>
          </h2>
          {context.mode === "status" && (
            <>
              <p role="status">
                {!status
                  ? "Verifying your payment…"
                  : status.status === "completed"
                    ? "Payment confirmed. Thank you for supporting Jona."
                    : status.status === "refunded"
                      ? "This payment was refunded."
                      : status.status === "expired"
                        ? "This checkout expired. Start a new checkout whenever you’re ready."
                        : status.status === "failed"
                          ? "Payment could not be completed. You can try again."
                          : "Payment is pending. You can close this window and recover access by email after payment is confirmed."}
              </p>
              {status?.status === "completed" && (
                <p>
                  {status.delivery === "sent"
                    ? "The provider accepted your access email."
                    : "Your receipt/access email is queued. Your confirmed purchase stays saved if delivery needs a retry."}
                </p>
              )}
            </>
          )}
          {context.mode === "status" &&
            status &&
            ["expired", "failed"].includes(status.status) &&
            status.purpose === "tip" && (
              <button
                className="button button--lime"
                type="button"
                onClick={() => {
                  setOpen(false);
                  try {
                    sessionStorage.removeItem("jona:accessContext");
                  } catch {
                    /* Optional storage. */
                  }
                  onResume(status.amountMinor);
                }}
              >
                START A NEW CHECKOUT
              </button>
            )}
          {status?.checkoutUrl && (
            <a className="button button--lime" href={status.checkoutUrl}>
              RESUME SECURE PAYMENT
            </a>
          )}
          {(context.mode === "access" ||
            context.mode === "reward" ||
            status?.accessToken) && (
            <button
              type="button"
              className="button button--lime"
              onClick={() => void redeem()}
              disabled={busy}
            >
              {busy ? "CHECKING…" : "OPEN MY DOWNLOAD"}
            </button>
          )}
          {(context.mode === "confirm" || context.mode === "unsubscribe") && (
            <button
              className="button button--lime"
              type="button"
              disabled={busy}
              onClick={() =>
                void consentAction(context.mode as "confirm" | "unsubscribe")
              }
            >
              {context.mode === "confirm"
                ? "CONFIRM MUSIC UPDATES"
                : "UNSUBSCRIBE"}
            </button>
          )}
          {links.map((link) => (
            <p key={link.title}>
              <a
                className="button button--outline"
                href={link.url}
                rel="noreferrer"
              >
                Download {link.title}
              </a>
            </p>
          ))}
          <p role="status">{message}</p>
        </Dialog>
      )}
      {recover && (
        <Dialog
          title="Recover your Vault access"
          onClose={() => setRecover(false)}
          className="support-dialog"
        >
          <h2 className="editorial-heading">
            YOUR <em>VAULT.</em>
          </h2>
          <p>
            Enter the email used at checkout. We’ll send fresh access links to
            that inbox.
          </p>
          <form onSubmit={(e) => void recovery(e)}>
            <label className="form-label">
              Purchase email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              className="button button--lime"
              type="submit"
              disabled={busy}
            >
              {busy ? "SENDING…" : "SEND ACCESS EMAIL"}
            </button>
          </form>
          <p role="status">{message}</p>
        </Dialog>
      )}
    </>
  );
}

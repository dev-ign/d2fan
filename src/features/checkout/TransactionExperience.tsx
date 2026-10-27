import type { SiteMessages } from "../../i18n/site";
import { normalizeEmail } from "../../../supabase/shared/validation";
import { useLocale, text, vaultCopy } from "../../hooks/useLocale";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { checkoutService, fanService, vaultService } from "../../services/fan";
import { analytics } from "../../services/analytics";
import type { CheckoutStatus } from "../../../supabase/shared/contracts";
import { vaultItems } from "../../data/content";
import { runtime } from "../../config/runtime";
type Feedback =
  | { copy: keyof SiteMessages["transaction"] }
  | { error: string }
  | { invalid: true }
  | null;
type Mode = "reward" | "status" | "access" | "confirm" | "unsubscribe";
export function TransactionExperience({
  onResume,
}: {
  onResume: (amountMinor: number) => void;
}) {
  const { t, locale } = useLocale();
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
  const [message, setMessage] = useState<Feedback>(null);
  const [status, setStatus] = useState<CheckoutStatus>();
  const [links, setLinks] = useState<{ title: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [cancelled] = useState(
    () => new URLSearchParams(location.search).get("checkout") === "cancel",
  );
  const displayMessage = !message
    ? ""
    : "copy" in message
      ? t.transaction[message.copy]
      : "invalid" in message
        ? t.invalid
        : locale === "es"
          ? t.requestError
          : message.error;
  const purchasedItem = vaultItems.find(
    (item) => item.slug === status?.itemSlug,
  );
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
        setMessage(null);
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
          ++polls < 12
        )
          timeout = setTimeout(() => void check(), 3000);
      } else setMessage({ error: result.error.message });
    }
    void check();
    return () => {
      live = false;
      clearTimeout(timeout);
    };
  }, [context, open, refresh]);
  async function redeem() {
    if (busy) return;
    setBusy(true);
    // Refresh the short-lived access token before minting another five-minute URL.
    let accessToken = status?.accessToken ?? "";
    if (context?.mode === "status") {
      const current = await checkoutService.status(context.token);
      if (
        !current.success ||
        current.data.status !== "completed" ||
        !current.data.accessToken
      ) {
        if (mounted.current) {
          setLinks([]);
          setMessage(
            current.success
              ? { copy: "unavailable" }
              : { error: current.error.message },
          );
          setBusy(false);
        }
        return;
      }
      accessToken = current.data.accessToken;
    }
    const result =
      context?.mode === "reward"
        ? await vaultService.reward(context.token)
        : await vaultService.redeem(
            context?.mode === "access" ? context.token : accessToken,
          );
    if (mounted.current) {
      if (result.success) {
        setLinks(result.data.links);
        setMessage({ copy: "ready" });
      } else setMessage({ error: result.error.message });
      setBusy(false);
    }
  }
  async function consentAction(
    mode: Exclude<Mode, "reward" | "status" | "access">,
  ) {
    setBusy(true);
    const result = await vaultService.consent(context!.token, mode);
    setMessage(
      result.success
        ? { copy: mode === "confirm" ? "consentConfirmed" : "unsubscribed" }
        : { error: result.error.message },
    );
    setBusy(false);
  }
  async function recovery(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    try {
      normalizeEmail(email);
    } catch {
      setMessage({ invalid: true });
      return;
    }
    setBusy(true);
    const result = await fanService.recover(email);
    setMessage(
      result.success ? { copy: "recovered" } : { error: result.error.message },
    );
    setBusy(false);
  }
  return (
    <>
      <button
        className="recover-access text-action"
        type="button"
        onClick={() => {
          setRecover(true);
          setMessage(null);
        }}
      >
        {t.transaction.recover}
      </button>
      {open && context && (
        <Dialog
          title={t.transaction.dialog}
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
          <p className="eyebrow red-text">{t.transaction.direct}</p>
          <h2 className="display-heading">
            {t.transaction.first} <em>{t.transaction.second}</em>
          </h2>
          {context.mode === "status" && (
            <>
              <p role="status">
                {!status
                  ? t.transaction.verifying
                  : status.status === "completed"
                    ? t.transaction.confirmed
                    : status.status === "refunded"
                      ? t.transaction.refunded
                      : status.status === "expired"
                        ? t.transaction.expired
                        : status.status === "failed"
                          ? t.transaction.failed
                          : cancelled
                            ? t.transaction.canceled
                            : t.transaction.waiting}
              </p>
              {purchasedItem && <p>{vaultCopy(purchasedItem, t).title}</p>}
              {(!status ||
                ["draft", "pending_payment"].includes(status.status)) && (
                <button
                  className="button button--outline"
                  type="button"
                  onClick={() => setRefresh((value) => value + 1)}
                >
                  {t.transaction.check}
                </button>
              )}
              {status?.status === "completed" && (
                <p>
                  {runtime.paymentTestApi
                    ? t.transaction.testSaved
                    : status.delivery === "sent"
                      ? t.transaction.sent
                      : t.transaction.queued}
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
                {t.transaction.restart}
              </button>
            )}
          {status?.checkoutUrl && (
            <a className="button button--lime" href={status.checkoutUrl}>
              {t.transaction.resume}
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
              {busy ? t.transaction.checking : t.transaction.open}
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
                ? t.transaction.confirm
                : t.transaction.unsubscribe}
            </button>
          )}
          {links.map((link) => (
            <p key={link.title}>
              <a
                className="button button--outline"
                href={link.url}
                rel="noreferrer"
              >
                {text(t.transaction.download, { title: link.title })}
              </a>
            </p>
          ))}
          <p role="status">{displayMessage}</p>
        </Dialog>
      )}
      {recover && (
        <Dialog
          title={t.transaction.recoverTitle}
          onClose={() => setRecover(false)}
          className="support-dialog"
        >
          <h2 className="editorial-heading">
            {t.transaction.your} <em>{t.transaction.vault}</em>
          </h2>
          <p>{t.transaction.instructions}</p>
          <form onSubmit={(e) => void recovery(e)} noValidate>
            <label className="form-label">
              {t.transaction.email}
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
              {busy ? t.transaction.sending : t.transaction.send}
            </button>
          </form>
          <p role="status">{displayMessage}</p>
        </Dialog>
      )}
    </>
  );
}

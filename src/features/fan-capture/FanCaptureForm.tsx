import { useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import type { CaptureResponse } from "../../../supabase/shared/contracts";
import { normalizeEmail } from "../../../supabase/shared/validation";
import { useLocale } from "../../hooks/useLocale";
import { fanService } from "../../services/fan";
import { analytics } from "../../services/analytics";
import { attribution } from "../../services/attribution";

/** The existing capture contract, shared by the invitation and release pages. */
export function FanCaptureForm({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const { locale: language, t } = useLocale();
  const [optIn, setOptIn] = useState(false);
  const [state, setState] = useState<
    "idle" | "invalid" | "loading" | "error" | "success"
  >("idle");
  const [message, setMessage] = useState("");
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const request = useRef(crypto.randomUUID());
  const requestLocale = useRef(language);
  const busy = useRef(false);
  const emailId = compact ? "release-email" : "email";
  const statusId = `${emailId}-status`;
  const titleId = compact
    ? "release-confirmation-title"
    : "stay-confirmation-title";
  const rewardMessage = capture?.magnetUrl
    ? t.rewardReady
    : compact
      ? ""
      : t.rewardUnavailable;

  useEffect(() => {
    if (state !== "success") return;
    title.current?.closest(".stay-confirmation")?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
    title.current?.focus({ preventScroll: true });
  }, [state]);

  function edited() {
    request.current = crypto.randomUUID();
    setState("idle");
    setMessage("");
    setCapture(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (requestLocale.current !== language) {
      request.current = crypto.randomUUID();
      requestLocale.current = language;
    }
    let normalized: string;
    try {
      normalized = normalizeEmail(email);
    } catch {
      setState("invalid");
      setMessage("");
      return;
    }
    busy.current = true;
    setState("loading");
    setMessage("");
    try {
      const result = await fanService.capture({
        requestId: request.current,
        email: normalized,
        language,
        // Keep the existing invitation source; attribution adds the route's release.
        source: "stay_close",
        emailMarketing: optIn,
        analyticsConsent: analytics.allowed(),
        ...attribution(),
      });
      if (result.success) {
        if (result.data.measurementToken)
          analytics.remember(result.data.measurementToken);
        setCapture(result.data);
        setState("success");
        analytics.track("Lead", {}, result.data.eventId);
      } else {
        setState("error");
        setMessage(result.error.message);
      }
    } finally {
      busy.current = false;
    }
  }
  return (
    <div
      className={`capture-surface${compact ? " capture-surface--compact" : ""}`}
    >
      <p className="sr-only" role="status" aria-atomic="true">
        {state === "success" ? `${t.captureSaved} ${rewardMessage}` : ""}
      </p>
      {state === "success" && capture ? (
        <div
          className="stay-confirmation"
          role="region"
          aria-labelledby={titleId}
          lang={language}
        >
          <span className="stay-confirmation-icon" aria-hidden="true">
            <Check size={22} />
          </span>
          <div>
            <p className="eyebrow">LA CULTURA</p>
            <h3 id={titleId} ref={title} tabIndex={-1}>
              {t.culturaTitle}
            </h3>
            <p>{t.captureSaved}</p>
            {rewardMessage && (
              <div className="stay-reward-status">
                <p>{rewardMessage}</p>
                {capture.magnetUrl && (
                  <a
                    className="button button--lime"
                    href={capture.magnetUrl}
                    rel="noreferrer"
                  >
                    <Download size={18} aria-hidden="true" />
                    {t.rewardDownload}
                  </a>
                )}
              </div>
            )}
            <p className="stay-confirmation-consent">
              {optIn ? t.marketingConfirmation : t.marketingNotRequested}
            </p>
          </div>
        </div>
      ) : (
        <form
          className="stay-form capture-form"
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-busy={state === "loading"}
        >
          <label className="eyebrow capture-label" htmlFor={emailId}>
            {t.forms.emailLabel}
          </label>
          <div className="capture-input-group">
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              placeholder={t.forms.placeholder}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                edited();
              }}
              disabled={state === "loading"}
              aria-invalid={state === "invalid"}
              aria-describedby={statusId}
            />
            <button
              className="button button--bone join-button"
              type="submit"
              disabled={state === "loading"}
            >
              {state === "loading" ? t.saving : t.forms.join}
            </button>
          </div>
          {!compact && (
            <div className="capture-options">
              <fieldset className="channel-control">
                <legend className="sr-only">{t.forms.channel}</legend>
                <label>
                  <input type="radio" name="channel" checked readOnly />
                  {t.forms.email}
                </label>
                <label>
                  <input type="radio" name="channel" disabled />
                  {t.forms.whatsapp}
                </label>
              </fieldset>
            </div>
          )}
          <label className="consent-control">
            <input
              type="checkbox"
              checked={optIn}
              onChange={(event) => {
                setOptIn(event.target.checked);
                edited();
              }}
              disabled={state === "loading"}
            />
            {t.emailOptIn}
          </label>
          <p
            id={statusId}
            className={`form-status${state === "error" || state === "invalid" ? " form-status--error" : ""}`}
            role="status"
          >
            {state === "invalid"
              ? t.invalid
              : message
                ? language === "es"
                  ? t.requestError
                  : message
                : ""}
          </p>
        </form>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import type { CaptureResponse } from "../../../supabase/shared/contracts";
import { fanService } from "../../services/fan";
import { analytics } from "../../services/analytics";
import { attribution } from "../../services/attribution";
import { normalizeEmail } from "../../../supabase/shared/validation";
import { messages, suggestedLanguage } from "../../config/messages";
export function StayClose() {
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState(suggestedLanguage);
  const [optIn, setOptIn] = useState(false);
  const [state, setState] = useState<
    "idle" | "invalid" | "loading" | "error" | "success"
  >("idle");
  const [message, setMessage] = useState("");
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const confirmationTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state === "success") {
      confirmationTitle.current
        ?.closest<HTMLElement>(".stay-confirmation")
        ?.scrollIntoView({
          block: "nearest",
          behavior: "instant",
        });
      confirmationTitle.current?.focus({ preventScroll: true });
    }
  }, [state]);
  const request = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const t = messages[language];
  function edited() {
    request.current = crypto.randomUUID();
    setState("idle");
    setMessage("");
    setCapture(null);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    let normalized: string;
    try {
      normalized = normalizeEmail(email);
    } catch {
      setState("invalid");
      setMessage(t.invalid);
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
        source: "stay_close",
        emailMarketing: optIn,
        analyticsConsent: analytics.allowed(),
        ...attribution(),
      });
      if (result.success) {
        if (result.data.measurementToken)
          analytics.remember(result.data.measurementToken);
        setState("success");
        setCapture(result.data);
        analytics.track("Lead", {}, result.data.eventId);
      } else {
        setState("error");
        setMessage(language === "es" ? t.requestError : result.error.message);
      }
    } finally {
      busy.current = false;
    }
  }
  return (
    <section
      className="stay-section"
      id="stay-close"
      aria-labelledby="stay-title"
    >
      <div className="container stay-content">
        <div className="section-intro stay-intro reveal">
          <h2 id="stay-title" className="editorial-heading">
            <span>STAY</span>
            <em>CLOSE.</em>
          </h2>
          <p>
            New music, unreleased drops, and a few things I don't share anywhere
            else. Straight from me to you.
          </p>
        </div>
        <p className="incentive">
          <img src="/assets/gift.svg" alt="" width="24" height="24" /> Exclusive
          Acción wallpaper when you join.
        </p>
        <p className="sr-only" role="status" aria-atomic="true">
          {state === "success"
            ? `${t.captureSaved} ${capture?.magnetUrl ? t.rewardReady : t.rewardUnavailable}`
            : ""}
        </p>
        {state === "success" && capture ? (
          <div
            className="stay-confirmation"
            role="region"
            aria-labelledby="stay-confirmation-title"
            lang={language}
          >
            <span className="stay-confirmation-icon" aria-hidden="true">
              <Check size={24} strokeWidth={2} />
            </span>
            <p className="eyebrow">LA CULTURA</p>
            <h3
              id="stay-confirmation-title"
              ref={confirmationTitle}
              tabIndex={-1}
            >
              {t.culturaTitle}
            </h3>
            <p>{t.captureSaved}</p>
            <div className="stay-reward-status">
              <p>{capture.magnetUrl ? t.rewardReady : t.rewardUnavailable}</p>
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
            <p className="stay-confirmation-consent">
              {optIn ? t.marketingConfirmation : t.marketingNotRequested}
            </p>
          </div>
        ) : (
          <form
            className="stay-form"
            onSubmit={(e) => void submit(e)}
            noValidate
            aria-busy={state === "loading"}
          >
            <div className="email-field">
              <fieldset className="channel-control">
                <legend className="sr-only">Delivery channel</legend>
                <label>
                  <input type="radio" name="channel" checked readOnly /> Email
                </label>
                <label>
                  <input type="radio" name="channel" disabled /> WhatsApp ·
                  coming soon
                </label>
              </fieldset>
              <label className="eyebrow" htmlFor="email">
                {language === "en" ? "YOUR EMAIL" : "TU CORREO"}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  edited();
                }}
                disabled={state === "loading"}
                aria-invalid={state === "invalid"}
                aria-describedby="email-status"
              />
              <label className="language-control">
                {t.language}
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value as "en" | "es");
                    edited();
                  }}
                  disabled={state === "loading"}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
              <label className="consent-control">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={(e) => {
                    setOptIn(e.target.checked);
                    edited();
                  }}
                  disabled={state === "loading"}
                />
                {t.emailOptIn}
              </label>
              <p
                id="email-status"
                className={`form-status ${state === "error" || state === "invalid" ? "form-status--error" : ""}`}
                role="status"
              >
                {message}
              </p>
            </div>
            <button
              className="button button--bone join-button"
              type="submit"
              disabled={state === "loading"}
            >
              {state === "loading" ? t.saving : "JOIN LA CULTURA"}
            </button>
          </form>
        )}
        <div className="reward-art" aria-hidden="true">
          <img src="/assets/raw-stay-1.webp" alt="" />
        </div>
        <footer className="site-footer">
          <span className="sr-only">
            Jona Ferreira — independent music, direct to you.
          </span>
        </footer>
      </div>
    </section>
  );
}

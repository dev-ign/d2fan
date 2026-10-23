import { useRef, useState } from "react";
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
  const [download, setDownload] = useState<string>();
  const request = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const t = messages[language];
  function edited() {
    request.current = crypto.randomUUID();
    setState("idle");
    setMessage("");
    setDownload(undefined);
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
        setMessage(result.data.magnetUrl ? t.joined : t.pending);
        setDownload(result.data.magnetUrl);
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
                <input type="radio" name="channel" disabled /> WhatsApp · coming
                soon
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
            {download && (
              <a className="button button--outline" href={download}>
                Download Acción wallpaper
              </a>
            )}
          </div>
          <button
            className="button button--bone join-button"
            type="submit"
            disabled={state === "loading"}
          >
            {state === "loading" ? t.saving : "JOIN LA CULTURA"}
          </button>
        </form>
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

import { useEffect, useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  CaptureResponse,
  ServiceResult,
} from "../../../supabase/shared/contracts";
import { normalizeEmail } from "../../../supabase/shared/validation";
import { useLocale } from "../../hooks/useLocale";
import { fanService } from "../../services/fan";
import { analytics } from "../../services/analytics";
import { attribution } from "../../services/attribution";

/** The existing capture contract, shared by the invitation and release pages. */
export function FanCaptureForm({ releaseSlug }: { releaseSlug?: string }) {
  const compact = Boolean(releaseSlug);
  const placement = compact ? "release_page" : "home";
  const [email, setEmail] = useState("");
  const { locale: language, t } = useLocale();
  const [optIn, setOptIn] = useState(false);
  const [state, setState] = useState<
    "idle" | "invalid" | "loading" | "error" | "success"
  >("idle");
  const [failure, setFailure] =
    useState<Extract<ServiceResult<never>, { success: false }>["error"]>();
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const request = useRef(crypto.randomUUID());
  const requestAttribution = useRef<ReturnType<typeof attribution>>(undefined);
  const requestLocale = useRef(language);
  const busy = useRef(false);
  const signupViewed = useRef(false);
  const signupStarted = useRef(false);
  const emailId = compact ? "release-email" : "email";
  const statusId = `${emailId}-status`;
  const disclosureId = `${emailId}-disclosure`;
  const titleId = compact
    ? "release-confirmation-title"
    : "stay-confirmation-title";
  const successTitle = optIn ? t.updatesRequested : t.rewardRequested;
  const delivery = capture?.delivery;
  const rewardUnavailable =
    !capture?.magnetUrl && delivery !== "queued" && delivery !== "sent";
  const rewardMessage = capture?.magnetUrl
    ? t.rewardReady
    : delivery === "queued"
      ? t.rewardEmailQueued
      : delivery === "sent"
        ? t.rewardEmailAccepted
        : t.rewardUnavailable;
  const confirmationMessage = capture
    ? ({
        queued: t.marketingConfirmation,
        sent: t.marketingConfirmationAccepted,
        failed: t.marketingConfirmationFailed,
        quarantined: t.marketingConfirmationQuarantined,
        skipped: t.marketingConfirmationSkipped,
        disabled: t.marketingConfirmationDisabled,
        not_configured: t.marketingConfirmationDisabled,
        unknown: t.marketingConfirmationUnknown,
      }[capture.delivery] ?? t.marketingConfirmationUnknown)
    : "";
  const errorCopy: Partial<Record<string, string>> = {
    request_conflict: t.captureConflict,
    rate_limited: t.captureRateLimit,
    invalid_email: t.invalid,
  };
  const message = failure
    ? (errorCopy[failure.code] ??
      (language === "es" ? t.requestError : failure.message))
    : "";

  useEffect(() => {
    if (!form.current || signupViewed.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio < 0.5) return;
        signupViewed.current = analytics.track("FanSignupViewed", {
          ...(releaseSlug && { release_slug: releaseSlug }),
          placement,
          language,
        });
        if (signupViewed.current) observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(form.current);
    return () => observer.disconnect();
  }, [language, placement, releaseSlug, state]);

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
    requestAttribution.current = undefined;
    setState("idle");
    setFailure(undefined);
    setCapture(null);
  }
  function started() {
    if (signupStarted.current) return;
    signupStarted.current = analytics.track("FanSignupStarted", {
      ...(releaseSlug && { release_slug: releaseSlug }),
      placement,
      language,
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    if (requestLocale.current !== language) {
      request.current = crypto.randomUUID();
      requestAttribution.current = undefined;
      requestLocale.current = language;
    }
    let normalized: string;
    try {
      normalized = normalizeEmail(email);
    } catch {
      setState("invalid");
      setFailure(undefined);
      return;
    }
    busy.current = true;
    setState("loading");
    setFailure(undefined);
    try {
      requestAttribution.current ??= attribution();
      const result = await fanService.capture({
        requestId: request.current,
        email: normalized,
        language,
        // Keep the existing invitation source; attribution adds the route's release.
        source: "stay_close",
        emailMarketing: optIn,
        analyticsConsent: analytics.allowed(),
        ...requestAttribution.current,
      });
      if (result.success) {
        if (result.data.measurementToken)
          analytics.remember(result.data.measurementToken);
        setCapture(result.data);
        setState("success");
        analytics.track(
          "Lead",
          {
            ...(releaseSlug && { release_slug: releaseSlug }),
            placement,
            language,
          },
          result.data.eventId,
        );
      } else {
        setState("error");
        if (result.error.code === "request_conflict") {
          request.current = crypto.randomUUID();
          requestAttribution.current = undefined;
        }
        setFailure(result.error);
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
        {state === "success" ? rewardMessage : ""}
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
              {successTitle}
            </h3>
            {optIn && <p>{t.captureSaved}</p>}
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
            <p className="stay-confirmation-consent">
              {optIn ? confirmationMessage : t.marketingNotRequested}
            </p>
            {rewardUnavailable && (
              <button
                className="button button--outline"
                type="button"
                onClick={() => {
                  edited();
                  requestAnimationFrame(() =>
                    form.current?.querySelector("input")?.focus(),
                  );
                }}
              >
                {t.captureRetry}
              </button>
            )}
          </div>
        </div>
      ) : (
        <form
          ref={form}
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
                if (event.target.value.trim()) started();
                setEmail(event.target.value);
                edited();
              }}
              disabled={state === "loading"}
              aria-invalid={
                state === "invalid" || failure?.code === "invalid_email"
              }
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
              aria-describedby={disclosureId}
              checked={optIn}
              onChange={(event) => {
                started();
                setOptIn(event.target.checked);
                edited();
              }}
              disabled={state === "loading"}
            />
            {t.emailOptIn}
          </label>
          <p id={disclosureId} className="capture-disclosure">
            {t.forms.disclosure} <Link to="/privacy">{t.privacy.title}</Link>
          </p>
          <p
            id={statusId}
            className={`form-status${state === "error" || state === "invalid" ? " form-status--error" : ""}`}
            role="status"
          >
            {state === "invalid" ? t.invalid : message}
          </p>
        </form>
      )}
    </div>
  );
}

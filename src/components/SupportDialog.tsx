import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { catalog } from "../config/runtime";
import { useLocale, vaultCopy } from "../hooks/useLocale";
import type { VaultItem } from "../domain/types";
import {
  amountFromInput,
  normalizeEmail,
  validAmount,
} from "../../supabase/shared/validation";
import { fanService, checkoutService } from "../services/fan";
import { attribution } from "../services/attribution";
import { analytics } from "../services/analytics";
import type { CheckoutResponse } from "../../supabase/shared/contracts";
import { operatorTestToken, checkPaymentTest } from "../services/payment-test";

export function SupportDialog({
  onClose,
  item,
  initialAmount,
}: {
  onClose: () => void;
  item?: VaultItem;
  initialAmount?: number;
}) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState(
    String((initialAmount ?? catalog.support.defaultMinor) / 100),
  );
  const [email, setEmail] = useState("");
  const { locale: language, t } = useLocale();
  const itemCopy = item ? vaultCopy(item, t) : undefined;
  const [optIn, setOptIn] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutResponse>();
  const captureId = useRef(crypto.randomUUID());
  const attemptId = useRef(crypto.randomUUID());
  const captureToken = useRef("");
  const busy = useRef(false);
  const [operatorToken] = useState(operatorTestToken);
  const [testAuthorized, setTestAuthorized] = useState(false);
  useEffect(() => {
    if (item?.slug !== "accion-wallpaper" || !operatorToken) return;
    let active = true;
    void checkPaymentTest(operatorToken).then((result) => {
      if (active)
        setTestAuthorized(
          result.success &&
            result.data.itemSlug === item.slug &&
            result.data.priceMinor === item.priceMinor &&
            result.data.currency === item.currency,
        );
    });
    return () => {
      active = false;
    };
  }, [item?.slug, item?.priceMinor, item?.currency, operatorToken]);
  const minor = item?.priceMinor ?? amountFromInput(amount);
  const valid = validAmount(
    minor,
    catalog.support.minMinor,
    catalog.support.maxMinor,
  );
  function edited() {
    if (checkout) setStep(2);
    captureId.current = crypto.randomUUID();
    attemptId.current = crypto.randomUUID();
    captureToken.current = "";
    setCheckout(undefined);
    setMessage("");
  }
  async function saveContact(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    let normalized: string;
    try {
      normalized = normalizeEmail(email);
    } catch {
      setMessage("invalid");
      return;
    }
    busy.current = true;
    setLoading(true);
    setMessage("");
    try {
      if (!captureToken.current) {
        const result = await fanService.capture(
          {
            requestId: captureId.current,
            email: normalized,
            language,
            source: "support_modal",
            emailMarketing: testAuthorized ? false : optIn,
            analyticsConsent: !testAuthorized && analytics.allowed(),
            ...attribution(),
            ...(testAuthorized
              ? {
                  operatorTestToken: operatorToken,
                  firstTouch: { utm_source: "accion-operator-test" },
                  lastTouch: { utm_source: "accion-operator-test" },
                }
              : {}),
          },
          testAuthorized,
        );
        if (!result.success) {
          setMessage(result.error.message);
          return;
        }
        captureToken.current = result.data.captureToken;
        if (result.data.measurementToken)
          analytics.remember(result.data.measurementToken);
        analytics.track("Lead", {}, result.data.eventId);
      }
      const result = await checkoutService.create({
        requestId: attemptId.current,
        captureToken: captureToken.current,
        purpose: item ? "vault_unlock" : "tip",
        amountMinor: minor ?? undefined,
        itemSlug: item?.slug,
        analyticsConsent: !testAuthorized && analytics.allowed(),
        ...(testAuthorized ? { operatorTestToken: operatorToken } : {}),
      });
      if (!result.success) {
        setMessage(result.error.message);
        return;
      }
      try {
        sessionStorage.setItem("jona:checkout", JSON.stringify(result.data));
      } catch {
        /* Return fragment carries the scoped token. */
      }
      analytics.remember(result.data.statusToken);
      setCheckout(result.data);
      setStep(3);
      analytics.track(
        "InitiateCheckout",
        { value: (minor ?? 0) / 100, currency: "USD" },
        result.data.eventId,
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  const unavailable =
    item?.status !== undefined &&
    item.status !== "available" &&
    !testAuthorized;
  return (
    <Dialog
      title={t.supportUI.dialog}
      onClose={onClose}
      className="support-dialog support-flow-dialog"
      footer={
        <>
          {!unavailable &&
            (step === 1 ? (
              <button
                className="button button--lime support-continue"
                type="button"
                disabled={!valid}
                onClick={() => setStep(2)}
              >
                {t.next}
              </button>
            ) : step === 2 ? (
              <div className="form-actions">
                <button
                  className="button button--outline"
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  {t.back}
                </button>
                <button
                  className="button button--lime"
                  type="submit"
                  form="support-contact-form"
                  disabled={loading}
                >
                  {loading ? t.saving : t.next}
                </button>
              </div>
            ) : checkout ? (
              <div className="form-actions">
                <button
                  className="button button--outline"
                  type="button"
                  onClick={() => setStep(2)}
                >
                  {t.back}
                </button>
                <a className="button button--lime" href={checkout.url}>
                  {t.pay}
                </a>
              </div>
            ) : null)}
        </>
      }
    >
      <h2 className="display-heading">
        {item ? t.supportUI.vaultFirst : t.supportUI.first}{" "}
        <em>{item ? t.supportUI.vaultSecond : t.supportUI.second}</em>
      </h2>
      <p>{itemCopy?.title ?? t.support}</p>
      {testAuthorized && <p role="status">{t.supportUI.operator}</p>}
      {unavailable ? (
        <p role="status">{t.unavailable}</p>
      ) : (
        <>
          {step === 1 && (
            <>
              {item ? (
                <>
                  <p>{itemCopy?.description}</p>
                  <p className="purchase-amount">
                    ${(item.priceMinor / 100).toFixed(2)} USD
                  </p>
                </>
              ) : (
                <>
                  <fieldset className="amount-fieldset">
                    <legend className="eyebrow">{t.amount}</legend>
                    {catalog.support.presets.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`amount-button ${minor === value ? "selected" : ""}`}
                        aria-pressed={minor === value}
                        onClick={() => {
                          setAmount(String(value / 100));
                          edited();
                        }}
                      >
                        ${value / 100}
                      </button>
                    ))}
                  </fieldset>
                  <label className="form-label">
                    {t.forms.custom}
                    <input
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        edited();
                      }}
                      aria-invalid={!valid}
                      aria-describedby="amount-error"
                    />
                  </label>
                  {!valid && (
                    <p
                      id="amount-error"
                      className="form-status--error"
                      role="alert"
                    >
                      {t.amountError}
                    </p>
                  )}
                </>
              )}
              <p className="fine-print">{item ? t.refund : t.tax}</p>
            </>
          )}
          {step === 2 && (
            <form
              id="support-contact-form"
              onSubmit={(e) => void saveContact(e)}
              noValidate
              aria-busy={loading}
            >
              <label className="form-label">
                {t.email}
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    edited();
                  }}
                  disabled={loading}
                  aria-describedby="support-status"
                  aria-invalid={message === "invalid"}
                />
              </label>
              <label className="consent-control">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={(e) => {
                    setOptIn(e.target.checked);
                    edited();
                  }}
                  disabled={loading || testAuthorized}
                />
                {t.emailOptIn}
              </label>
              <p className="fine-print">{t.whatsapp}</p>
            </form>
          )}
          {step === 3 && checkout && (
            <>
              <p>
                ${((minor ?? 0) / 100).toFixed(2)} USD ·{" "}
                {itemCopy?.title ?? t.supportUI.title}
              </p>
              <p>{t.saved}</p>
              <p className="fine-print">{item ? t.refund : t.tax}</p>
            </>
          )}
        </>
      )}
      <p
        id="support-status"
        className="form-status form-status--error"
        role="status"
      >
        {message === "invalid"
          ? t.invalid
          : message
            ? language === "es"
              ? t.requestError
              : message
            : ""}
      </p>
    </Dialog>
  );
}

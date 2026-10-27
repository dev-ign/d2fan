import { useLocale } from "../../hooks/useLocale";
import { useState } from "react";
import { analytics } from "../../services/analytics";
export function PrivacyControls() {
  const { t } = useLocale();
  const [allowed, setAllowed] = useState(analytics.allowed);
  const [failed, setFailed] = useState(false);
  async function change(value: boolean) {
    setAllowed(value);
    const success = await analytics.setConsent(value);
    setFailed(!success);
  }
  return (
    <div className="privacy-controls">
      <label>
        <input
          type="checkbox"
          checked={allowed}
          onChange={(e) => void change(e.target.checked)}
        />{" "}
        {t.privacy.allow}
      </label>
      <span>{t.privacy.optional}</span>
      <p role="status">{failed ? t.privacy.error : ""}</p>
    </div>
  );
}

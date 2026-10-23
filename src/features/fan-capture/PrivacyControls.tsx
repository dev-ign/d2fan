import { useState } from "react";
import { analytics } from "../../services/analytics";
export function PrivacyControls() {
  const [allowed, setAllowed] = useState(analytics.allowed);
  const [message, setMessage] = useState("");
  async function change(value: boolean) {
    setAllowed(value);
    const success = await analytics.setConsent(value);
    setMessage(
      success
        ? ""
        : "Browser measurement is off. Could not update queued server events; reconnect and toggle off again to retry.",
    );
  }
  return (
    <div className="privacy-controls">
      <label>
        <input
          type="checkbox"
          checked={allowed}
          onChange={(e) => void change(e.target.checked)}
        />{" "}
        Allow campaign measurement with Meta
      </label>
      <span>Optional. Music and purchases work either way.</span>
      <p role="status">{message}</p>
    </div>
  );
}

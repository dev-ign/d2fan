import { expect, it, vi } from "vitest";
import { api } from "./api";
import { analytics } from "./analytics";

vi.mock("../config/runtime", () => ({
  runtime: { pixelId: "123", paymentTestApi: "" },
}));
vi.mock("./api", () => ({ api: vi.fn() }));

it("requires measurement consent and keeps browser event payloads allowlisted", async () => {
  const fbq = Object.assign(vi.fn(), {
    queue: [],
    version: "2.0",
    loaded: true,
  });
  window.fbq = fbq;
  const details = {
    placement: "release_page",
    release_slug: "shorty",
    language: "es",
    email: "listener@example.com",
    token: "private-token",
    ip: "192.0.2.1",
  };
  try {
    expect(analytics.track("FanSignupViewed", details)).toBe(false);
    expect(fbq).not.toHaveBeenCalled();
    await analytics.setConsent(true);
    for (const event of [
      "FanSignupViewed",
      "FanSignupStarted",
      "MusicPreviewStarted",
      "DSPClick",
    ] as const) {
      expect(analytics.track(event, details)).toBe(true);
      expect(fbq).toHaveBeenLastCalledWith(
        "trackCustom",
        event,
        { placement: "release_page", release_slug: "shorty", language: "es" },
        { eventID: expect.any(String) },
      );
    }
    analytics.track("Lead", details, "capture:existing-event");
    expect(fbq).toHaveBeenLastCalledWith(
      "track",
      "Lead",
      { placement: "release_page", release_slug: "shorty", language: "es" },
      { eventID: "capture:existing-event" },
    );
    history.replaceState(null, "", "/#confirm=private-token");
    expect(analytics.track("FanSignupStarted", details)).toBe(false);
    expect(api).not.toHaveBeenCalled();
  } finally {
    history.replaceState(null, "", "/");
    await analytics.setConsent(false);
    delete window.fbq;
    localStorage.clear();
  }
});

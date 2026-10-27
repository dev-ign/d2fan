import type { AnalyticsEvent } from "../../supabase/shared/contracts";
import { runtime } from "../config/runtime";
import { api } from "./api";
type Pixel = ((...args: unknown[]) => void) & {
  queue: unknown[][];
  loaded: boolean;
  version: string;
  callMethod?: (...args: unknown[]) => void;
};
declare global {
  interface Window {
    fbq?: Pixel;
    _fbq?: Pixel;
  }
}
let consent = false;
try {
  consent = localStorage.getItem("jona:measurement") === "yes";
} catch {
  /* Tracking stays opt-in. */
}
function pixel() {
  if (!runtime.pixelId || !/^\d+$/.test(runtime.pixelId)) return;
  if (!window.fbq) {
    const queue: unknown[][] = [];
    const fbq = Object.assign(
      (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else queue.push(args);
      },
      { queue, loaded: true, version: "2.0" },
    ) as Pixel;
    window.fbq = fbq;
    window._fbq = fbq;
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.async = true;
    document.head.append(script);
    fbq("set", "autoConfig", false, runtime.pixelId);
    fbq("consent", "grant");
    fbq("init", runtime.pixelId);
  }
  return window.fbq;
}
let contexts: string[] = [];
try {
  contexts = JSON.parse(
    sessionStorage.getItem("jona:measurementContexts") ?? "[]",
  );
} catch {
  /* Optional storage. */
}
export const analytics = {
  allowed: () => consent,
  remember(token: string) {
    contexts = [...new Set([...contexts, token])].slice(-20);
    try {
      sessionStorage.setItem(
        "jona:measurementContexts",
        JSON.stringify(contexts),
      );
    } catch {
      /* Optional storage. */
    }
  },
  async setConsent(value: boolean) {
    consent = value;
    const revokeResult =
      !value && contexts.length
        ? api("revoke-measurement", { tokens: contexts })
        : undefined;
    try {
      localStorage.setItem("jona:measurement", value ? "yes" : "no");
    } catch {
      /* Optional storage. */
    }
    window.fbq?.("consent", value ? "grant" : "revoke");
    if (value) this.track("PageView");
    return revokeResult ? (await revokeResult).success : true;
  },
  track(
    event: AnalyticsEvent,
    details: Record<string, string | number> = {},
    id: string = crypto.randomUUID(),
  ) {
    if (
      runtime.paymentTestApi ||
      !consent ||
      Boolean(location.search) ||
      /(?:reward|status|access|confirm|unsubscribe|vault-test)=/.test(
        location.hash,
      )
    )
      return;
    const data: Record<string, string | number> = {};
    for (const key of ["value", "currency", "release_slug", "platform"])
      if (details[key] !== undefined) data[key] = details[key];
    const fbq = pixel();
    fbq?.(
      ["VaultUnlock", "DSPClick"].includes(event) ? "trackCustom" : "track",
      event,
      data,
      { eventID: id },
    );
    // Lead/checkout/purchase/unlock CAPI comes from the durable server outbox.
    if (event === "PageView" || event === "DSPClick")
      void api("analytics-event", {
        event,
        eventId: id,
        consent: true,
        release_slug: data.release_slug,
      });
  },
};

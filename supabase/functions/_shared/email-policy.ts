import { normalizeEmail } from "../../shared/validation.ts";

export const emailKinds = [
  "capture",
  "purchase",
  "recovery",
  "welcome",
  "reminder",
  "transactional_test",
] as const;
export type EmailKind = (typeof emailKinds)[number];
export type EmailClass = "transactional" | "permission_request" | "marketing";
export const retryWindowMs = 23 * 60 * 60 * 1000;
export const dispatchMarginMs = 30_000;
export class EmailConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super("email_configuration");
  }
}
type Settings = (name: string) => string | undefined;
export function plainEmail(value: unknown) {
  const email = normalizeEmail(value);
  if (
    /[<>,;:\r\n]/.test(email) ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)
  )
    throw new Error("invalid_email");
  return email;
}
export function mailbox(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("invalid_email");
  const match = value.trim().match(/^(?:[^<>]+<([^<>]+)>|([^<>\s]+))$/);
  return plainEmail(match?.[1]?.trim() || match?.[2] || "");
}
export function classifyEmail(
  kind: string,
  payload: Record<string, unknown>,
): EmailClass {
  if (kind === "welcome" || kind === "reminder") return "marketing";
  if (["purchase", "recovery", "transactional_test"].includes(kind))
    return "transactional";
  // Only a specifically requested reward or explicit permission request qualifies.
  if (kind === "capture" && payload.magnet === true) return "transactional";
  if (kind === "capture" && payload.confirm === true)
    return "permission_request";
  throw new Error("unsupported_email");
}
export function readEmailConfig(get: Settings = (name) => Deno.env.get(name)) {
  const fields: string[] = [];
  const key = get("EMAIL_PROVIDER_API_KEY")?.trim() || "";
  const from = get("EMAIL_FROM_ADDRESS")?.trim() || "";
  const support = get("SUPPORT_EMAIL")?.trim() || "";
  const postal = get("BUSINESS_POSTAL_ADDRESS")?.trim() || "";
  if (!key || !/^re_[A-Za-z0-9_-]+$/.test(key))
    fields.push("EMAIL_PROVIDER_API_KEY");
  try {
    if (mailbox(from).split("@")[1] !== "jonaferreira.com") throw new Error();
  } catch {
    fields.push("EMAIL_FROM_ADDRESS");
  }
  try {
    plainEmail(support);
    if (/[\r\n]/.test(support)) throw new Error();
  } catch {
    fields.push("SUPPORT_EMAIL");
  }
  let origin = "";
  try {
    const url = new URL(get("PUBLIC_SITE_URL") || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error();
    origin = url.origin;
  } catch {
    fields.push("PUBLIC_SITE_URL");
  }
  if ((get("ACCESS_TOKEN_SECRET") || "").length < 32)
    fields.push("ACCESS_TOKEN_SECRET");
  if (fields.length) throw new EmailConfigurationError(fields);
  // A placeholder is not a valid postal address. Operator must also verify reality.
  const postalReady =
    postal.length >= 12 &&
    /\d/.test(postal) &&
    !/\b(?:example|placeholder|todo|tbd|your address)\b/i.test(postal);
  return {
    key,
    from,
    support,
    origin,
    postal,
    marketingReady: get("EMAIL_MARKETING_ENABLED") === "true" && postalReady,
    marketingBlock: !postalReady
      ? "BUSINESS_POSTAL_ADDRESS"
      : get("EMAIL_MARKETING_ENABLED") !== "true"
        ? "EMAIL_MARKETING_ENABLED"
        : null,
  };
}
export function canDispatch(
  first: string | null,
  deadline: string | null,
  now = Date.now(),
) {
  const start = Date.parse(first || ""),
    end = Date.parse(deadline || "");
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now &&
    end <= start + retryWindowMs &&
    now + dispatchMarginMs < end
  );
}
export function captureEmailConfigured() {
  try {
    readEmailConfig();
    return Deno.env.get("EMAIL_DELIVERY_ENABLED") === "true";
  } catch {
    return false;
  }
}

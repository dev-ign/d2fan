export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_email");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("invalid_email");
  return email;
}
export function validatePhone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
export function amountFromInput(value: string): number | null {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, cents = ""] = value.split(".");
  return Number(whole) * 100 + Number(cents.padEnd(2, "0"));
}
export function validAmount(
  value: unknown,
  min = 500,
  max = 100000,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}
export function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function boundedAttribution(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "ref",
    "release",
  ]) {
    const v = (value as Record<string, unknown>)[key];
    // Campaign labels only; exclude URLs, tokens and likely contact information.
    if (
      typeof v === "string" &&
      /^[\p{L}\p{N}_ .-]{1,100}$/u.test(v) &&
      !/\d{7}/.test(v)
    )
      result[key] = v;
  }
  return result;
}

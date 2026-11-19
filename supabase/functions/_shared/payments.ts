import Stripe from "npm:stripe@22.0.0";

export type PaymentMode = "test" | "live";
export interface PaymentContext {
  mode: PaymentMode;
  accountId: string;
}

export function paymentConfiguration(): PaymentContext & { key: string } {
  const mode = Deno.env.get("STRIPE_PAYMENT_MODE");
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const accountId = Deno.env.get("STRIPE_ACCOUNT_ID") ?? "";
  // Claimable Stripe CLI sandboxes issue restricted test-only keys.
  const keyTypes = mode === "test" ? "sk|rk|rkcs" : "sk|rk";
  if (
    (mode !== "test" && mode !== "live") ||
    !new RegExp(`^(${keyTypes})_${mode}_[A-Za-z0-9_]+$`).test(key) ||
    !/^acct_[A-Za-z0-9]+$/.test(accountId)
  )
    throw new Error("payment_configuration");
  return { mode, accountId, key };
}

export function stripe(config = paymentConfiguration()) {
  return new Stripe(config.key, { httpClient: Stripe.createFetchHttpClient() });
}

export async function verifyStripeAccount(
  client: Stripe,
  context: PaymentContext,
) {
  if ((await client.accounts.retrieveCurrent()).id !== context.accountId)
    throw new Error("payment_configuration");
}

export function stripeModeMatches(
  object: { livemode?: boolean },
  mode: PaymentMode,
) {
  return object.livemode === (mode === "live");
}

export function checkoutSessionIdMatches(
  id: unknown,
  mode: PaymentMode,
): id is string {
  return typeof id === "string" && id.startsWith(`cs_${mode}_`);
}

export function checkoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.origin === "https://checkout.stripe.com" &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function attemptModeMatches(
  attempt: {
    payment_mode: unknown;
    stripe_account_id: unknown;
    stripe_session_id: unknown;
    fan_id: unknown;
  },
  context: PaymentContext,
) {
  if (!checkoutSessionIdMatches(attempt.stripe_session_id, context.mode))
    return false;
  // Historical fan-linked sandbox sessions have no persisted mode or account.
  if (attempt.payment_mode === null && attempt.stripe_account_id === null)
    return context.mode === "test" && typeof attempt.fan_id === "string";
  return (
    attempt.payment_mode === context.mode &&
    attempt.stripe_account_id === context.accountId
  );
}

import Stripe from "npm:stripe@22.0.0";
import { env, db, catalog, rpc } from "../_shared/platform.ts";
import {
  attemptModeMatches,
  checkoutSessionIdMatches,
  paymentConfiguration,
  stripe,
  stripeModeMatches,
  verifyStripeAccount,
  type PaymentContext,
} from "../_shared/payments.ts";
import { uuid } from "../../shared/validation.ts";

const checkoutEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
];

async function loadAttempt(id: unknown, config: PaymentContext) {
  if (!uuid(id)) throw new Error("payment_mismatch");
  const { data, error } = await db()
    .from("checkout_attempts")
    .select(
      "id,fan_id,purpose,item_slug,amount_minor,currency,payment_mode,stripe_account_id,stripe_session_id",
    )
    .eq("id", id)
    .eq("artist_id", catalog.artistId)
    .single();
  if (error || !data || !attemptModeMatches(data, config))
    throw new Error("payment_mismatch");
  if (
    data.purpose !== "tip" &&
    (data.purpose !== "vault_unlock" || config.mode !== "test")
  )
    throw new Error("payment_mismatch");
  return data;
}

type Attempt = Awaited<ReturnType<typeof loadAttempt>>;

function metadataMatches(metadata: Stripe.Metadata | null, attempt: Attempt) {
  return (
    metadata?.artist_id === catalog.artistId &&
    metadata.attempt_id === attempt.id &&
    (metadata.purpose === attempt.purpose ||
      (attempt.payment_mode === null && !metadata.purpose))
  );
}

function sessionMatches(
  session: Stripe.Checkout.Session,
  attempt: Attempt,
  config: PaymentContext,
) {
  return (
    stripeModeMatches(session, config.mode) &&
    session.mode === "payment" &&
    session.id === attempt.stripe_session_id &&
    session.client_reference_id === attempt.id &&
    session.amount_total === attempt.amount_minor &&
    session.currency === attempt.currency &&
    metadataMatches(session.metadata, attempt) &&
    (session.metadata?.item_slug ?? "") === (attempt.item_slug ?? "") &&
    (session.metadata?.fan_id ?? null) === attempt.fan_id
  );
}

function paidIntent(
  session: Stripe.Checkout.Session,
  attempt: Attempt,
  config: PaymentContext,
) {
  const intent = session.payment_intent;
  if (
    !intent ||
    typeof intent === "string" ||
    !stripeModeMatches(intent, config.mode) ||
    !metadataMatches(intent.metadata, attempt) ||
    intent.status !== "succeeded" ||
    intent.amount !== attempt.amount_minor ||
    intent.amount_received !== attempt.amount_minor ||
    intent.currency !== attempt.currency
  )
    throw new Error("payment_mismatch");
  return intent.id;
}

export async function stripeWebhook(req: Request) {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  let config: ReturnType<typeof paymentConfiguration>;
  let signingSecret: string;
  try {
    config = paymentConfiguration();
    signingSecret = env("STRIPE_WEBHOOK_SECRET");
  } catch {
    return new Response("Payment configuration required", { status: 503 });
  }
  const payments = stripe(config);
  let event: Stripe.Event;
  try {
    event = await payments.webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") || "",
      signingSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (!stripeModeMatches(event, config.mode) || event.account || event.context)
    return new Response("Unexpected Stripe event context", { status: 400 });

  try {
    if (checkoutEvents.includes(event.type)) {
      const received = event.data.object as Stripe.Checkout.Session;
      if (received.metadata?.artist_id !== catalog.artistId)
        return new Response("Ignored", { status: 200 });
      if (!checkoutSessionIdMatches(received.id, config.mode))
        return new Response("Unexpected Stripe session mode", { status: 400 });
      await verifyStripeAccount(payments, config);
      const session = await payments.checkout.sessions.retrieve(received.id, {
        expand: ["payment_intent"],
      });
      const attempt = await loadAttempt(session.metadata?.attempt_id, config);
      if (!sessionMatches(session, attempt, config))
        throw new Error("payment_mismatch");
      if (session.payment_status === "paid") {
        await rpc("fulfill_checkout", {
          p_event: event.id,
          p_type: event.type,
          p_attempt: attempt.id,
          p_session: session.id,
          p_intent: paidIntent(session, attempt, config),
          p_amount: session.amount_total,
          p_currency: session.currency,
        });
      } else if (
        (event.type === "checkout.session.expired" &&
          session.status === "expired") ||
        event.type === "checkout.session.async_payment_failed"
      ) {
        const { error } = await db()
          .from("checkout_attempts")
          .update({
            status:
              event.type === "checkout.session.expired" ? "expired" : "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", attempt.id)
          .in("status", ["draft", "pending_payment"]);
        if (error) throw new Error("database_unavailable");
      }
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      await verifyStripeAccount(payments, config);
      const current = await payments.charges.retrieve(charge.id, {
        expand: ["payment_intent"],
      });
      if (!stripeModeMatches(current, config.mode))
        throw new Error("payment_mismatch");
      const intent = current.payment_intent;
      if (!intent) return new Response("Ignored", { status: 200 });
      if (typeof intent === "string") throw new Error("payment_mismatch");
      if (intent.metadata.artist_id !== catalog.artistId)
        return new Response("Ignored", { status: 200 });
      if (current.amount_refunded === 0)
        return new Response("Ignored", { status: 200 });
      const attempt = await loadAttempt(intent.metadata.attempt_id, config);
      const session = await payments.checkout.sessions.retrieve(
        attempt.stripe_session_id,
        { expand: ["payment_intent"] },
      );
      if (
        !stripeModeMatches(intent, config.mode) ||
        !metadataMatches(intent.metadata, attempt) ||
        current.amount !== attempt.amount_minor ||
        current.currency !== attempt.currency ||
        !sessionMatches(session, attempt, config) ||
        paidIntent(session, attempt, config) !== intent.id
      )
        throw new Error("payment_mismatch");
      await rpc("refund_purchase", {
        p_event: event.id,
        p_intent: intent.id,
        p_full: current.refunded,
      });
    }
    return new Response("Accepted", { status: 200 });
  } catch {
    console.error("webhook_processing_failed", event.id);
    return new Response("Retry", { status: 503 });
  }
}
if (import.meta.main) Deno.serve(stripeWebhook);

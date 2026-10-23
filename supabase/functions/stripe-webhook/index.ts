import Stripe from "npm:stripe@22.0.0";
import { stripe, env, db, catalog, rpc } from "../_shared/platform.ts";
export async function stripeWebhook(req: Request) {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = await stripe().webhooks.constructEventAsync(
      raw,
      req.headers.get("stripe-signature") || "",
      env("STRIPE_WEBHOOK_SECRET"),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
      ].includes(event.type)
    ) {
      const received = event.data.object as Stripe.Checkout.Session;
      if (received.metadata?.artist_id !== catalog.artistId)
        return new Response("Ignored", { status: 200 });
      // Retrieve current canonical state to tolerate out-of-order notifications.
      const session = await stripe().checkout.sessions.retrieve(received.id);
      if (
        session.payment_status === "paid" &&
        session.payment_intent &&
        session.metadata?.attempt_id
      ) {
        await rpc("fulfill_checkout", {
          p_event: event.id,
          p_type: event.type,
          p_attempt: session.metadata.attempt_id,
          p_session: session.id,
          p_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent.id,
          p_amount: session.amount_total,
          p_currency: session.currency,
        });
      } else if (
        event.type === "checkout.session.expired" ||
        event.type === "checkout.session.async_payment_failed"
      ) {
        const { error } = await db()
          .from("checkout_attempts")
          .update({
            status:
              event.type === "checkout.session.expired" ? "expired" : "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_session_id", session.id)
          .neq("status", "completed");
        if (error) throw new Error("database_unavailable");
      }
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      // Fetch latest refund totals; stale partial-refund events cannot downgrade a full refund.
      const current = await stripe().charges.retrieve(charge.id);
      const intent =
        typeof current.payment_intent === "string"
          ? current.payment_intent
          : current.payment_intent?.id;
      if (intent) {
        const payment = await stripe().paymentIntents.retrieve(intent);
        if (payment.metadata.artist_id !== catalog.artistId)
          return new Response("Ignored", { status: 200 });
        await rpc("refund_purchase", {
          p_event: event.id,
          p_intent: intent,
          p_full: current.refunded,
        });
      }
    }
    return new Response("Accepted", { status: 200 });
  } catch {
    console.error("webhook_processing_failed", event.id);
    return new Response("Retry", { status: 503 });
  }
}
if (import.meta.main) Deno.serve(stripeWebhook);

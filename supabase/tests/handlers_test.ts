import {
  captureFan,
  createCheckout,
  checkoutStatus,
  redeemVault,
} from "../functions/_shared/handlers.ts";
import { token, endpoint } from "../functions/_shared/platform.ts";
import { signToken, verifyToken } from "../functions/_shared/security.ts";
const secret = "a-long-local-only-test-secret-with-32-characters";
for (const [name, value] of Object.entries({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  ACCESS_TOKEN_SECRET: secret,
  RATE_LIMIT_SALT: secret,
  ALLOWED_ORIGINS: "http://localhost:5173",
  PUBLIC_SITE_URL: "http://localhost:5173",
  STRIPE_SECRET_KEY: "sk_test_local_only",
  SCHEDULER_SECRET: secret,
}))
  Deno.env.set(name, value);
function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
  } catch (e) {
    assert(e instanceof Error && e.message === message);
    return;
  }
  throw new Error("expected rejection");
}
Deno.test(
  "scoped token rejects tampering, cross-artist, expired and wrong-purpose claims",
  async () => {
    const claims = {
      scope: "capture" as const,
      sub: "test-fan",
      artist: "jona-ferreira",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    const value = await signToken(claims, secret);
    assert(
      (await verifyToken(value, "capture", "jona-ferreira", secret)).sub ===
        "test-fan",
    );
    await rejects(
      () => verifyToken(value + "x", "capture", "jona-ferreira", secret),
      "unauthorized",
    );
    await rejects(
      () => verifyToken(value, "access", "jona-ferreira", secret),
      "unauthorized",
    );
    await rejects(
      () => verifyToken(value, "capture", "other", secret),
      "unauthorized",
    );
    await rejects(
      async () =>
        verifyToken(
          await signToken({ ...claims, exp: 1 }, secret),
          "capture",
          "jona-ferreira",
          secret,
        ),
      "unauthorized",
    );
  },
);
Deno.test(
  "invalid input is rejected before network; coming-soon products never charge",
  async () => {
    const req = new Request("http://localhost");
    await rejects(() => captureFan(req, { email: "bad" }), "invalid_email");
    const captureToken = await token("capture", "fan", 300);
    await rejects(
      () =>
        createCheckout(req, {
          requestId: crypto.randomUUID(),
          captureToken,
          purpose: "tip",
          amountMinor: 499,
          analyticsConsent: false,
        }),
      "invalid_amount",
    );
    await rejects(
      () =>
        createCheckout(req, {
          requestId: crypto.randomUUID(),
          captureToken,
          purpose: "vault_unlock",
          itemSlug: "accion-wallpaper",
          amountMinor: 1,
          analyticsConsent: false,
        }),
      "unavailable_item",
    );
    await rejects(
      () => checkoutStatus(req, { token: "cs_test_known_session" }),
      "unauthorized",
    );
    await rejects(
      async () =>
        redeemVault(req, { token: await token("capture", "known-fan", 300) }),
      "unauthorized",
    );
  },
);
Deno.test(
  "public origin enforcement and worker secret are independent of the publishable key",
  async () => {
    const handler = endpoint(async () => ({ ok: true }));
    assert(
      (
        await handler(
          new Request("http://localhost", {
            method: "POST",
            headers: { Origin: "https://evil.example", apikey: "publishable" },
            body: "{}",
          }),
        )
      ).status === 403,
    );
    const worker = endpoint(async () => ({ ok: true }), { worker: true });
    assert(
      (
        await worker(
          new Request("http://localhost", {
            method: "POST",
            headers: { Authorization: "Bearer publishable" },
            body: "{}",
          }),
        )
      ).status === 401,
    );
    assert(
      (
        await worker(
          new Request("http://localhost", {
            method: "POST",
            headers: { Authorization: `Bearer ${secret}` },
            body: "{}",
          }),
        )
      ).status === 200,
    );
  },
);
Deno.test(
  "Stripe webhook rejects forged signatures using the raw body",
  async () => {
    Deno.env.set("STRIPE_WEBHOOK_SECRET", "whsec_local_only");
    const { stripeWebhook } =
      await import("../functions/stripe-webhook/index.ts");
    const response = await stripeWebhook(
      new Request("http://localhost", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=forged" },
        body: JSON.stringify({
          type: "checkout.session.completed",
          data: { object: { payment_status: "paid" } },
        }),
      }),
    );
    assert(response.status === 400);
  },
);
Deno.test(
  "capture and checkout orchestrate real adapters with mocked HTTP boundaries",
  async () => {
    const original = globalThis.fetch;
    const calls: { url: string; body: unknown }[] = [];
    const attempt = crypto.randomUUID();
    const fan = crypto.randomUUID();
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const body = init?.body
        ? String(init.body)
        : input instanceof Request
          ? await input.clone().text()
          : "";
      calls.push({ url, body });
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (url.includes("/rpc/check_rate")) return json(true);
      if (url.includes("/rpc/capture_fan")) return json(fan);
      if (url.includes("/rest/v1/fans"))
        return json({ email_normalized: "fan@example.com" });
      if (
        url.includes("/checkout_attempts") &&
        (init?.method === "GET" || !init?.method)
      )
        return json({
          id: attempt,
          artist_id: "jona-ferreira",
          fan_id: fan,
          purpose: "tip",
          item_slug: null,
          amount_minor: 1500,
          status: "draft",
          currency: "usd",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        });
      if (url.includes("api.stripe.com")) {
        assert(
          new URLSearchParams(body).get(
            "line_items[0][price_data][unit_amount]",
          ) === "1500",
          body,
        );
        return json({
          id: "cs_test_mock",
          url: "https://checkout.stripe.com/test",
        });
      }
      return json(null);
    };
    try {
      const req = new Request("http://localhost");
      const captured = await captureFan(req, {
        requestId: crypto.randomUUID(),
        email: " FAN@example.com ",
        language: "en",
        source: "support_modal",
        emailMarketing: false,
        analyticsConsent: false,
        firstTouch: { utm_source: "instagram" },
        lastTouch: { utm_source: "instagram" },
      });
      const created = await createCheckout(req, {
        requestId: attempt,
        captureToken: captured.captureToken,
        purpose: "tip",
        amountMinor: 1500,
        analyticsConsent: false,
      });
      assert(created.url === "https://checkout.stripe.com/test");
      assert(
        calls.findIndex((c) => c.url.includes("/rpc/capture_fan")) <
          calls.findIndex((c) => c.url.includes("api.stripe.com")),
      );
      assert(
        (
          await verifyToken(
            created.statusToken,
            "status",
            "jona-ferreira",
            secret,
          )
        ).sub === attempt,
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);

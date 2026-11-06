import { authorizePaymentTest } from "../functions/_shared/payment-test.ts";
import {
  createCheckout,
  checkoutStatus,
  redeemVault,
} from "../functions/_shared/handlers.ts";
import { signToken } from "../functions/_shared/security.ts";
import { stripe, token } from "../functions/_shared/platform.ts";
import { stripeWebhook } from "../functions/stripe-webhook/index.ts";
const secret = "local-unit-tests-only-secret-with-at-least-32-characters";
const req = new Request("http://127.0.0.1:54324/functions/v1/create-checkout", {
  headers: { origin: "http://localhost:5173" },
});
function setup() {
  for (const [name, value] of Object.entries({
    ACCION_TEST_CHECKOUT: "true",
    ACCION_TEST_TOKEN_SECRET: secret,
    ACCESS_TOKEN_SECRET: secret,
    STRIPE_SECRET_KEY: "sk_test_mock",
    STRIPE_WEBHOOK_SECRET: "whsec_mock",
    PUBLIC_SITE_URL: "http://localhost:5173",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-test",
    PRIVATE_FILE_PATHS: '{"accion-wallpaper":"paid/accion-wallpaper-pack.zip"}',
  }))
    Deno.env.set(name, value);
}
function assert(value: unknown): asserts value {
  if (!value) throw new Error("assertion failed");
}
async function denied(fn: () => Promise<unknown>) {
  let rejected = false;
  try {
    await fn();
  } catch {
    rejected = true;
  }
  assert(rejected);
}
async function grant(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signToken(
    {
      scope: "operator_test",
      sub: "accion-wallpaper",
      artist: "jona-ferreira",
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    secret,
  );
}
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });

async function webhookRequest(event: Record<string, unknown>) {
  const payload = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000),
    encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("whsec_mock"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${payload}`),
  );
  return new Request("http://localhost", {
    method: "POST",
    headers: {
      "stripe-signature": `t=${timestamp},v1=${Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("")}`,
    },
    body: payload,
  });
}

Deno.test(
  "normal checkout rejects live, missing and ambiguous keys before any network or attempt write",
  async () => {
    setup();
    const captureToken = await token("capture", "fan", 300),
      original = fetch;
    let requests = 0;
    globalThis.fetch = () => {
      requests++;
      throw new Error("network forbidden");
    };
    try {
      for (const key of [
        undefined,
        "",
        "sk_live_mock",
        "rk_live_mock",
        "sk_test_",
        "sk_test_mock ",
        "unknown",
      ]) {
        if (key === undefined) Deno.env.delete("STRIPE_SECRET_KEY");
        else Deno.env.set("STRIPE_SECRET_KEY", key);
        let code = "";
        try {
          await createCheckout(req, {
            captureToken,
            requestId: crypto.randomUUID(),
            purpose: "tip",
            amountMinor: 500,
            analyticsConsent: false,
          });
        } catch (error) {
          code = error instanceof Error ? error.message : "";
        }
        assert(code === "stripe_test_mode_required");
        assert(
          (
            await stripeWebhook(
              new Request("http://localhost", { method: "POST", body: "{}" }),
            )
          ).status === 503,
        );
      }
      assert(requests === 0);
      for (const key of ["sk_test_mock", "rk_test_mock"]) {
        Deno.env.set("STRIPE_SECRET_KEY", key);
        assert(stripe());
      }
    } finally {
      globalThis.fetch = original;
      setup();
    }
  },
);

Deno.test(
  "operator grant requires signature, scope, item, artist, expiry, test key, switch and local origin",
  async () => {
    setup();
    const valid = await grant();
    assert((await authorizePaymentTest(req, valid)).priceMinor === 500);
    for (const value of [
      undefined,
      "forged",
      valid + "x",
      await grant({ scope: "capture" }),
      await grant({ sub: "cafe-studio" }),
      await grant({ artist: "other" }),
      await grant({ exp: 1 }),
      await grant({ exp: Math.floor(Date.now() / 1000) + 7200 }),
    ]) {
      await denied(() => authorizePaymentTest(req, value));
    }
    for (const [name, value] of [
      ["STRIPE_SECRET_KEY", "sk_live_mock"],
      ["ACCION_TEST_CHECKOUT", "false"],
      ["PUBLIC_SITE_URL", "https://example.com"],
    ]) {
      Deno.env.set(name, value);
      await denied(() => authorizePaymentTest(req, valid));
      setup();
    }
    await denied(() =>
      authorizePaymentTest(
        new Request("http://localhost", {
          headers: { origin: "https://example.com" },
        }),
        valid,
      ),
    );
    await denied(() =>
      authorizePaymentTest(new Request("http://localhost"), valid),
    );
  },
);

Deno.test(
  "authorized Acción checkout uses server $5 price and existing ZIP; other packages and arbitrary price fail closed",
  async () => {
    setup();
    const original = fetch;
    const fan = crypto.randomUUID(),
      attempt = crypto.randomUUID();
    const captureToken = await token("capture", fan, 300);
    const operatorTestToken = await grant();
    const body = {
      requestId: attempt,
      captureToken,
      operatorTestToken,
      purpose: "vault_unlock",
      itemSlug: "accion-wallpaper",
      amountMinor: 1,
      analyticsConsent: false,
    };
    let charged = 0,
      signed = 0;
    globalThis.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("/storage/v1/object/sign/")) {
        signed++;
        assert(url.endsWith("/vault-private/paid/accion-wallpaper-pack.zip"));
        assert(JSON.parse(String(init?.body)).expiresIn === 300);
        return Promise.resolve(json({ signedURL: "/object/sign/mock" }));
      }
      if (url.includes("/fans"))
        return Promise.resolve(
          json({ email_normalized: "qa+accion-test@example.com" }),
        );
      if (
        url.includes("/checkout_attempts") &&
        (!init?.method || init.method === "GET")
      )
        return Promise.resolve(
          json({
            id: attempt,
            fan_id: fan,
            purpose: "vault_unlock",
            item_slug: "accion-wallpaper",
            amount_minor: 500,
            currency: "usd",
            status: "draft",
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          }),
        );
      if (url.includes("api.stripe.com")) {
        charged++;
        assert(
          new Headers(init?.headers).get("Idempotency-Key") ===
            `checkout:${attempt}`,
        );
        const params = new URLSearchParams(String(init?.body));
        assert(params.get("line_items[0][price_data][unit_amount]") === "500");
        assert(params.get("line_items[0][price_data][currency]") === "usd");
        assert(params.get("metadata[test_flow]") === "accion-operator");
        assert(params.get("metadata[fan_id]") === fan);
        assert(params.get("metadata[item_slug]") === "accion-wallpaper");
        assert(
          params
            .get("success_url")
            ?.startsWith("http://localhost:5173/?checkout=return#status="),
        );
        assert(
          params
            .get("cancel_url")
            ?.startsWith("http://localhost:5173/?checkout=cancel#status="),
        );
        return Promise.resolve(
          json({
            id: "cs_test_mock",
            url: "https://checkout.stripe.com/test",
            livemode: false,
          }),
        );
      }
      return Promise.resolve(json(null));
    };
    try {
      await denied(() =>
        createCheckout(req, { ...body, operatorTestToken: undefined }),
      );
      await denied(() =>
        createCheckout(req, { ...body, itemSlug: "cafe-studio" }),
      );
      await denied(() => createCheckout(req, { ...body, itemSlug: "unknown" }));
      await denied(() => createCheckout(req, { ...body, purpose: "tip" }));
      assert(charged === 0);
      const result = await createCheckout(req, body);
      assert(result.url === "https://checkout.stripe.com/test");
      assert(Number(charged) === 1 && signed === 1);
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  "unpaid status and revoked entitlements never return a download; paid access can refresh a signed URL",
  async () => {
    setup();
    const original = fetch;
    let completed = false,
      active = false,
      signing = 0;
    const attempt = crypto.randomUUID(),
      purchase = crypto.randomUUID();
    globalThis.fetch = (input) => {
      const url = String(input);
      if (url.includes("/checkout_attempts"))
        return Promise.resolve(
          json({
            id: attempt,
            status: completed ? "completed" : "pending_payment",
            purpose: "vault_unlock",
            item_slug: "accion-wallpaper",
            amount_minor: 500,
            currency: "usd",
          }),
        );
      if (url.includes("/purchases"))
        return Promise.resolve(
          json({
            id: purchase,
            fan_id: "fan",
            status: "paid",
            vault_item_slug: "accion-wallpaper",
          }),
        );
      if (url.includes("/vault_unlocks"))
        return Promise.resolve(json(active ? { id: "unlock" } : null));
      if (url.includes("/storage/")) {
        signing++;
        return Promise.resolve(json({ signedURL: "/object/sign/mock" }));
      }
      return Promise.resolve(json(null));
    };
    try {
      const statusToken = await token("status", attempt, 300);
      assert(!(await checkoutStatus(req, { token: statusToken })).accessToken);
      await denied(() => redeemVault(req, { token: statusToken }));
      completed = true;
      const paid = await checkoutStatus(req, { token: statusToken });
      assert(paid.accessToken);
      await denied(() => redeemVault(req, { token: paid.accessToken }));
      assert(signing === 0);
      active = true;
      assert(
        (await redeemVault(req, { token: paid.accessToken })).links.length ===
          1,
      );
      assert(Number(signing) === 1);
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  "signed Stripe event fulfills only canonical paid session; unpaid and failed sessions do not fulfill",
  async () => {
    setup();
    const original = fetch;
    let payment = "unpaid",
      mode: boolean | undefined = false,
      fulfills = 0;
    globalThis.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("api.stripe.com"))
        return Promise.resolve(
          json({
            id: "cs_test_mock",
            livemode: mode,
            payment_status: payment,
            payment_intent: "pi_test",
            amount_total: 500,
            currency: "usd",
            metadata: { artist_id: "jona-ferreira", attempt_id: "attempt" },
          }),
        );
      if (url.includes("/rpc/fulfill_checkout")) {
        fulfills++;
        const body = JSON.parse(String(init?.body));
        assert(body.p_amount === 500 && body.p_session === "cs_test_mock");
        return Promise.resolve(json("purchase"));
      }
      return Promise.resolve(json(null));
    };
    try {
      for (const type of [
        "checkout.session.completed",
        "checkout.session.async_payment_failed",
        "checkout.session.async_payment_succeeded",
      ]) {
        if (type.endsWith("succeeded")) payment = "paid";
        const event = {
          id: `evt_${type}`,
          type,
          livemode: false,
          data: {
            object: {
              id: "cs_test_mock",
              payment_status: "paid",
              metadata: { artist_id: "jona-ferreira" },
            },
          },
        };
        assert(
          (await stripeWebhook(await webhookRequest(event))).status === 200,
        );
        assert(fulfills === (payment === "paid" ? 1 : 0));
      }
      for (mode of [true, undefined]) {
        const response = await stripeWebhook(
          await webhookRequest({
            id: "evt_wrong_canonical_mode",
            type: "checkout.session.completed",
            livemode: false,
            data: {
              object: {
                id: "cs_test_mock",
                metadata: { artist_id: "jona-ferreira" },
              },
            },
          }),
        );
        assert(response.status === 503 && fulfills === 1);
      }
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  "signed live or missing event modes cannot reach Stripe or financial RPCs",
  async () => {
    setup();
    const original = fetch;
    let requests = 0;
    globalThis.fetch = () => {
      requests++;
      throw new Error("network forbidden");
    };
    try {
      for (const livemode of [true, undefined]) {
        const response = await stripeWebhook(
          await webhookRequest({
            id: "evt_wrong_mode",
            type: "checkout.session.completed",
            livemode,
            data: {
              object: {
                id: "cs_test_mock",
                metadata: { artist_id: "jona-ferreira" },
              },
            },
          }),
        );
        assert(response.status === 400);
      }
      assert(requests === 0);
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  "refund handling requires test-mode charge and PaymentIntent before its RPC",
  async () => {
    setup();
    const original = fetch;
    let chargeMode: boolean | undefined = true,
      paymentMode: boolean | undefined = false,
      refunds = 0;
    globalThis.fetch = (input) => {
      const url = String(input);
      if (url.includes("/v1/charges/"))
        return Promise.resolve(
          json({
            livemode: chargeMode,
            payment_intent: "pi_test",
            refunded: true,
          }),
        );
      if (url.includes("/v1/payment_intents/"))
        return Promise.resolve(
          json({
            livemode: paymentMode,
            metadata: { artist_id: "jona-ferreira" },
          }),
        );
      if (url.includes("/rpc/refund_purchase")) {
        refunds++;
        return Promise.resolve(json(null));
      }
      throw new Error("unexpected mocked request");
    };
    try {
      for (const [charge, payment] of [
        [true, false],
        [undefined, false],
        [false, true],
        [false, undefined],
        [false, false],
      ]) {
        chargeMode = charge;
        paymentMode = payment;
        const response = await stripeWebhook(
          await webhookRequest({
            id: "evt_refund_mode",
            type: "charge.refunded",
            livemode: false,
            data: { object: { id: "ch_test" } },
          }),
        );
        assert(
          response.status ===
            (charge === false && payment === false ? 200 : 503),
        );
      }
      assert(refunds === 1);
    } finally {
      globalThis.fetch = original;
    }
  },
);

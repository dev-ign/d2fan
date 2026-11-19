import { authorizePaymentTest } from "../functions/_shared/payment-test.ts";
import {
  createCheckout,
  checkoutStatus,
  redeemVault,
} from "../functions/_shared/handlers.ts";
import { signToken } from "../functions/_shared/security.ts";
import { token } from "../functions/_shared/platform.ts";
import { stripe } from "../functions/_shared/payments.ts";
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
    STRIPE_PAYMENT_MODE: "test",
    STRIPE_ACCOUNT_ID: "acct_mock",
    SUPPORT_ENABLED: "true",
    COMMERCE_ENABLED: "false",
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
  "test checkout rejects wrong-mode, missing and ambiguous keys before any network or attempt write",
  async () => {
    setup();
    const original = fetch;
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
            guestToken: crypto.randomUUID(),
            requestId: crypto.randomUUID(),
            purpose: "tip",
            amountMinor: 500,
          });
        } catch (error) {
          code = error instanceof Error ? error.message : "";
        }
        assert(code === "payment_configuration");
        assert(
          (
            await stripeWebhook(
              new Request("http://localhost", { method: "POST", body: "{}" }),
            )
          ).status === 503,
        );
      }
      assert(requests === 0);
      for (const key of ["sk_test_mock", "rk_test_mock", "rkcs_test_mock"]) {
        Deno.env.set("STRIPE_SECRET_KEY", key);
        assert(stripe());
      }
      Deno.env.set("STRIPE_PAYMENT_MODE", "live");
      for (const key of ["rkcs_test_mock", "rkcs_live_mock"]) {
        Deno.env.set("STRIPE_SECRET_KEY", key);
        await denied(() => Promise.resolve(stripe()));
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
            payment_mode: "test",
            stripe_account_id: "acct_mock",
            guest_token_hash: null,
            stripe_session_id: null,
            checkout_url: null,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          }),
        );
      if (url.endsWith("/v1/account"))
        return Promise.resolve(json({ id: "acct_mock" }));
      if (url.includes("/checkout/sessions")) {
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
            mode: "payment",
            client_reference_id: attempt,
            amount_total: 500,
            currency: "usd",
          }),
        );
      }
      if (url.includes("/checkout_attempts") && init?.method === "PATCH")
        return Promise.resolve(json({ id: attempt }));
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

function guestPaymentFixture(live = false) {
  const id = crypto.randomUUID();
  const sessionId = `cs_${live ? "live" : "test"}_mock`;
  const metadata = {
    artist_id: "jona-ferreira",
    attempt_id: id,
    purpose: "tip",
  };
  const intent = {
    id: "pi_guest",
    livemode: live,
    amount: 500,
    amount_received: 500,
    currency: "usd",
    status: "succeeded",
    metadata,
  };
  return {
    attempt: {
      id,
      stripe_session_id: sessionId,
      amount_minor: 500,
      currency: "usd",
      fan_id: null,
      item_slug: null,
      purpose: "tip",
      payment_mode: live ? "live" : "test",
      stripe_account_id: "acct_mock",
    },
    session: {
      id: sessionId,
      client_reference_id: id,
      amount_total: 500,
      currency: "usd",
      livemode: live,
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      payment_intent: intent,
      metadata,
    },
    intent,
  };
}

Deno.test(
  "verified guest webhook uses canonical payment, amount, intent and attempt mode",
  async () => {
    setup();
    const original = fetch;
    const { attempt, session } = guestPaymentFixture(true);
    Deno.env.set("STRIPE_PAYMENT_MODE", "live");
    Deno.env.set("STRIPE_SECRET_KEY", "sk_live_fixture");
    Deno.env.set("SUPPORT_ENABLED", "false"); // Previously issued sessions are still processed.
    const fulfilled = new Set<string>();
    let writes = 0;
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/account")
        return Promise.resolve(json({ id: "acct_mock" }));
      if (url.pathname.includes("/v1/checkout/sessions/"))
        return Promise.resolve(json(session));
      if (url.pathname === "/rest/v1/checkout_attempts") {
        if (init?.method === "PATCH") {
          writes++;
          assert(JSON.parse(String(init?.body)).status === "failed");
          return Promise.resolve(json(null));
        }
        return Promise.resolve(json(attempt));
      }
      if (url.pathname === "/rest/v1/rpc/fulfill_checkout") {
        const row = JSON.parse(String(init?.body));
        assert(
          row.p_amount === 500 &&
            row.p_session === session.id &&
            row.p_intent === "pi_guest" &&
            row.p_attempt === attempt.id,
        );
        fulfilled.add(row.p_event);
        return Promise.resolve(json("purchase"));
      }
      throw new Error(`unexpected test route ${url.pathname}`);
    };
    const send = async (type: string) =>
      stripeWebhook(
        await webhookRequest({
          id: `evt_${type}`,
          type,
          livemode: true,
          data: {
            object: {
              id: session.id,
              payment_status: "paid",
              metadata: session.metadata,
            },
          },
        }),
      );
    try {
      session.payment_status = "unpaid";
      assert(
        (await send("checkout.session.completed")).status === 200 &&
          fulfilled.size === 0,
      );
      assert(
        (await send("checkout.session.async_payment_failed")).status === 200 &&
          writes === 1 &&
          fulfilled.size === 0,
      );
      session.payment_status = "paid";
      for (const change of [
        { target: session, key: "livemode", value: false },
        { target: session, key: "amount_total", value: 999 },
        { target: session, key: "currency", value: "eur" },
        { target: session.metadata, key: "purpose", value: "vault_unlock" },
        { target: session.payment_intent, key: "amount_received", value: 499 },
        { target: attempt, key: "payment_mode", value: "test" },
        { target: attempt, key: "stripe_account_id", value: "acct_wrong" },
        { target: attempt, key: "stripe_session_id", value: "cs_live_other" },
      ]) {
        const target = change.target as Record<string, unknown>;
        const original = target[change.key];
        target[change.key] = change.value;
        assert(
          (await send("checkout.session.async_payment_succeeded")).status ===
            503 && fulfilled.size === 0,
        );
        target[change.key] = original;
      }
      assert(
        (await send("checkout.session.async_payment_succeeded")).status === 200,
      );
      assert(
        (await send("checkout.session.async_payment_succeeded")).status === 200,
      );
      assert(Number(fulfilled.size) === 1);
    } finally {
      globalThis.fetch = original;
      setup();
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
  "guest refund verifies canonical charge, intent and Session before its RPC",
  async () => {
    setup();
    const original = fetch;
    const { attempt, session, intent } = guestPaymentFixture();
    let chargeMode: boolean | undefined = true;
    let refunds = 0;
    let wrongIntent = false;
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/account")
        return Promise.resolve(json({ id: "acct_mock" }));
      if (url.pathname.startsWith("/v1/charges/"))
        return Promise.resolve(
          json({
            livemode: chargeMode,
            payment_intent: wrongIntent
              ? { ...intent, id: "pi_other" }
              : intent,
            amount: 500,
            amount_refunded: 500,
            currency: "usd",
            refunded: true,
          }),
        );
      if (url.pathname.startsWith("/v1/checkout/sessions/"))
        return Promise.resolve(json(session));
      if (url.pathname === "/rest/v1/checkout_attempts")
        return Promise.resolve(json(attempt));
      if (url.pathname === "/rest/v1/rpc/refund_purchase") {
        const body = JSON.parse(String(init?.body));
        assert(body.p_intent === "pi_guest" && body.p_full === true);
        refunds++;
        return Promise.resolve(json(null));
      }
      throw new Error(`unexpected test route ${url.pathname}`);
    };
    const send = async () =>
      stripeWebhook(
        await webhookRequest({
          id: "evt_guest_refund",
          type: "charge.refunded",
          livemode: false,
          data: { object: { id: "ch_guest" } },
        }),
      );
    try {
      assert((await send()).status === 503);
      chargeMode = undefined;
      assert((await send()).status === 503);
      chargeMode = false;
      intent.livemode = true;
      assert((await send()).status === 503);
      intent.livemode = false;
      wrongIntent = true;
      assert((await send()).status === 503 && refunds === 0);
      wrongIntent = false;
      assert((await send()).status === 200 && Number(refunds) === 1);
    } finally {
      globalThis.fetch = original;
    }
  },
);

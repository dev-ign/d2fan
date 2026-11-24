import {
  captureFan,
  createCheckout,
  checkoutStatus,
  redeemVault,
  recoverAccess,
  deliverLeadMagnet,
} from "../functions/_shared/handlers.ts";
import { token, endpoint, rpc } from "../functions/_shared/platform.ts";
import {
  digest,
  signToken,
  verifyToken,
} from "../functions/_shared/security.ts";
import { checkoutRequest } from "../functions/create-checkout/index.ts";
const secret = "a-long-local-only-test-secret-with-32-characters";
for (const [name, value] of Object.entries({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "service-test",
  ACCESS_TOKEN_SECRET: secret,
  RATE_LIMIT_SALT: secret,
  ALLOWED_ORIGINS: "http://localhost:5173",
  PUBLIC_SITE_URL: "http://localhost:5173",
  STRIPE_SECRET_KEY: "sk_test_local_only",
  STRIPE_PAYMENT_MODE: "test",
  STRIPE_ACCOUNT_ID: "acct_mock",
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
  "La Cultura signs both objects for its captured request and preserves legacy reward links",
  async () => {
    const previous = Deno.env.get("PRIVATE_FILE_PATHS");
    const original = fetch;
    const fanId = crypto.randomUUID(),
      requestId = crypto.randomUUID();
    const paths: string[] = [];
    let jobReward = "la_cultura_wallpapers",
      desktopMissing = false;
    Deno.env.set(
      "PRIVATE_FILE_PATHS",
      JSON.stringify({
        "lead-magnet": "legacy.jpg",
        "la-cultura-mobile": "mobile.jpg",
        "la-cultura-desktop": "desktop.jpg",
      }),
    );
    globalThis.fetch = (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/rpc/check_rate"))
        return Promise.resolve(Response.json(true));
      if (url.pathname.endsWith("/rpc/capture_fan_with_reward")) {
        const payload = JSON.parse(String(init?.body));
        assert(
          payload.p_reward_id === "la_cultura_wallpapers" &&
            payload.p_opt_in === false,
        );
        return Promise.resolve(Response.json(fanId));
      }
      if (url.pathname.endsWith("/delivery_jobs")) {
        assert(url.searchParams.get("fan_id") === `eq.${fanId}`);
        assert(
          url.searchParams.get("dedupe_key") === `eq.capture:${requestId}`,
        );
        return Promise.resolve(
          Response.json({ payload: { rewardId: jobReward } }),
        );
      }
      if (url.pathname.includes("/storage/v1/object/sign/")) {
        const asset = url.pathname.split("/").at(-1)!;
        paths.push(asset);
        assert(JSON.parse(String(init?.body)).expiresIn === 300);
        if (asset === "desktop.jpg" && desktopMissing)
          return Promise.resolve(
            Response.json({ message: "Object not found" }, { status: 400 }),
          );
        return Promise.resolve(
          Response.json({ signedURL: `/object/sign/${asset}` }),
        );
      }
      throw new Error("unexpected fixture request");
    };
    const req = new Request("https://preview.example.com");
    try {
      const body = {
        requestId,
        email: "fan@example.com",
        language: "en",
        source: "stay_close",
        emailMarketing: false,
        analyticsConsent: false,
        rewardId: "la_cultura_wallpapers",
      };
      await rejects(
        () => captureFan(req, { ...body, source: "support_modal" }),
        "invalid_request",
      );
      const result = await captureFan(req, body);
      assert(!result.magnetUrl && result.rewardId === "la_cultura_wallpapers");
      assert(
        result.wallpaperLinks?.map((link) => link.device).join(",") ===
          "mobile,desktop",
      );
      desktopMissing = true;
      assert(!(await captureFan(req, body)).wallpaperLinks);
      desktopMissing = false;

      const legacy = await deliverLeadMagnet(req, {
        token: await token("reward", fanId, 300),
      });
      assert(legacy.links[0].url.includes("legacy.jpg"));
      const packToken = await token("reward", fanId, 300, undefined, requestId);
      const redeemed = await deliverLeadMagnet(req, { token: packToken });
      assert(redeemed.links.length === 2);
      jobReward = "";
      const beforeDenials = paths.length;
      await rejects(
        () => deliverLeadMagnet(req, { token: packToken }),
        "unauthorized",
      );
      const expired = await token("reward", fanId, -1, undefined, requestId);
      await rejects(
        () => deliverLeadMagnet(req, { token: expired }),
        "unauthorized",
      );
      await rejects(
        () => deliverLeadMagnet(req, { token: "unsigned" }),
        "unauthorized",
      );
      assert(paths.length === beforeDenials);
    } finally {
      globalThis.fetch = original;
      if (previous === undefined) Deno.env.delete("PRIVATE_FILE_PATHS");
      else Deno.env.set("PRIVATE_FILE_PATHS", previous);
    }
  },
);
Deno.test(
  "Stage A checkout denies direct calls before any network or writes",
  async () => {
    const previous = Deno.env.get("COMMERCE_ENABLED");
    const previousSupport = Deno.env.get("SUPPORT_ENABLED");
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = () => {
      calls++;
      throw new Error(
        "disabled checkout must not access a provider or database",
      );
    };
    try {
      for (const flag of [undefined, "false", "TRUE"]) {
        for (const key of ["COMMERCE_ENABLED", "SUPPORT_ENABLED"]) {
          if (flag === undefined) Deno.env.delete(key);
          else Deno.env.set(key, flag);
        }
        for (const purpose of ["tip", "vault_unlock"]) {
          const response = await checkoutRequest(
            new Request("http://localhost/create-checkout", {
              method: "POST",
              headers: { origin: "http://localhost:5173" },
              body: JSON.stringify({
                purpose,
                operatorTestToken: "cannot-bypass-stage-a",
                captureToken: "capture",
              }),
            }),
          );
          assert(response.status === 503);
          assert(response.headers.get("Cache-Control") === "no-store");
          const result = await response.json();
          assert(
            result.success === false &&
              result.error.code === "commerce_disabled" &&
              result.error.retryable === false,
          );
        }
      }
      Deno.env.set("COMMERCE_ENABLED", "true");
      const enabled = await checkoutRequest(
        new Request("http://localhost/create-checkout", {
          headers: { origin: "http://localhost:5173" },
        }),
      );
      assert(enabled.status === 405); // Delegates to the preserved endpoint policy.
      assert(calls === 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (previous === undefined) Deno.env.delete("COMMERCE_ENABLED");
      else Deno.env.set("COMMERCE_ENABLED", previous);
      if (previousSupport === undefined) Deno.env.delete("SUPPORT_ENABLED");
      else Deno.env.set("SUPPORT_ENABLED", previousSupport);
    }
  },
);
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
    Deno.env.set("SUPPORT_ENABLED", "true");
    Deno.env.set("COMMERCE_ENABLED", "true");
    try {
      await rejects(
        () =>
          createCheckout(req, {
            requestId: crypto.randomUUID(),
            guestToken: crypto.randomUUID(),
            purpose: "tip",
            amountMinor: 499,
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
    } finally {
      Deno.env.delete("SUPPORT_ENABLED");
      Deno.env.delete("COMMERCE_ENABLED");
    }
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
  "capture endpoint preserves replay identity and returns the exact fingerprint conflict contract",
  async () => {
    const original = globalThis.fetch;
    const fan = crypto.randomUUID();
    const body = {
      requestId: crypto.randomUUID(),
      email: " FAN@example.invalid ",
      language: "en",
      source: "support_modal",
      emailMarketing: true,
      analyticsConsent: false,
      code: "P0001",
      message: "request_conflict",
    };
    let fingerprint = "",
      captures = 0,
      lookups = 0;
    const handler = endpoint(captureFan);
    const post = (value: unknown) =>
      handler(
        new Request("http://localhost/capture-fan", {
          method: "POST",
          headers: { origin: "http://localhost:5173" },
          body: JSON.stringify(value),
        }),
      );
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/rpc/check_rate")) return Response.json(true);
      if (url.includes("/rpc/capture_fan")) {
        const args = JSON.parse(String(init?.body));
        assert(args.p_email === "fan@example.invalid");
        assert(args.p_request === body.requestId);
        captures++;
        if (fingerprint && fingerprint !== args.p_fingerprint)
          return Response.json(
            {
              code: "P0001",
              message: "request_conflict",
              details: null,
              hint: null,
            },
            { status: 400 },
          );
        fingerprint = args.p_fingerprint;
        return Response.json(fan);
      }
      assert(
        url.includes("/delivery_jobs") &&
          (!init?.method || init.method === "GET"),
      );
      lookups++;
      return Response.json(null);
    };
    try {
      for (const email of [body.email, "fan@example.invalid"]) {
        const response = await post({ ...body, email });
        assert(response.status === 200);
        const result = await response.json();
        assert(
          result.success && result.data.eventId === `capture:${body.requestId}`,
        );
        assert(
          (
            await verifyToken(
              result.data.captureToken,
              "capture",
              "jona-ferreira",
              secret,
            )
          ).sub === fan,
        );
      }
      const lookupsBeforeConflict = lookups;
      const response = await post({ ...body, emailMarketing: false });
      const result = await response.json();
      assert(response.status === 400 && !result.success);
      assert(result.error.code === "request_conflict");
      assert(Object.keys(result).join() === "success,error");
      assert(
        Object.keys(result.error).sort().join() === "code,message,retryable",
      );
      assert(
        captures === 3 && lookups === lookupsBeforeConflict,
        "conflict continued after the failed RPC",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "RPC conflict translation is capture-only, exact and sanitized at the endpoint boundary",
  async (t) => {
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const logs: string[] = [];
    const sensitive = "private-database-detail-do-not-expose";
    const cases = [
      {
        name: "capture conflict",
        rpc: "capture_fan",
        code: "P0001",
        message: "request_conflict",
        status: 400,
      },
      {
        name: "database unavailable",
        rpc: "capture_fan",
        code: "PGRST000",
        message: sensitive,
        status: 503,
      },
      {
        name: "unrelated exception",
        rpc: "capture_fan",
        code: "P0001",
        message: sensitive,
        status: 503,
      },
      {
        name: "wrong SQLSTATE",
        rpc: "capture_fan",
        code: "23505",
        message: "request_conflict",
        status: 503,
      },
      {
        name: "missing SQLSTATE",
        rpc: "capture_fan",
        message: "request_conflict",
        status: 503,
      },
      {
        name: "message substring",
        rpc: "capture_fan",
        code: "P0001",
        message: `${sensitive}: request_conflict`,
        status: 503,
      },
      {
        name: "consent exception",
        rpc: "update_email_consent",
        code: "P0001",
        message: "request_conflict",
        status: 503,
      },
      {
        name: "rate exception",
        rpc: "check_rate",
        code: "P0001",
        message: "request_conflict",
        status: 503,
      },
    ];
    console.error = (...args: unknown[]) => logs.push(JSON.stringify(args));
    try {
      for (const scenario of cases) {
        await t.step(scenario.name, async () => {
          globalThis.fetch = (input) => {
            const name = new URL(String(input)).pathname.split("/").pop();
            if (name === "check_rate" && scenario.rpc !== "check_rate")
              return Promise.resolve(Response.json(true));
            assert(name === scenario.rpc);
            return Promise.resolve(
              Response.json(
                {
                  code: scenario.code,
                  message: scenario.message,
                  details: sensitive,
                  hint: sensitive,
                },
                { status: 400 },
              ),
            );
          };
          const response = await endpoint(async () => rpc(scenario.rpc, {}))(
            new Request("http://localhost/capture-fan", {
              method: "POST",
              headers: { origin: "http://localhost:5173" },
              body: JSON.stringify({
                code: "P0001",
                message: "request_conflict",
              }),
            }),
          );
          const raw = await response.text();
          const result = JSON.parse(raw);
          assert(response.status === scenario.status && !result.success);
          assert(
            result.error.code ===
              (scenario.status === 400 ? "request_conflict" : "unavailable"),
          );
          assert(!raw.includes(sensitive) && !raw.includes("P0001"));
        });
      }
      assert(!logs.join().includes(sensitive));
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  },
);
Deno.test(
  "capture rejects client error-like fields without bypassing validation or invoking capture RPC",
  async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (input) => {
      assert(String(input).includes("/rpc/check_rate"));
      calls++;
      return Promise.resolve(Response.json(true));
    };
    try {
      for (const [body, code] of [
        [
          {
            email: "request_conflict",
            code: "P0001",
            message: "request_conflict",
          },
          "invalid_email",
        ],
        [
          {
            email: "fan@example.invalid",
            requestId: "request_conflict",
            error: { code: "P0001", message: "request_conflict" },
          },
          "invalid_request",
        ],
        [[], "invalid_request"],
      ] as const) {
        const response = await endpoint(captureFan)(
          new Request("http://localhost/capture-fan", {
            method: "POST",
            headers: { origin: "http://localhost:5173" },
            body: JSON.stringify(body),
          }),
        );
        assert(
          response.status === 400 &&
            (await response.json()).error.code === code,
        );
      }
      assert(calls === 3);
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "guest checkout uses the existing adapters without fan data and binds retries and status",
  async () => {
    const original = globalThis.fetch;
    let requestId = crypto.randomUUID();
    const guestToken = crypto.randomUUID();
    const body = { requestId, guestToken, purpose: "tip", amountMinor: 1525 };
    const req = new Request("http://localhost");
    let attempt: Record<string, unknown> | undefined;
    let creates = 0;
    let merchant = "acct_mock";
    let live = false;
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), {
        headers: { "Content-Type": "application/json" },
      });
    globalThis.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      if (url.href === "https://api.stripe.com/v1/account")
        return json({ id: merchant });
      if (url.href === "https://api.stripe.com/v1/checkout/sessions") {
        creates++;
        const form = new URLSearchParams(String(init?.body));
        assert(
          new Headers(init?.headers).get("Idempotency-Key") ===
            `checkout:${requestId}`,
        );
        assert(
          form.get("integration_identifier") ===
            "jona-d2fan-support-prjxwdha" &&
            form.get("mode") === "payment" &&
            form.get("metadata[purpose]") === "tip",
        );
        assert(form.get("line_items[0][price_data][unit_amount]") === "1525");
        assert(form.get("line_items[0][price_data][currency]") === "usd");
        assert(!form.has("customer_email") && !form.has("metadata[fan_id]"));
        assert(form.get("payment_method_types[0]") === (live ? "card" : null));
        assert(!form.has("payment_method_types[1]"));
        assert(
          form.get("adaptive_pricing[enabled]") === (live ? "false" : null),
        );
        const site = live
          ? "https://jonaferreira.com"
          : "http://localhost:5173";
        assert(
          form
            .get("success_url")
            ?.startsWith(`${site}/?checkout=return#status=`),
        );
        assert(
          form
            .get("cancel_url")
            ?.startsWith(`${site}/?checkout=cancel#status=`),
        );
        return json({
          id: live ? "cs_live_mock" : "cs_test_mock",
          livemode: live,
          mode: "payment",
          client_reference_id: requestId,
          amount_total: 1525,
          currency: "usd",
          url: "https://checkout.stripe.com/test",
        });
      }
      if (url.pathname === "/rest/v1/checkout_attempts") {
        if (method === "POST") {
          attempt ??= {
            ...JSON.parse(String(init?.body)),
            status: "draft",
            checkout_url: null,
            stripe_session_id: null,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          };
          return json(null);
        }
        if (method === "PATCH") {
          Object.assign(attempt!, JSON.parse(String(init?.body)));
          return json({ id: requestId });
        }
        return json(attempt);
      }
      if (url.pathname === "/rest/v1/purchases")
        return json({ id: "opaque-purchase", status: "paid" });
      throw new Error(`unexpected test request ${url.pathname}`);
    };
    try {
      Deno.env.set("SUPPORT_ENABLED", "true");
      Deno.env.set("COMMERCE_ENABLED", "false");
      await rejects(
        () => createCheckout(req, { ...body, purpose: "vault_unlock" }),
        "commerce_disabled",
      );
      await rejects(
        () => createCheckout(req, { ...body, currency: "eur" }),
        "invalid_request",
      );
      await rejects(
        () => createCheckout(req, { ...body, itemSlug: "accion-wallpaper" }),
        "invalid_request",
      );
      await rejects(
        () => createCheckout(req, { ...body, amountMinor: 100001 }),
        "invalid_amount",
      );
      assert(!attempt && creates === 0);
      merchant = "acct_wrong";
      await rejects(() => createCheckout(req, body), "payment_configuration");
      assert(!attempt && creates === 0);
      merchant = "acct_mock";
      const created = await createCheckout(req, body);
      const replay = await createCheckout(req, body);
      assert(
        Number(creates) === 1 &&
          created.url === replay.url &&
          created.statusToken === replay.statusToken,
      );
      assert(attempt && typeof attempt === "object");
      const stored = attempt as Record<string, unknown>;
      assert(
        stored.fan_id === null &&
          stored.item_slug === null &&
          stored.analytics_consent === false,
      );
      assert(
        stored.payment_mode === "test" &&
          stored.stripe_account_id === "acct_mock",
      );
      assert(stored.guest_token_hash === (await digest(guestToken)));
      await rejects(
        () => createCheckout(req, { ...body, guestToken: crypto.randomUUID() }),
        "request_conflict",
      );
      await rejects(
        () => createCheckout(req, { ...body, amountMinor: 500 }),
        "request_conflict",
      );
      for (const supplied of [requestId, guestToken, created.statusToken + "x"])
        await rejects(
          () => checkoutStatus(req, { token: supplied }),
          "unauthorized",
        );
      const pending = await checkoutStatus(req, { token: created.statusToken });
      assert(
        pending.status === "pending_payment" &&
          pending.checkoutUrl === created.url &&
          !pending.accessToken,
      );
      Deno.env.set("SUPPORT_ENABLED", "false");
      await rejects(() => createCheckout(req, body), "commerce_disabled");
      assert(
        !(await checkoutStatus(req, { token: created.statusToken }))
          .checkoutUrl,
      );
      stored.status = "completed";
      const paid = await checkoutStatus(req, { token: created.statusToken });
      assert(
        paid.status === "completed" &&
          paid.delivery === "disabled" &&
          !paid.accessToken,
      );

      live = true;
      attempt = undefined;
      requestId = crypto.randomUUID();
      Deno.env.set("STRIPE_PAYMENT_MODE", "live");
      Deno.env.set("STRIPE_SECRET_KEY", "sk_live_local_only");
      Deno.env.set("PUBLIC_SITE_URL", "https://jonaferreira.com");
      Deno.env.set("SUPPORT_ENABLED", "true");
      await createCheckout(req, { ...body, requestId });
      assert(Number(creates) === 2);
    } finally {
      globalThis.fetch = original;
      Deno.env.delete("SUPPORT_ENABLED");
      Deno.env.delete("COMMERCE_ENABLED");
      Deno.env.set("STRIPE_PAYMENT_MODE", "test");
      Deno.env.set("STRIPE_SECRET_KEY", "sk_test_local_only");
      Deno.env.set("PUBLIC_SITE_URL", "http://localhost:5173");
    }
  },
);

Deno.test(
  "capture dispatches only its fresh requested job and preserves rewards on uncertain delivery",
  async () => {
    const settings = {
      EMAIL_DELIVERY_ENABLED: "true",
      EMAIL_PROVIDER_API_KEY: "re_mock",
      EMAIL_FROM_ADDRESS: "music@jonaferreira.com",
      SUPPORT_EMAIL: "support@example.com",
      PUBLIC_SITE_URL: "https://example.com",
      EMAIL_MARKETING_ENABLED: "false",
      BUSINESS_POSTAL_ADDRESS: "",
      PRIVATE_FILE_PATHS: '{"lead-magnet":"reward.jpg"}',
    };
    const previous = new Map(
      Object.keys(settings).map((name) => [name, Deno.env.get(name)]),
    );
    for (const [name, value] of Object.entries(settings))
      Deno.env.set(name, value);
    const original = fetch,
      id = crypto.randomUUID();
    let attempts = 0,
      dispatches = 0,
      response: "sent" | "ambiguous" | "legacy" = "sent";
    globalThis.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("/rpc/check_rate"))
        return Promise.resolve(Response.json(true));
      if (url.includes("/rpc/capture_fan"))
        return Promise.resolve(Response.json("canonical-fan"));
      if (url.includes("/storage/v1/object/sign/"))
        return Promise.resolve(
          Response.json({ signedURL: "/object/sign/reward" }),
        );
      if (url.includes("/delivery_jobs"))
        return Promise.resolve(
          Response.json({
            id,
            attempts,
            status: "pending",
            email_policy_version: 1,
          }),
        );
      if (url.endsWith("/functions/v1/scheduled-messaging")) {
        dispatches++;
        assert(init?.method === "POST");
        assert(
          new Headers(init.headers).get("authorization") === `Bearer ${secret}`,
        );
        const body = JSON.parse(String(init.body));
        assert(
          body.operation === "dispatch_job" &&
            body.jobId === id &&
            Object.keys(body).length === 2,
        );
        if (response === "ambiguous")
          return Promise.reject(new Error("unavailable"));
        return Promise.resolve(
          Response.json(
            response === "sent"
              ? { success: true, data: { sent: 1 } }
              : { success: false, error: { code: "invalid_request" } },
            { status: response === "legacy" ? 400 : 200 },
          ),
        );
      }
      throw new Error("unexpected request");
    };
    const body = {
      requestId: crypto.randomUUID(),
      email: "fan@example.com",
      language: "en",
      source: "stay_close",
      emailMarketing: true,
      analyticsConsent: false,
    };
    try {
      const sent = await captureFan(new Request("https://capture"), body);
      assert(sent.delivery === "sent" && sent.magnetUrl && dispatches === 1);
      for (const outcome of ["ambiguous", "legacy"] as const) {
        response = outcome;
        const result = await captureFan(new Request("https://capture"), body);
        assert(result.delivery === "unknown" && result.magnetUrl);
      }
      const sentRequests = dispatches;
      attempts = 1;
      assert(
        (await captureFan(new Request("https://capture"), body)).delivery ===
          "queued",
      );
      assert(
        dispatches === sentRequests,
        "a replay must not retry a provider attempt",
      );
      attempts = 0;
      Deno.env.set("EMAIL_DELIVERY_ENABLED", "false");
      assert(
        (await captureFan(new Request("https://capture"), body)).delivery ===
          "disabled",
      );
      assert(
        dispatches === sentRequests,
        "disabled delivery must not invoke a worker",
      );
    } finally {
      globalThis.fetch = original;
      for (const [name, value] of previous) {
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      }
    }
  },
);
Deno.test(
  "capture replay and purchase email status use scoped evidence without withholding downloads",
  async () => {
    const settings = {
      EMAIL_DELIVERY_ENABLED: "true",
      EMAIL_PROVIDER_API_KEY: "re_mock",
      EMAIL_FROM_ADDRESS: "music@jonaferreira.com",
      SUPPORT_EMAIL: "support@example.com",
      PUBLIC_SITE_URL: "https://example.com",
      PRIVATE_FILE_PATHS: '{"lead-magnet":"rewards/accion-wallpaper.jpg"}',
    };
    const previous = new Map(
      Object.keys(settings).map((name) => [name, Deno.env.get(name)]),
    );
    for (const [name, value] of Object.entries(settings))
      Deno.env.set(name, value);
    const original = fetch,
      req = new Request("http://localhost"),
      statusToken = await token("status", "attempt", 300);
    const captureRequest = {
      requestId: crypto.randomUUID(),
      email: "fan@example.com",
      language: "en",
      source: "stay_close",
      emailMarketing: true,
      analyticsConsent: false,
      firstTouch: { release: "accion" },
      lastTouch: { release: "accion" },
    };
    let fingerprint = "";
    let job: Record<string, unknown> | null = null,
      queryFails = false;
    globalThis.fetch = (input, init) => {
      const url = String(input);
      if (url.includes("/rpc/check_rate"))
        return Promise.resolve(Response.json(true));
      if (url.includes("/rpc/capture_fan")) {
        const body = JSON.parse(String(init?.body));
        assert(
          body.p_request === captureRequest.requestId &&
            body.p_artist === "jona-ferreira" &&
            body.p_opt_in === true,
        );
        assert(
          body.p_first.release === "accion" && body.p_last.release === "accion",
        );
        if (fingerprint) assert(body.p_fingerprint === fingerprint);
        fingerprint = body.p_fingerprint;
        return Promise.resolve(Response.json("canonical-fan"));
      }
      if (url.includes("/storage/v1/object/sign/"))
        return Promise.resolve(
          Response.json({ signedURL: "/object/sign/reward" }),
        );
      assert(
        !init?.method || init.method === "GET",
        "status must be read-only",
      );
      if (url.includes("/checkout_attempts"))
        return Promise.resolve(
          Response.json({
            status: "completed",
            amount_minor: 500,
            currency: "usd",
            purpose: "vault_unlock",
          }),
        );
      if (url.includes("/purchases"))
        return Promise.resolve(
          Response.json({ id: "purchase", status: "paid" }),
        );
      if (url.includes("/delivery_jobs")) {
        const params = new URL(url).searchParams;
        if (params.get("dedupe_key")?.startsWith("eq.capture:")) {
          assert(Boolean(fingerprint));
          assert(
            params.get("dedupe_key") ===
              `eq.capture:${captureRequest.requestId}`,
          );
          assert(
            params.get("artist_id") === "eq.jona-ferreira" &&
              params.get("fan_id") === "eq.canonical-fan" &&
              params.get("kind") === "eq.capture",
          );
          assert(
            params.get("select") ===
              "id,attempts,status,provider_id,sent_at,quarantined_at,email_policy_version",
          );
        }
        return Promise.resolve(
          Response.json(queryFails ? { message: "unavailable" } : job, {
            status: queryFails ? 503 : 200,
          }),
        );
      }
      throw new Error("unexpected mocked request");
    };
    try {
      const cases = [
        [null, "unknown"],
        [{ status: "pending", email_policy_version: 1 }, "queued"],
        [{ status: "processing", email_policy_version: 1 }, "queued"],
        [{ status: "pending", email_policy_version: 0 }, "unknown"],
        [{ status: "sent" }, "unknown"],
        [{ status: "sent", provider_id: "receipt" }, "unknown"],
        [
          {
            status: "sent",
            provider_id: "receipt",
            sent_at: new Date().toISOString(),
          },
          "sent",
        ],
        [{ status: "failed" }, "failed"],
        [
          { status: "failed", quarantined_at: new Date().toISOString() },
          "quarantined",
        ],
        [{ status: "skipped" }, "skipped"],
      ] as const;
      for (const [row, expected] of cases) {
        job = row;
        const result = await checkoutStatus(req, { token: statusToken });
        assert(result.delivery === expected && result.accessToken);
        const captured = await captureFan(req, captureRequest);
        assert(captured.delivery === expected && captured.magnetUrl);
        assert(
          Object.keys(captured).every((key) =>
            [
              "measurementToken",
              "captureToken",
              "eventId",
              "delivery",
              "magnetUrl",
            ].includes(key),
          ),
        );
      }
      Deno.env.set("EMAIL_DELIVERY_ENABLED", "false");
      job = { status: "pending", email_policy_version: 1 };
      assert(
        (await checkoutStatus(req, { token: statusToken })).delivery ===
          "disabled",
      );
      assert((await captureFan(req, captureRequest)).delivery === "disabled");
      queryFails = true;
      const result = await checkoutStatus(req, { token: statusToken });
      assert(result.delivery === "unknown" && result.accessToken);
      const captured = await captureFan(req, captureRequest);
      assert(captured.delivery === "unknown" && captured.magnetUrl);
      let recoveryCalls = 0;
      globalThis.fetch = () => {
        recoveryCalls++;
        throw new Error("disabled recovery must not query or queue");
      };
      const known = await recoverAccess(req, { email: "fan@example.com" });
      const unknown = await recoverAccess(req, {
        email: "unknown@example.com",
      });
      assert(
        JSON.stringify(known) === JSON.stringify(unknown) &&
          known.delivery === "disabled" &&
          recoveryCalls === 0,
      );
      Deno.env.set("EMAIL_DELIVERY_ENABLED", "true");
      let knownFan = true,
        queued = 0;
      globalThis.fetch = (input) => {
        const url = String(input);
        if (url.includes("/rpc/check_rate"))
          return Promise.resolve(Response.json(true));
        if (url.includes("/fans"))
          return Promise.resolve(
            Response.json(knownFan ? { id: "fan" } : null),
          );
        if (url.includes("/delivery_jobs")) {
          queued++;
          return Promise.resolve(Response.json(null));
        }
        throw new Error("unexpected mocked request");
      };
      const requested = await recoverAccess(req, { email: "fan@example.com" });
      knownFan = false;
      const absent = await recoverAccess(req, { email: "unknown@example.com" });
      assert(
        JSON.stringify(requested) === JSON.stringify(absent) &&
          requested.delivery === "requested" &&
          queued === 1,
      );
    } finally {
      globalThis.fetch = original;
      for (const [name, value] of previous) {
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      }
    }
  },
);

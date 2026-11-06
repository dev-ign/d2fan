import {
  canDispatch,
  classifyEmail,
  EmailConfigurationError,
  readEmailConfig,
  retryWindowMs,
} from "../functions/_shared/email-policy.ts";
import {
  EmailProviderError,
  sendResendEmail,
  type OutgoingEmail,
} from "../functions/_shared/resend.ts";
import {
  deliverEmailJob,
  messagingRequest,
  runMessaging,
} from "../functions/_shared/messaging.ts";
import type { EmailJob, EmailStore } from "../functions/_shared/email-store.ts";
import { template } from "../functions/_shared/templates.ts";
import { signToken, verifyToken } from "../functions/_shared/security.ts";
import { endpoint } from "../functions/_shared/platform.ts";
import { manageConsent } from "../functions/_shared/handlers.ts";
import { emailWorker } from "../functions/scheduled-messaging/index.ts";

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(fn: () => unknown | Promise<unknown>, code?: string) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error);
    if (code) assert(error.message === code, `${error.message} != ${code}`);
    return error;
  }
  throw new Error("expected rejection");
}
const now = Date.now(),
  secret = "email-test-only-signing-key-with-at-least-32-characters";
const settings: Record<string, string> = {
  EMAIL_PROVIDER_API_KEY: "re_test_only",
  EMAIL_FROM_ADDRESS: "Jona <music@jonaferreira.com>",
  SUPPORT_EMAIL: "support@example.com",
  PUBLIC_SITE_URL: "https://jonaferreira.com",
  ACCESS_TOKEN_SECRET: secret,
  EMAIL_DELIVERY_ENABLED: "true",
  EMAIL_MARKETING_ENABLED: "false",
  BUSINESS_POSTAL_ADDRESS: "",
};
const get = (name: string) => settings[name];
Deno.test(
  "read-only revision handshake requires worker authorization and never reaches database or provider",
  async () => {
    Deno.env.set("SCHEDULER_SECRET", secret);
    const original = fetch;
    globalThis.fetch = () => Promise.reject(new Error("network forbidden"));
    try {
      const denied = await emailWorker(
        new Request("https://worker", { method: "GET" }),
      );
      assert(denied.status === 401);
      const accepted = await emailWorker(
        new Request("https://worker", {
          method: "GET",
          headers: { authorization: `Bearer ${secret}` },
        }),
      );
      const body = await accepted.json();
      assert(
        accepted.status === 200 &&
          body.emailSafetyRevision === "20261027202242" &&
          body.sending === false,
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
const outgoing: OutgoingEmail = {
  from: settings.EMAIL_FROM_ADDRESS,
  to: ["owner@example.com"],
  reply_to: settings.SUPPORT_EMAIL,
  subject: "Requested access",
  text: "Only the requested access.",
};
function job(overrides: Partial<EmailJob> = {}): EmailJob {
  return {
    id: crypto.randomUUID(),
    fan_id: "fan",
    kind: "capture",
    dedupe_key: "capture:stable",
    attempts: 1,
    created_at: new Date(now - 7 * 86400_000).toISOString(),
    payload: { magnet: true },
    lease_token: crypto.randomUUID(),
    lease_until: new Date(now + 120_000).toISOString(),
    email_policy_version: 1,
    first_provider_attempt_at: null,
    retry_deadline_at: null,
    email_links_expire_at: null,
    ...overrides,
  };
}
function harness(overrides: Partial<EmailStore> = {}) {
  const calls: { type: string; [key: string]: unknown }[] = [];
  const store: EmailStore = {
    async claim(id, marketing) {
      calls.push({ type: "claim", id, marketing });
      return [];
    },
    async begin(j, body, expires, marketing) {
      calls.push({ type: "begin", body, expires, marketing });
      return {
        ...j,
        payload: { ...j.payload, emailBody: body },
        first_provider_attempt_at: new Date(now).toISOString(),
        retry_deadline_at: new Date(now + retryWindowMs).toISOString(),
        email_links_expire_at: expires,
      };
    },
    async finish(j, outcome, provider, error) {
      calls.push({ type: "finish", outcome, provider, error, id: j.id });
      return true;
    },
    async fan() {
      calls.push({ type: "fan" });
      return {
        email_normalized: "owner@example.com",
        preferred_language: "es",
      };
    },
    async permission() {
      return true;
    },
    async purchases() {
      return [
        {
          id: "purchase",
          purpose: "vault_unlock",
          status: "paid",
          amount_minor: 500,
          currency: "usd",
          vault_item_slug: "accion-wallpaper",
        },
      ];
    },
    async reminderEligible() {
      return true;
    },
    async createTest() {
      calls.push({ type: "create" });
      return "one-job";
    },
    async maintenance(marketing) {
      calls.push({ type: "maintenance", marketing });
    },
    ...overrides,
  };
  const deps = {
    store,
    get,
    now: () => now,
    sign: async (scope: string, _sub: string, ttl: number, issued?: number) => {
      calls.push({ type: "sign", scope, ttl, issued });
      return "signed-test-capability";
    },
    rewardReady: async () => {},
    send: async (body: OutgoingEmail, _key: string, dedupe: string) => {
      calls.push({ type: "send", body, dedupe });
      return "provider-id";
    },
  };
  return { calls, store, deps };
}

Deno.test(
  "configuration separates transactionals, marketing, sender domain, support, postal and HTTPS",
  async () => {
    const config = readEmailConfig(get);
    assert(
      !config.marketingReady &&
        config.marketingBlock === "BUSINESS_POSTAL_ADDRESS",
    );
    for (const field of [
      "EMAIL_PROVIDER_API_KEY",
      "EMAIL_FROM_ADDRESS",
      "SUPPORT_EMAIL",
      "PUBLIC_SITE_URL",
      "ACCESS_TOKEN_SECRET",
    ]) {
      const error = await rejects(
        () => readEmailConfig((name) => (name === field ? "" : get(name))),
        "email_configuration",
      );
      assert(
        error instanceof EmailConfigurationError &&
          error.fields.includes(field),
      );
    }
    for (const from of [
      "music@evil.example",
      "music@sub.jonaferreira.com",
      "music@jonaferreira.com\r\nBcc: x@example.com",
    ])
      await rejects(
        () =>
          readEmailConfig((name) =>
            name === "EMAIL_FROM_ADDRESS" ? from : get(name),
          ),
        "email_configuration",
      );
    await rejects(
      () =>
        readEmailConfig((name) =>
          name === "PUBLIC_SITE_URL" ? "http://localhost:5173" : get(name),
        ),
      "email_configuration",
    );
    const enabled = readEmailConfig(
      (name) =>
        ({
          EMAIL_MARKETING_ENABLED: "true",
          BUSINESS_POSTAL_ADDRESS: "123 Artist Street, Tampa FL 33601",
        })[name] || get(name),
    );
    assert(enabled.marketingReady);
  },
);
Deno.test(
  "classification does not treat arbitrary signup as transactional",
  async () => {
    assert(classifyEmail("capture", { magnet: true }) === "transactional");
    assert(
      classifyEmail("capture", { confirm: true }) === "permission_request",
    );
    assert(
      classifyEmail("welcome", {}) === "marketing" &&
        classifyEmail("reminder", {}) === "marketing",
    );
    assert(classifyEmail("purchase", {}) === "transactional");
    await rejects(() => classifyEmail("capture", {}), "unsupported_email");
    await rejects(() => classifyEmail("newsletter", {}), "unsupported_email");
  },
);
Deno.test(
  "EN/ES confirmation-only copy never promises a reward and unknown templates fail closed",
  async () => {
    for (const lang of ["en", "es"]) {
      const confirmation = template(
        "capture",
        lang,
        ["confirmation-link"],
        "support@example.com",
        { confirm: true },
      );
      assert(
        !/exclusive|exclusivo|wallpaper/i.test(
          confirmation.subject + confirmation.text,
        ),
      );
      assert(
        confirmation.text.includes(
          lang === "es"
            ? "No se incluye ninguna descarga"
            : "No download is included",
        ),
      );
      const reward = template(
        "capture",
        lang,
        ["reward-link"],
        "support@example.com",
        { magnet: true },
      );
      assert(
        reward.text.includes("48") &&
          !reward.text.includes("confirmation-link"),
      );
      assert(
        template(
          "transactional_test",
          lang,
          [],
          "support@example.com",
        ).text.includes(
          lang === "es" ? "no te suscribe" : "does not subscribe",
        ),
      );
    }
    await rejects(
      () => template("unknown", "en", [], "support@example.com"),
      "unsupported_email",
    );
  },
);
Deno.test(
  "absolute dispatch deadline excludes the 30-second boundary and invalid/extended clocks",
  () => {
    const first = new Date(now).toISOString(),
      deadline = new Date(now + retryWindowMs).toISOString();
    assert(canDispatch(first, deadline, now));
    assert(canDispatch(first, deadline, now + retryWindowMs - 30_001));
    assert(!canDispatch(first, deadline, now + retryWindowMs - 30_000));
    assert(!canDispatch(first, deadline, now + 24 * 3600_000));
    assert(!canDispatch(null, null, now));
    assert(
      !canDispatch(first, new Date(now + retryWindowMs + 1).toISOString(), now),
    );
    assert(!canDispatch(first, deadline, now - 1));
  },
);
Deno.test(
  "Resend request freezes JSON, Bearer auth, reply routing and stable idempotency header",
  async () => {
    const requests: RequestInit[] = [];
    const mock: typeof fetch = async (url, init) => {
      assert(url === "https://api.resend.com/emails");
      requests.push(init!);
      return Response.json({ id: "provider-id" });
    };
    await sendResendEmail(outgoing, "re_private_test", "stable-key", mock);
    const reordered = Object.fromEntries(
      Object.entries(outgoing).reverse(),
    ) as unknown as OutgoingEmail;
    await sendResendEmail(reordered, "re_private_test", "stable-key", mock);
    assert(
      requests[0].body === requests[1].body &&
        requests[0].body === JSON.stringify(outgoing),
    );
    const headers = new Headers(requests[0].headers);
    assert(
      headers.get("Authorization") === "Bearer re_private_test" &&
        headers.get("Idempotency-Key") === "stable-key",
    );
    assert(
      headers.get("Content-Type") === "application/json" &&
        requests[0].method === "POST" &&
        !!requests[0].signal,
    );
  },
);
Deno.test(
  "authentication/validation errors stop; transient, concurrent, timeout and malformed acceptance stay ambiguous",
  async () => {
    for (const status of [400, 401, 403, 408, 409, 422, 429, 500]) {
      const error = await rejects(() =>
        sendResendEmail(
          outgoing,
          "re_test",
          "key",
          async () => new Response("private provider detail", { status }),
        ),
      );
      assert(
        error instanceof EmailProviderError &&
          error.retryable === [408, 409, 429, 500].includes(status),
      );
      assert(!error.message.includes("private provider detail"));
    }
    for (const response of [
      new Response("not json"),
      Response.json({}),
      Response.json({ id: "" }),
    ]) {
      const error = await rejects(() =>
        sendResendEmail(outgoing, "re_test", "key", async () => response),
      );
      assert(
        error instanceof EmailProviderError &&
          error.retryable &&
          error.code === "provider_ambiguous",
      );
    }
    const timeout = await rejects(() =>
      sendResendEmail(outgoing, "re_test", "key", () =>
        Promise.reject(new DOMException("private", "TimeoutError")),
      ),
    );
    assert(
      timeout instanceof EmailProviderError &&
        timeout.code === "provider_ambiguous",
    );
  },
);
Deno.test(
  "ordinary worker configuration blocks before queue claims or maintenance",
  async () => {
    const h = harness();
    await rejects(
      () =>
        runMessaging({
          ...h.deps,
          get: (name) =>
            name === "EMAIL_DELIVERY_ENABLED" ? "false" : get(name),
        }),
      "email_configuration",
    );
    assert(h.calls.length === 0);
    await rejects(
      () =>
        runMessaging({
          ...h.deps,
          get: (name) => (name === "SUPPORT_EMAIL" ? "" : get(name)),
        }),
      "email_configuration",
    );
    assert(h.calls.length === 0);
    await runMessaging(h.deps);
    assert(
      h.calls.some(
        (c) => c.type === "claim" && c.id === null && c.marketing === false,
      ),
    );
    assert(
      h.calls.some((c) => c.type === "maintenance" && c.marketing === false),
    );
  },
);
Deno.test(
  "new requested reward uses fresh database issuance, no marketing consent or postal, then records acceptance",
  async () => {
    const h = harness();
    assert(
      (await deliverEmailJob(job(), readEmailConfig(get), h.deps)) === "sent",
    );
    const sign = h.calls.find((c) => c.type === "sign")!;
    assert(sign.issued === Math.floor(now / 1000) && sign.ttl === 172800);
    assert(
      h.calls.findIndex((c) => c.type === "begin") <
        h.calls.findIndex((c) => c.type === "send"),
    );
    const body = h.calls.find((c) => c.type === "send")!.body as OutgoingEmail;
    assert(
      body.reply_to === settings.SUPPORT_EMAIL && body.text.includes("48"),
    );
  },
);
Deno.test(
  "frozen retry never regenerates links or changes key/body",
  async () => {
    const h = harness();
    const j = job({
      payload: { magnet: true, emailBody: outgoing },
      email_links_expire_at: new Date(now + 86400_000).toISOString(),
    });
    assert((await deliverEmailJob(j, readEmailConfig(get), h.deps)) === "sent");
    assert(!h.calls.some((c) => c.type === "sign"));
    assert(h.calls.find((c) => c.type === "send")!.body === outgoing);
    assert(h.calls.find((c) => c.type === "send")!.dedupe === "capture:stable");
  },
);
Deno.test(
  "legacy backlog, lost leases, expired links and deadline refuse provider requests",
  async () => {
    for (const variant of [
      job({ email_policy_version: 0 }),
      job({ lease_until: new Date(now - 1).toISOString() }),
    ]) {
      const h = harness();
      await deliverEmailJob(variant, readEmailConfig(get), h.deps);
      assert(!h.calls.some((c) => c.type === "send"));
    }
    for (const override of [
      null,
      job({
        first_provider_attempt_at: new Date(now - retryWindowMs).toISOString(),
        retry_deadline_at: new Date(now).toISOString(),
      }),
      job({
        first_provider_attempt_at: new Date(now).toISOString(),
        retry_deadline_at: new Date(now + retryWindowMs).toISOString(),
        lease_until: new Date(now + 120000).toISOString(),
      }),
    ]) {
      const h = harness({
        async begin() {
          return override;
        },
      });
      const j = job({
        payload: { magnet: true, emailBody: outgoing },
        email_links_expire_at: new Date(now - 1).toISOString(),
      });
      await deliverEmailJob(j, readEmailConfig(get), h.deps);
      assert(!h.calls.some((c) => c.type === "send"));
    }
  },
);
Deno.test(
  "missing postal or withdrawn permission skips marketing even after queue/body freeze",
  async () => {
    const j = job({
      kind: "welcome",
      payload: { emailBody: outgoing },
      email_links_expire_at: new Date(now + 86400_000).toISOString(),
    });
    const h = harness();
    await deliverEmailJob(j, readEmailConfig(get), h.deps);
    assert(!h.calls.some((c) => c.type === "send"));
    const config = readEmailConfig(
      (name) =>
        ({
          EMAIL_MARKETING_ENABLED: "true",
          BUSINESS_POSTAL_ADDRESS: "123 Artist Street, Tampa FL 33601",
        })[name] || get(name),
    );
    const withdrawn = harness({
      async permission() {
        return false;
      },
    });
    await deliverEmailJob(j, config, withdrawn.deps);
    assert(!withdrawn.calls.some((c) => c.type === "send"));
    let checks = 0;
    const race = harness({
      async permission() {
        return ++checks === 1;
      },
    });
    const fresh = job({ kind: "welcome", payload: {} });
    await deliverEmailJob(fresh, config, race.deps);
    assert(checks === 2 && !race.calls.some((c) => c.type === "send"));
  },
);
Deno.test(
  "full refund skips a frozen purchase email; provider auth stops while ambiguous persistence retries",
  async () => {
    const refund = harness({
      async purchases() {
        return [];
      },
    });
    await deliverEmailJob(
      job({ kind: "purchase", payload: { emailBody: outgoing } }),
      readEmailConfig(get),
      refund.deps,
    );
    assert(!refund.calls.some((c) => c.type === "send"));
    for (const retryable of [false, true]) {
      const h = harness();
      await deliverEmailJob(job(), readEmailConfig(get), {
        ...h.deps,
        send: () =>
          Promise.reject(
            new EmailProviderError(
              retryable ? "provider_ambiguous" : "provider_authentication",
              retryable,
            ),
          ),
      });
      assert(
        h.calls.some(
          (c) =>
            c.type === "finish" &&
            c.outcome === (retryable ? "retry" : "failed"),
        ),
      );
    }
    const h = harness();
    let finishes = 0;
    const result = await deliverEmailJob(job(), readEmailConfig(get), {
      ...h.deps,
      store: {
        ...h.store,
        async finish(j, outcome, provider, error) {
          if (++finishes === 1) throw new Error("database_unavailable");
          return h.store.finish(j, outcome, provider, error);
        },
      },
    });
    assert(result === "failed" && h.calls.some((c) => c.outcome === "retry"));
  },
);
Deno.test(
  "controlled preview has zero writes/sends; exact allowlist, pinned run and explicit send switch are mandatory",
  async () => {
    const run = crypto.randomUUID(),
      h = harness();
    const testGet = (name: string) =>
      ({ EMAIL_TEST_RUN_ID: run, EMAIL_TEST_RECIPIENT: "owner@example.com" })[
        name
      ] || get(name);
    const request = {
      operation: "controlled_test_preview",
      runId: run,
      recipient: "owner@example.com",
      language: "es",
    };
    await messagingRequest(new Request("https://worker"), request, {
      ...h.deps,
      get: testGet,
    });
    assert(h.calls.length === 0);
    await rejects(
      () =>
        messagingRequest(
          new Request("https://worker"),
          { ...request, recipient: "other@example.com" },
          { ...h.deps, get: testGet },
        ),
      "email_configuration",
    );
    await rejects(
      () =>
        messagingRequest(
          new Request("https://worker"),
          { ...request, runId: crypto.randomUUID() },
          { ...h.deps, get: testGet },
        ),
      "invalid_request",
    );
    await rejects(
      () =>
        messagingRequest(
          new Request("https://worker"),
          { ...request, operation: "controlled_test_send" },
          { ...h.deps, get: testGet },
        ),
      "email_configuration",
    );
    assert(h.calls.length === 0);
    await messagingRequest(
      new Request("https://worker"),
      { ...request, operation: "controlled_test_send" },
      {
        ...h.deps,
        get: (name) =>
          name === "EMAIL_TEST_SEND_ENABLED" ? "true" : testGet(name),
      },
    );
    assert(
      h.calls.some(
        (c) =>
          c.type === "claim" && c.id === "one-job" && c.marketing === false,
      ),
    );
    assert(
      !h.calls.some((c) => ["fan", "maintenance", "send"].includes(c.type)),
    );
  },
);
Deno.test(
  "worker authorization and missing config return explicit safe errors without side effects",
  async () => {
    Deno.env.set("SCHEDULER_SECRET", secret);
    const h = harness();
    const handler = endpoint(
      (req, body) =>
        messagingRequest(req, body, {
          ...h.deps,
          get: (name) => (name === "SUPPORT_EMAIL" ? "" : get(name)),
        }),
      { worker: true },
    );
    const req = (auth: string) =>
      new Request("https://worker", {
        method: "POST",
        headers: { authorization: auth },
        body: "{}",
      });
    assert((await handler(req("Bearer invalid"))).status === 401);
    const response = await handler(req(`Bearer ${secret}`)),
      body = await response.json();
    assert(
      response.status === 503 &&
        body.error.code === "email_configuration" &&
        body.error.configurationFields.includes("SUPPORT_EMAIL"),
    );
    assert(
      !JSON.stringify(body).includes("re_test_only") && h.calls.length === 0,
    );
  },
);
Deno.test(
  "confirmation and unsubscribe handlers require scoped explicit action and refuse older confirmations after revocation",
  async () => {
    Deno.env.set("SUPABASE_URL", "https://database.invalid");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "dummy");
    Deno.env.set("ACCESS_TOKEN_SECRET", secret);
    const original = fetch;
    let revoked = false;
    const updates: string[] = [];
    globalThis.fetch = (input, init) => {
      if (String(input).includes("consent_records"))
        return Promise.resolve(
          Response.json(revoked ? [{ id: "revoked" }] : []),
        );
      if (String(input).includes("rpc/update_email_consent")) {
        const b = JSON.parse(String(init?.body));
        updates.push(b.p_status);
        revoked = b.p_status === "revoked";
        return Promise.resolve(Response.json(null));
      }
      return Promise.reject(new Error("unexpected mocked request"));
    };
    const claims = {
      sub: "fan",
      artist: "jona-ferreira",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 172800,
    };
    try {
      const confirm = await signToken({ ...claims, scope: "confirm" }, secret),
        unsubscribe = await signToken(
          { ...claims, scope: "unsubscribe" },
          secret,
        );
      await manageConsent(new Request("https://worker"), {
        action: "confirm",
        token: confirm,
      });
      await manageConsent(new Request("https://worker"), {
        action: "unsubscribe",
        token: unsubscribe,
      });
      await rejects(
        () =>
          manageConsent(new Request("https://worker"), {
            action: "confirm",
            token: confirm,
          }),
        "unauthorized",
      );
      await rejects(
        () =>
          manageConsent(new Request("https://worker"), {
            action: "confirm",
            token: unsubscribe,
          }),
        "unauthorized",
      );
      assert(updates.join(",") === "granted,revoked");
      const expired = await signToken(
        { ...claims, scope: "access", exp: 1 },
        secret,
      );
      await rejects(
        () => verifyToken(expired, "access", "jona-ferreira", secret),
        "unauthorized",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  "controlled send targets only its pinned test job and never loads or changes a fan",
  async () => {
    const run = crypto.randomUUID();
    const selected = job({
      fan_id: null,
      kind: "transactional_test",
      payload: {
        recipient: "owner@example.com",
        language: "es",
        ownerRunId: run,
      },
    });
    const h = harness({
      async createTest() {
        return selected.id;
      },
      async claim(id, marketing) {
        assert(id === selected.id && !marketing);
        return [selected];
      },
      async fan() {
        throw new Error("fan access forbidden");
      },
    });
    const testSettings: Record<string, string> = {
      EMAIL_TEST_RUN_ID: run,
      EMAIL_TEST_RECIPIENT: "owner@example.com",
      EMAIL_TEST_SEND_ENABLED: "true",
    };
    await messagingRequest(
      new Request("https://worker"),
      {
        operation: "controlled_test_send",
        runId: run,
        recipient: "owner@example.com",
        language: "es",
      },
      { ...h.deps, get: (name) => testSettings[name] || get(name) },
    );
    const sends = h.calls.filter((call) => call.type === "send");
    assert(
      sends.length === 1 &&
        (sends[0].body as OutgoingEmail).to.join() === "owner@example.com",
    );
    assert(!h.calls.some((call) => call.type === "maintenance"));
  },
);
Deno.test(
  "provider adapter rejects extra recipients and hidden Bcc before HTTP",
  async () => {
    let requests = 0;
    const mock: typeof fetch = () => {
      requests++;
      return Promise.resolve(Response.json({ id: "provider" }));
    };
    for (const body of [
      { ...outgoing, to: ["owner@example.com", "other@example.com"] },
      { ...outgoing, bcc: ["other@example.com"] },
      { ...outgoing, to: ["<owner@example.com>"] },
    ])
      await rejects(() => sendResendEmail(body, "re_test", "stable", mock));
    assert(requests === 0);
  },
);
Deno.test(
  "a delayed permission check cannot dispatch after the retry or lease deadline",
  async () => {
    let clock = now,
      checks = 0;
    const h = harness({
      async permission() {
        if (++checks === 2) clock = now + retryWindowMs;
        return true;
      },
    });
    const marketingSettings: Record<string, string> = {
      EMAIL_MARKETING_ENABLED: "true",
      BUSINESS_POSTAL_ADDRESS: "123 Artist Street, Tampa FL 33601",
    };
    await deliverEmailJob(
      job({ kind: "welcome", payload: {} }),
      readEmailConfig((name) => marketingSettings[name] || get(name)),
      { ...h.deps, now: () => clock },
    );
    assert(checks === 2 && !h.calls.some((call) => call.type === "send"));
  },
);
Deno.test(
  "queued confirmation preserves the request time instead of refreshing consent after withdrawal",
  async () => {
    const h = harness();
    const requested = now - 3600_000;
    await deliverEmailJob(
      job({
        payload: { confirm: true },
        created_at: new Date(requested).toISOString(),
      }),
      readEmailConfig(get),
      h.deps,
    );
    assert(
      h.calls.some(
        (call) =>
          call.type === "sign" &&
          call.scope === "confirm" &&
          call.issued === Math.floor(requested / 1000),
      ),
    );
    const old = harness({
      async begin(_job, _body, expires) {
        assert(Date.parse(expires) < now);
        return null;
      },
    });
    await deliverEmailJob(
      job({ payload: { confirm: true } }),
      readEmailConfig(get),
      old.deps,
    );
    assert(!old.calls.some((call) => call.type === "send"));
  },
);

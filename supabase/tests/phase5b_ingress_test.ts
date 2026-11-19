import { phase5bIngress } from "../ops/phase5b_ingress.ts";
import {
  signToken,
  digest,
  type Claims,
} from "../functions/_shared/security.ts";
import { limited } from "../functions/_shared/platform.ts";

const secret = "synthetic-ingress-proof-secret-at-least-32-characters";
const salt = "synthetic-ingress-salt";
const origin = "https://operator.invalid";
for (const [name, value] of Object.entries({
  ACCESS_TOKEN_SECRET: secret,
  RATE_LIMIT_SALT: salt,
  ALLOWED_ORIGINS: origin,
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
}))
  Deno.env.set(name, value);

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const options = () => ({
  endpoint: "capture-fan" as const,
  nonce: crypto.randomUUID(),
  expiresAt: Math.floor(Date.now() / 1000) + 300,
});
async function proof(
  operation: ReturnType<typeof options>,
  changes: Partial<Claims> = {},
) {
  const iat = Math.floor(Date.now() / 1000);
  return signToken(
    {
      scope: "operator_test",
      sub: `phase5b-ingress:${operation.endpoint}:${operation.nonce}`,
      actionId: operation.nonce,
      artist: "jona-ferreira",
      iat,
      exp: iat + 30,
      ...changes,
    },
    secret,
  );
}
function request(
  operation: ReturnType<typeof options>,
  token?: string,
  forwarded?: string,
) {
  return new Request(
    `https://runtime.invalid/internal/capture-fan?phase5b-ingress=${operation.nonce}`,
    {
      method: "POST",
      headers: {
        origin,
        ...(token ? { "x-phase5b-proof": token } : {}),
        ...(forwarded === undefined ? {} : { "x-forwarded-for": forwarded }),
      },
      body: "not-json: must never be parsed",
    },
  );
}
const forbidden = async () => {
  throw new Error("normal application path must not run");
};

Deno.test(
  "ingress diagnostic uses actual Request inputs and matches the real production limiter",
  async () => {
    const original = globalThis.fetch;
    let calls = 0,
      rateKey = "";
    globalThis.fetch = (_input, init) => {
      calls++;
      const args = JSON.parse(String(init?.body));
      assert(args.p_limit === 20);
      rateKey = args.p_key;
      return Promise.resolve(Response.json(true));
    };
    try {
      for (const forwarded of [
        " 203.0.113.7 , 10.0.0.2",
        undefined,
        " , 10.0.0.2",
      ]) {
        const operation = options();
        const req = request(operation, await proof(operation), forwarded);
        const before = calls;
        const response = await phase5bIngress(forbidden, operation)(req);
        assert(response.status === 200 && calls === before);
        const raw = await response.text(),
          value = JSON.parse(raw);
        assert(value.runtimePathname === new URL(req.url).pathname);
        assert(
          value.operation === operation.nonce &&
            value.endpoint === operation.endpoint,
        );
        assert(
          value.ipSource ===
            (forwarded?.trim().startsWith("203") ? "forwarded" : "fallback"),
        );
        assert(
          !raw.includes("203.0.113.7") &&
            !raw.includes(salt) &&
            !raw.includes(secret),
        );
        assert(response.headers.get("cache-control") === "no-store");
        await limited(req, new URL(req.url).pathname);
        assert(value.key === rateKey);
        const ip = forwarded?.split(",")[0]?.trim() || "unknown";
        assert(value.ipFingerprint === (await digest(`${salt}:${ip}`)));
      }
    } finally {
      globalThis.fetch = original;
    }
  },
);

Deno.test(
  "ingress diagnostic rejects invalid authorization without body parsing, RPCs or logs",
  async () => {
    const originalFetch = globalThis.fetch,
      originalError = console.error;
    let calls = 0;
    globalThis.fetch = () => {
      calls++;
      return Promise.reject(new Error("RPC forbidden"));
    };
    console.error = () => {
      calls++;
    };
    try {
      const operation = options();
      const iat = Math.floor(Date.now() / 1000);
      for (const changes of [
        { scope: "capture" as const },
        { artist: "other-artist" },
        { sub: `phase5b-ingress:manage-consent:${operation.nonce}` },
        { actionId: crypto.randomUUID() },
        { iat: iat - 60, exp: iat - 30 },
        { exp: iat + 31 },
        { iat: iat + 10, exp: iat + 20 },
      ]) {
        const response = await phase5bIngress(
          forbidden,
          operation,
        )(request(operation, await proof(operation, changes)));
        assert(
          response.status === 401 &&
            (await response.text()) === '{"error":"diagnostic_unavailable"}',
        );
      }
      for (const token of [undefined, "forged-proof"])
        assert(
          (
            await phase5bIngress(
              forbidden,
              operation,
            )(request(operation, token))
          ).status === 401,
        );
      const expiredOperation = { ...operation, expiresAt: iat };
      assert(
        (
          await phase5bIngress(
            forbidden,
            expiredOperation,
          )(request(operation, await proof(operation)))
        ).status === 401,
      );
      const req = request(operation, await proof(operation));
      req.headers.set("origin", "https://foreign.invalid");
      assert((await phase5bIngress(forbidden, operation)(req)).status === 401);
      assert(calls === 0);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
    }
  },
);

Deno.test(
  "ingress proof is single-use within one isolate including concurrent replay",
  async () => {
    const operation = options(),
      token = await proof(operation);
    const handler = phase5bIngress(forbidden, operation);
    const responses = await Promise.all([
      handler(request(operation, token)),
      handler(request(operation, token)),
    ]);
    assert(
      responses
        .map((r) => r.status)
        .sort()
        .join() === "200,401",
    );
    assert((await handler(request(operation, token))).status === 401);
  },
);

Deno.test(
  "ordinary traffic delegates unchanged and proof without the operation marker is denied",
  async () => {
    const operation = options();
    const req = new Request("https://runtime.invalid/internal/capture-fan", {
      method: "POST",
      body: "{}",
    });
    let calls = 0;
    const normal = async (actual: Request) => {
      assert(actual === req);
      calls++;
      return new Response("normal", { status: 202 });
    };
    const handler = phase5bIngress(normal, operation);
    assert((await handler(req)).status === 202 && calls === 1);
    const unexpected = new Request(req.url, {
      method: "POST",
      headers: { origin, "x-phase5b-proof": await proof(operation) },
    });
    assert((await handler(unexpected)).status === 401 && calls === 1);
  },
);

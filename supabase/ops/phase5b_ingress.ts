// Operational-only wrapper. Production entry points do not import this module.
import { catalog, env } from "../functions/_shared/platform.ts";
import { digest, verifyToken } from "../functions/_shared/security.ts";

export function phase5bIngress(
  normal: (req: Request) => Promise<Response>,
  operation: {
    endpoint: "capture-fan" | "manage-consent";
    nonce: string;
    expiresAt: number;
  },
) {
  let used = false;
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const proof = req.headers.get("x-phase5b-proof");
    if (!url.searchParams.has("phase5b-ingress") && proof === null)
      return normal(req);
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    };
    try {
      const now = Date.now() / 1000;
      if (
        req.method !== "POST" ||
        url.searchParams.get("phase5b-ingress") !== operation.nonce ||
        !req.headers.get("origin") ||
        !env("ALLOWED_ORIGINS")
          .split(",")
          .includes(req.headers.get("origin")!) ||
        !Number.isSafeInteger(operation.expiresAt) ||
        now >= operation.expiresAt
      )
        throw new Error();
      // Reuse the existing scoped HMAC verifier. No new secret/auth framework.
      const claims = await verifyToken(
        proof,
        "operator_test",
        catalog.artistId,
        env("ACCESS_TOKEN_SECRET"),
      );
      if (
        claims.sub !==
          `phase5b-ingress:${operation.endpoint}:${operation.nonce}` ||
        claims.actionId !== operation.nonce ||
        !Number.isFinite(claims.iat) ||
        !Number.isFinite(claims.exp) ||
        claims.iat > now ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 30 ||
        claims.exp > operation.expiresAt ||
        used
      )
        throw new Error();
      // Per-isolate replay fence; the operator runner separately caps attempts.
      // Do not claim distributed one-time consumption without durable state.
      used = true;
      const forwarded = req.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim();
      const ip = forwarded || "unknown";
      const salt = env("RATE_LIMIT_SALT");
      return new Response(
        JSON.stringify({
          operation: operation.nonce,
          endpoint: operation.endpoint,
          runtimePathname: url.pathname,
          ipSource: forwarded ? "forwarded" : "fallback",
          ipFingerprint: await digest(`${salt}:${ip}`),
          key: await digest(`${salt}:${url.pathname}:${ip}`),
        }),
        { headers },
      );
    } catch {
      // No provider errors, inputs, tokens, paths or IPs reach logs/denials.
      return new Response('{"error":"diagnostic_unavailable"}', {
        status: 401,
        headers,
      });
    }
  };
}

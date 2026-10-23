import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import Stripe from "npm:stripe@22.0.0";
import catalog from "../../shared/catalog.json" with { type: "json" };
import { signToken, verifyToken, digest } from "./security.ts";
import type { Claims } from "./security.ts";
export { catalog, digest };
export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error("not_configured");
  return v;
}
export function db() {
  return createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SB_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export function stripe() {
  return new Stripe(env("STRIPE_SECRET_KEY"), {
    httpClient: Stripe.createFetchHttpClient(),
  });
}
export function site() {
  return new URL(env("PUBLIC_SITE_URL")).origin;
}
export async function token(
  scope: Claims["scope"],
  sub: string,
  seconds: number,
  issued = Math.floor(Date.now() / 1000),
  actionId?: string,
) {
  return signToken(
    {
      scope,
      actionId,
      sub,
      artist: catalog.artistId,
      iat: issued,
      exp: issued + seconds,
    },
    env("ACCESS_TOKEN_SECRET"),
  );
}
export function verify(value: unknown, scope: Claims["scope"]) {
  return verifyToken(
    value,
    scope,
    catalog.artistId,
    env("ACCESS_TOKEN_SECRET"),
  );
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error("database_unavailable");
  return data as T;
}
export async function signedFile(slug: string) {
  const paths = JSON.parse(
    Deno.env.get("PRIVATE_FILE_PATHS") || "{}",
  ) as Record<string, string>;
  if (!paths[slug]) throw new Error("content_not_configured");
  const { data, error } = await db()
    .storage.from("vault-private")
    .createSignedUrl(paths[slug], 300, { download: true });
  if (error || !data) throw new Error("content_unavailable");
  return data.signedUrl;
}
export async function limited(req: Request, endpoint: string, limit = 20) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  // Deployment ingress must overwrite x-forwarded-for; never persist raw IPs.
  const key = await digest(`${env("RATE_LIMIT_SALT")}:${endpoint}:${ip}`);
  if (!(await rpc<boolean>("check_rate", { p_key: key, p_limit: limit })))
    throw new Error("rate_limited");
}
export async function contactLimit(email: string, endpoint: string) {
  const hash = await digest(`${env("RATE_LIMIT_SALT")}:${email}`);
  if (
    !(await rpc<boolean>("check_rate", {
      p_key: `${endpoint}:${hash}`,
      p_limit: 3,
    }))
  )
    throw new Error("rate_limited");
}
const messages: Record<string, string> = {
  unauthorized:
    "This link has expired or is invalid. Request a new access email.",
  invalid_email: "Enter a valid email address.",
  invalid_request: "Check your details and try again.",
  invalid_amount: "Choose an amount from $5 to $1,000.",
  unavailable_item: "This item is not available yet.",
  rate_limited: "Please wait a minute before trying again.",
  not_configured: "This connection is not ready yet. Please try again later.",
  content_not_configured:
    "Your capture was saved. The exclusive is still being prepared.",
  request_conflict: "This request changed. Please start a new checkout.",
};
export function endpoint(
  handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>,
  options: { worker?: boolean } = {},
) {
  return async (req: Request) => {
    const origin = req.headers.get("origin");
    const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Headers": "content-type,apikey",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    };
    if (origin && allowed.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers.Vary = "Origin";
    }
    const respond = (value: unknown, status = 200) =>
      new Response(JSON.stringify(value), { status, headers });
    if (!options.worker && (!origin || !allowed.includes(origin)))
      return respond(
        {
          success: false,
          error: {
            code: "forbidden",
            message: "Request not permitted.",
            retryable: false,
          },
        },
        403,
      );
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (req.method !== "POST")
      return respond(
        {
          success: false,
          error: { code: "method", message: "Use POST.", retryable: false },
        },
        405,
      );
    try {
      if (options.worker) {
        if (
          req.headers.get("authorization") !==
          `Bearer ${env("SCHEDULER_SECRET")}`
        )
          throw new Error("unauthorized");
      } else await limited(req, new URL(req.url).pathname);
      const raw = await req.text();
      if (raw.length > 12000) throw new Error("invalid_request");
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (!body || Array.isArray(body) || typeof body !== "object")
        throw new Error("invalid_request");
      return respond({ success: true, data: await handler(req, body) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "unavailable";
      // Operational codes only: no contact data, provider bodies, or tokens in logs.
      if (!messages[code])
        console.error("operation_failed", new URL(req.url).pathname);
      return respond(
        {
          success: false,
          error: {
            code: messages[code] ? code : "unavailable",
            message:
              messages[code] ||
              "Could not complete this request. Please try again.",
            retryable: ![
              "unauthorized",
              "invalid_request",
              "invalid_email",
              "invalid_amount",
              "unavailable_item",
            ].includes(code),
          },
        },
        code === "unauthorized"
          ? 401
          : code === "rate_limited"
            ? 429
            : messages[code]
              ? 400
              : 503,
      );
    }
  };
}
export async function enqueue(
  fanId: string,
  kind: string,
  dedupe: string,
  payload: object = {},
) {
  const { error } = await db().from("delivery_jobs").upsert(
    {
      artist_id: catalog.artistId,
      fan_id: fanId,
      kind,
      dedupe_key: dedupe,
      payload,
    },
    { onConflict: "dedupe_key", ignoreDuplicates: true },
  );
  if (error) throw new Error("database_unavailable");
}

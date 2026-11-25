import { catalog, db } from "./platform.ts";
import { studioPageSize, type StudioReadiness } from "../../shared/studio.ts";
import { studioCreative } from "./studio-creative.ts";
import { studioInstagram } from "./studio-instagram.ts";
import { studioContent } from "./studio-content.ts";
import { uuid } from "../../shared/validation.ts";

export async function artistStudio(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const allowedOrigins = (Deno.env.get("ARTIST_STUDIO_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim());
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin",
  });
  const fail = (status: number, code: string) =>
    Response.json({ code }, { status, headers });
  if (!origin || !allowedOrigins.includes(origin))
    return fail(403, "forbidden");
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type",
  );
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return fail(405, "method");

  const owner = Deno.env.get("ARTIST_STUDIO_OWNER_ID");
  if (!uuid(owner)) return fail(503, "unavailable");
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer ([\w.-]{1,4096})$/i)?.[1];
  if (!bearer) return fail(401, "unauthenticated");

  try {
    const client = db();
    const { data: user, error: authError } = await client.auth.getUser(bearer);
    if (authError || !user.user) return fail(401, "unauthenticated");
    if (user.user.id !== owner || !user.user.email_confirmed_at)
      return fail(403, "forbidden");

    const { data: token, error: claimsError } =
      await client.auth.getClaims(bearer);
    if (claimsError || token?.claims.sub !== owner)
      return fail(401, "unauthenticated");
    if (token.claims.aal !== "aal2") return fail(403, "mfa_required");

    const raw = await request.text();
    if (raw.length > 16_000) return fail(400, "invalid_request");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, "invalid_request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return fail(400, "invalid_request");
    const input = body as Record<string, unknown>;
    if (
      input.view === "content" ||
      input.view === "content_save" ||
      input.view === "content_acquisition"
    )
      return await studioContent(input, client, headers);
    if (input.view === "creative_status" || input.view === "creative_generate")
      return await studioCreative(input, client, headers);
    if (typeof input.view === "string" && input.view.startsWith("instagram_")) {
      if (!uuid(token.claims.session_id)) return fail(403, "session_required");
      return await studioInstagram(
        input,
        client,
        headers,
        token.claims.session_id,
        origin,
      );
    }
    if (input.view === "session") {
      const readiness: StudioReadiness = {
        supportEnabled: Deno.env.get("SUPPORT_ENABLED") === "true",
        vaultEnabled: Deno.env.get("COMMERCE_ENABLED") === "true",
        rewardEmailEnabled: Deno.env.get("EMAIL_DELIVERY_ENABLED") === "true",
        marketingEmailEnabled:
          Deno.env.get("EMAIL_MARKETING_ENABLED") === "true",
      };
      return Response.json(readiness, { headers });
    }

    if (
      input.view === "report" &&
      typeof input.campaign === "string" &&
      /^[a-z0-9][a-z0-9_-]{0,79}$/.test(input.campaign)
    ) {
      const { data, error } = await client.rpc("artist_studio_report", {
        p_artist: catalog.artistId,
        p_campaign: input.campaign,
      });
      return error
        ? fail(503, "unavailable")
        : Response.json(data, { headers });
    }
    if (
      input.view === "fans" &&
      typeof input.search === "string" &&
      input.search.length <= 254 &&
      typeof input.page === "number" &&
      Number.isSafeInteger(input.page) &&
      input.page >= 0 &&
      input.page <= 40_000
    ) {
      const { data, error } = await client.rpc("artist_studio_fans", {
        p_artist: catalog.artistId,
        p_search: input.search.trim(),
        p_limit: studioPageSize,
        p_offset: input.page * studioPageSize,
      });
      return error
        ? fail(503, "unavailable")
        : Response.json(data, { headers });
    }
    return fail(400, "invalid_request");
  } catch {
    return fail(503, "unavailable");
  }
}

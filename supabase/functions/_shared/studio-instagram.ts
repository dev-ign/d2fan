import { catalog, type db } from "./platform.ts";
import type {
  InstagramMedia,
  InstagramStatus,
} from "../../shared/studio-instagram.ts";
import { uuid } from "../../shared/validation.ts";

const table = "studio_instagram_connections";
const scope = "instagram_business_basic";
const artist = catalog.artistId;
const idValue = (value: unknown): value is string =>
  typeof value === "string" && /^\d{1,30}$/.test(value);
const cursorValue = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_+=/-]{1,400}$/.test(value);
const byteText = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const textBytes = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const encoder = new TextEncoder();
const timeout = () => AbortSignal.timeout(4_000);

function permalink(value: unknown) {
  if (typeof value !== "string" || value.length > 1024) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      ["www.instagram.com", "instagram.com"].includes(url.hostname) &&
      /^\/(?:p|reel|tv)\/[\w-]+\/?$/.test(url.pathname)
    )
      return "https://www.instagram.com" + url.pathname.replace(/\/$/, "");
  } catch {
    /* Ignore provider fields with invalid URLs. */
  }
}

function imageUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /\.(?:cdninstagram\.com|fbcdn\.net)$/.test(url.hostname)
    )
      return url.href;
  } catch {
    /* Thumbnail is optional. */
  }
  return null;
}

class Reauthorize extends Error {}

async function provider(url: URL | string, options: RequestInit = {}) {
  const result = await fetch(url, {
    ...options,
    redirect: "error",
    signal: timeout(),
  });
  const body = await result.json();
  if (!result.ok) {
    if (result.status === 401 || body?.error?.code === 190)
      throw new Reauthorize();
    throw new Error("provider_unavailable");
  }
  return body;
}

async function stateHash(state: string) {
  return byteText(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(state)),
    ),
  );
}

async function seal(token: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(artist) },
    key,
    encoder.encode(token),
  );
  return byteText(iv) + "." + byteText(new Uint8Array(cipher));
}

async function unseal(sealed: string, key: CryptoKey) {
  const [iv, cipher] = sealed.split(".");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: textBytes(iv),
        additionalData: encoder.encode(artist),
      },
      key,
      textBytes(cipher),
    ),
  );
}

function mediaItem(row: Record<string, unknown>): InstagramMedia | undefined {
  const link = permalink(row.permalink);
  if (
    !idValue(row.id) ||
    !link ||
    typeof row.timestamp !== "string" ||
    !Number.isFinite(Date.parse(row.timestamp))
  )
    return;
  return {
    id: row.id,
    permalink: link,
    timestamp: row.timestamp,
    format:
      typeof row.media_product_type === "string"
        ? row.media_product_type.slice(0, 40)
        : typeof row.media_type === "string"
          ? row.media_type.slice(0, 40)
          : "Post",
    caption: typeof row.caption === "string" ? row.caption.slice(0, 260) : "",
    thumbnail: imageUrl(row.thumbnail_url ?? row.media_url),
  };
}

export async function studioInstagram(
  input: Record<string, unknown>,
  client: ReturnType<typeof db>,
  headers: Headers,
  sessionId: string,
  origin: string,
) {
  const send = (body: unknown, status = 200) =>
    Response.json(body, { headers, status });
  const fail = (code: string, status = 400) => send({ code }, status);
  const rows = () => client.from(table);
  if (input.view === "instagram_disconnect") {
    const { error } = await rows().delete().eq("artist_id", artist);
    return error
      ? fail("instagram_unavailable", 503)
      : send({ disconnected: true });
  }
  const appId = Deno.env.get("STUDIO_INSTAGRAM_APP_ID");
  const secret = Deno.env.get("STUDIO_INSTAGRAM_APP_SECRET");
  const version = Deno.env.get("STUDIO_INSTAGRAM_API_VERSION");
  const redirectUri = Deno.env.get("STUDIO_INSTAGRAM_REDIRECT_URI");
  const rawKey = Deno.env.get("STUDIO_INSTAGRAM_TOKEN_KEY");
  if (
    !idValue(appId) ||
    !secret ||
    !version ||
    !/^v\d{2}\.\d$/.test(version) ||
    redirectUri !== origin + "/studio/content" ||
    !rawKey ||
    !/^[A-Za-z0-9+/]{43}=$/.test(rawKey)
  ) {
    return input.view === "instagram_status"
      ? send({
          status: "setup_required",
          profile: null,
          syncedAt: null,
        } satisfies InstagramStatus)
      : fail("instagram_setup", 503);
  }
  const key = await crypto.subtle.importKey(
    "raw",
    textBytes(rawKey),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  const graph = "https://graph.instagram.com/" + version;
  const authHeaders = (token: string) => ({ Authorization: "Bearer " + token });
  const graphGet = (path: string, token: string) =>
    provider(graph + path, { headers: authHeaders(token) });
  const now = new Date();
  if (input.view === "instagram_start") {
    const state = crypto.randomUUID() + crypto.randomUUID();
    const { error } = await rows().upsert(
      {
        artist_id: artist,
        attempt: crypto.randomUUID(),
        state_hash: await stateHash(state),
        session_id: sessionId,
        state_expires: new Date(now.getTime() + 600_000).toISOString(),
      },
      { onConflict: "artist_id", defaultToNull: false },
    );
    if (error) return fail("instagram_unavailable", 503);
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      enable_fb_login: "0",
    }).toString();
    return send({ url: url.href });
  }
  if (input.view === "instagram_finish") {
    const { state, code } = input;
    if (
      typeof state !== "string" ||
      !/^[a-f\d-]{72}$/.test(state) ||
      typeof code !== "string" ||
      !code ||
      code.length > 2048
    )
      return fail("instagram_callback");
    // Claim the state before sending the one-use code to Meta. An independent
    // attempt marker prevents an in-flight callback from undoing a disconnect.
    const { data: claim, error } = await rows()
      .update({ state_hash: null })
      .eq("artist_id", artist)
      .eq("session_id", sessionId)
      .eq("state_hash", await stateHash(state))
      .gt("state_expires", now.toISOString())
      .select("attempt")
      .maybeSingle();
    if (error) return fail("instagram_unavailable", 503);
    if (!claim?.attempt) return fail("instagram_callback", 409);
    const form = new FormData();
    for (const [name, value] of Object.entries({
      client_id: appId,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code,
    }))
      form.set(name, value);
    const exchangeResult = await provider(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        body: form,
      },
    );
    const short = exchangeResult?.data?.[0];
    const granted = Array.isArray(short?.permissions)
      ? short.permissions
      : String(short?.permissions ?? "").split(",");
    if (!granted.includes(scope) || typeof short.access_token !== "string")
      return fail("instagram_permissions", 403);
    const exchange = new URL("https://graph.instagram.com/access_token");
    exchange.search = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: secret,
      access_token: short.access_token,
    }).toString();
    const long = await provider(exchange);
    if (
      typeof long.access_token !== "string" ||
      !Number.isSafeInteger(long.expires_in) ||
      long.expires_in <= 0
    )
      return fail("instagram_unavailable", 503);
    const profile = await graphGet(
      "/me?fields=user_id,username,profile_picture_url",
      long.access_token,
    );
    if (!idValue(profile.user_id) || !/^[\w.]{1,30}$/.test(profile.username))
      return fail("instagram_unavailable", 503);
    const { data: saved, error: saveError } = await rows()
      .update({
        state_expires: null,
        session_id: null,
        token_cipher: await seal(long.access_token, key),
        account_id: profile.user_id,
        username: profile.username,
        avatar: imageUrl(profile.profile_picture_url),
        connected_at: now.toISOString(),
        refreshed_at: null,
        synced_at: null,
        token_expires: new Date(
          now.getTime() + long.expires_in * 1000,
        ).toISOString(),
        reauthorize: false,
      })
      .eq("artist_id", artist)
      .eq("attempt", claim.attempt)
      .select("artist_id")
      .maybeSingle();
    return saveError
      ? fail("instagram_unavailable", 503)
      : saved
        ? send({ connected: true })
        : fail("instagram_callback", 409);
  }

  const { data: row, error } = await rows()
    .select(
      "state_expires,token_cipher,account_id,username,avatar,synced_at,connected_at,refreshed_at,token_expires,reauthorize",
    )
    .eq("artist_id", artist)
    .maybeSingle();
  if (error) return fail("instagram_unavailable", 503);
  const expires = Date.parse(row?.token_expires ?? "");
  const status: InstagramStatus["status"] = row?.token_cipher
    ? row.reauthorize || !Number.isFinite(expires) || expires <= now.getTime()
      ? "reauthorize"
      : "connected"
    : Date.parse(row?.state_expires ?? "") > now.getTime()
      ? "pending"
      : "disconnected";
  if (input.view === "instagram_status")
    return send({
      status,
      profile: row?.account_id
        ? { id: row.account_id, username: row.username, avatar: row.avatar }
        : null,
      syncedAt: row?.synced_at ?? null,
    } satisfies InstagramStatus);
  if (
    (input.view !== "instagram_media" &&
      input.view !== "instagram_associate") ||
    (input.after !== null && !cursorValue(input.after))
  )
    return fail("invalid_request");
  if (
    input.view === "instagram_associate" &&
    (!uuid(input.placementId) || !idValue(input.mediaId))
  )
    return fail("invalid_request");
  if (status !== "connected" || !row) return fail("instagram_reauthorize", 409);

  let cipher = row.token_cipher;
  let token: string;
  try {
    token = await unseal(cipher, key);
    if (
      expires - now.getTime() < 7 * 86_400_000 &&
      now.getTime() - Date.parse(row.refreshed_at ?? row.connected_at) >=
        86_400_000
    ) {
      const refresh = new URL(
        "https://graph.instagram.com/refresh_access_token",
      );
      refresh.search = new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: token,
      }).toString();
      const renewed = await provider(refresh);
      if (
        typeof renewed.access_token !== "string" ||
        !Number.isSafeInteger(renewed.expires_in) ||
        renewed.expires_in <= 0
      )
        return fail("instagram_unavailable", 503);
      token = renewed.access_token;
      const replacement = await seal(token, key);
      const result = await rows()
        .update({
          token_cipher: replacement,
          refreshed_at: now.toISOString(),
          token_expires: new Date(
            now.getTime() + renewed.expires_in * 1000,
          ).toISOString(),
        })
        .eq("artist_id", artist)
        .eq("token_cipher", cipher)
        .select("artist_id")
        .maybeSingle();
      if (result.error) return fail("instagram_unavailable", 503);
      if (!result.data) return fail("instagram_reauthorize", 409);
      cipher = replacement;
    }
    const params = new URLSearchParams({
      fields:
        "id,permalink,timestamp,caption,media_type,media_product_type,media_url,thumbnail_url",
      limit: "12",
    });
    if (typeof input.after === "string") params.set("after", input.after);
    const page = await graphGet("/me/media?" + params.toString(), token);
    if (!Array.isArray(page.data)) return fail("instagram_unavailable", 503);
    const items: InstagramMedia[] = page.data
      .slice(0, 12)
      .flatMap((item: unknown) => {
        const parsed =
          item && typeof item === "object"
            ? mediaItem(item as Record<string, unknown>)
            : undefined;
        return parsed ? [parsed] : [];
      });
    const active = await rows()
      .update({ synced_at: now.toISOString() })
      .eq("artist_id", artist)
      .eq("token_cipher", cipher)
      .select("artist_id")
      .maybeSingle();
    if (active.error) return fail("instagram_unavailable", 503);
    if (!active.data) return fail("instagram_reauthorize", 409);
    const placements = () => client.from("studio_content_placements");
    if (input.view === "instagram_associate") {
      const item = items.find(({ id }) => id === input.mediaId);
      const { data: placement, error: lookupError } = await placements()
        .select("post_url")
        .eq("artist_id", artist)
        .eq("id", input.placementId)
        .eq("status", "published")
        .in("format", ["ig_reel", "ig_story", "ig_feed"])
        .maybeSingle();
      if (lookupError) return fail("instagram_unavailable", 503);
      if (
        !item ||
        !placement ||
        item.permalink !== permalink(placement.post_url)
      )
        return fail("instagram_permalink", 409);
      const linked = await placements()
        .update({ instagram_media_id: item.id })
        .eq("artist_id", artist)
        .eq("id", input.placementId)
        .eq("status", "published")
        .eq("post_url", placement.post_url)
        .select("id")
        .maybeSingle();
      return linked.data
        ? send({ linked: true })
        : fail("instagram_association", 409);
    }
    if (items.length) {
      const links = await placements()
        .select("id,instagram_media_id")
        .eq("artist_id", artist)
        .in(
          "instagram_media_id",
          items.map(({ id }) => id),
        );
      if (links.error) return fail("instagram_unavailable", 503);
      for (const item of items)
        item.placementId = links.data.find(
          (link) => link.instagram_media_id === item.id,
        )?.id;
    }
    const after = page.paging?.cursors?.after;
    return send({
      items,
      next: page.paging?.next && cursorValue(after) ? after : null,
    });
  } catch (error) {
    if (error instanceof Reauthorize) {
      await rows()
        .update({ reauthorize: true })
        .eq("artist_id", artist)
        .eq("token_cipher", cipher);
      return fail("instagram_reauthorize", 409);
    }
    return fail("instagram_unavailable", 503);
  }
}

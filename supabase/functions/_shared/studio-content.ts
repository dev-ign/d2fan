import { catalog, type db } from "./platform.ts";
import {
  approvedMediaUrl,
  type ContentFields,
  contentFormats,
  contentLanguages,
  contentPageSize,
  contentStatuses,
  easternDay,
} from "../../shared/studio-content.ts";
import { uuid } from "../../shared/validation.ts";

const releaseCampaigns: Record<string, string> = catalog.releaseCampaigns;
const limits = { title: 120, pillar: 60, hook: 240, caption: 2200, cta: 240 };

function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^20\d\d-\d\d-\d\d$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function option<T extends string>(
  value: unknown,
  options: Record<T, unknown>,
): value is T {
  return typeof value === "string" && Object.hasOwn(options, value);
}

function nativePost(value: string, format: ContentFields["format"]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return;
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname;
    const id = "[A-Za-z0-9_-]+";
    const matches = {
      ig_reel:
        host === "instagram.com" &&
        new RegExp(`^/(reel|p)/${id}/?$`).test(path),
      ig_feed:
        host === "instagram.com" && new RegExp(`^/p/${id}/?$`).test(path),
      ig_story:
        host === "instagram.com" && /^\/stories\/[\w.]+\/\d+\/?$/.test(path),
      tt_video:
        host === "tiktok.com" && /^\/@[\w.]+\/video\/\d+\/?$/.test(path),
      tt_photo:
        host === "tiktok.com" && /^\/@[\w.]+\/photo\/\d+\/?$/.test(path),
      yt_short:
        (host === "youtube.com" &&
          new RegExp(`^/shorts/${id}/?$`).test(path)) ||
        (host === "youtu.be" && new RegExp(`^/${id}/?$`).test(path)),
    };
    if (matches[format]) return url.origin + path;
  } catch {
    return;
  }
}

function contentFields(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const f = input as Record<string, unknown>;
  const { format, status, language } = f;
  if (
    !option(format, contentFormats) ||
    !option(status, contentStatuses) ||
    !option(language, contentLanguages)
  )
    return;
  if (f.release_slug !== null && !option(f.release_slug, releaseCampaigns))
    return;
  for (const [key, limit] of Object.entries(limits)) {
    const value = f[key];
    if (
      typeof value !== "string" ||
      value.length > limit ||
      value.includes("\0")
    )
      return;
  }
  const text = f as Record<keyof typeof limits, string>;
  if (!text.title.trim()) return;
  if (status === "ready" && !text.caption.trim()) return;
  if (f.planned_on !== null && !validDay(f.planned_on)) return;
  if (
    f.published_on !== null &&
    (!validDay(f.published_on) || f.published_on > easternDay())
  )
    return;
  const hasPublication = f.published_on !== null;
  if (status !== "archived" && (status === "published") !== hasPublication)
    return;

  let postUrl: string | null = null;
  if (hasPublication) {
    if (typeof f.post_url !== "string" || f.post_url.length > 1024) return;
    postUrl = nativePost(f.post_url, format) ?? null;
    if (!postUrl) return;
  } else if (f.post_url !== null) return;

  let mediaUrl: string | null = null;
  if (f.media_url !== null) {
    if (typeof f.media_url !== "string" || f.media_url.length > 2048) return;
    mediaUrl = approvedMediaUrl(f.media_url)?.href ?? null;
    if (!mediaUrl || mediaUrl.length > 2048) return;
  }

  return {
    title: text.title.trim(),
    pillar: text.pillar.trim(),
    hook: text.hook.trim(),
    caption: text.caption.trim(),
    cta: text.cta.trim(),
    release_slug: f.release_slug,
    campaign_id: f.release_slug ? releaseCampaigns[f.release_slug] : null,
    language,
    format,
    status,
    planned_on: f.planned_on,
    published_on: f.published_on,
    post_url: postUrl,
    media_url: mediaUrl,
  } satisfies ContentFields & { campaign_id: string | null };
}

export async function studioContent(
  input: Record<string, unknown>,
  client: ReturnType<typeof db>,
  headers: Headers,
) {
  const respond = (data: unknown, status = 200) =>
    Response.json(data, { status, headers });
  const invalid = () => respond({ code: "invalid_content" }, 400);
  const unavailable = () => respond({ code: "unavailable" }, 503);
  const artist = { p_artist: catalog.artistId };

  if (input.view === "content") {
    const { week, status, page } = input;
    if (
      (week !== null && !validDay(week)) ||
      (status !== "active" && !option(status, contentStatuses)) ||
      typeof page !== "number" ||
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page > 40_000
    )
      return invalid();
    const { data, error } = await client.rpc("artist_studio_content_list", {
      ...artist,
      p_week: week,
      p_status: status,
      p_limit: contentPageSize,
      p_offset: page * contentPageSize,
    });
    return error ? unavailable() : respond(data);
  }
  if (!uuid(input.id) || input.id !== input.id.toLowerCase()) return invalid();
  const placement = { ...artist, p_id: input.id };
  if (input.view === "content_acquisition") {
    const { data, error } = await client.rpc(
      "artist_studio_content_acquisition",
      placement,
    );
    if (error) return unavailable();
    return data ? respond(data) : respond({ code: "not_found" }, 404);
  }
  if (input.view === "content_save") {
    const revision = input.revision;
    if (
      revision !== null &&
      (typeof revision !== "number" ||
        !Number.isInteger(revision) ||
        revision < 1 ||
        revision >= 2147483647)
    )
      return invalid();
    const fields = contentFields(input.fields);
    if (!fields) return invalid();
    const { data, error } = await client.rpc("artist_studio_content_save", {
      ...placement,
      p_fields: fields,
      p_revision: revision,
    });
    if (error) return unavailable();
    return data
      ? respond({ revision: (revision ?? 0) + 1, fields })
      : respond({ code: "content_conflict" }, 409);
  }
  return invalid();
}

// Keep the standalone Vercel function free of client bundle dependencies.
// The media cutoff test checks this against the catalog publication time.
const publishAt = Date.parse("2026-11-27T05:00:00Z");
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const source = process.env.SAYYOULUVME_PREVIEW_URL;
  if (!(Date.now() >= publishAt) || !source?.startsWith("https://")) {
    return new Response(null, { status: 404, headers: noStore });
  }

  const headers = new Headers();
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);

  try {
    const media = await fetch(source, {
      method: request.method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const responseHeaders = new Headers(noStore);
    if (media.status === 416) {
      const contentRange = media.headers.get("Content-Range");
      if (contentRange) responseHeaders.set("Content-Range", contentRange);
      await media.body?.cancel();
      return new Response(null, { status: 416, headers: responseHeaders });
    }
    if (
      (media.status !== 200 && media.status !== 206) ||
      media.headers.get("Content-Type") !== "audio/mp4"
    ) {
      await media.body?.cancel();
      return new Response(null, { status: 502, headers: noStore });
    }

    for (const name of [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ]) {
      const value = media.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(media.body, {
      status: media.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response(null, { status: 502, headers: noStore });
  }
}

export const HEAD = GET;

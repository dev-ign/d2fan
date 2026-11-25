import { studioInstagram } from "../functions/_shared/studio-instagram.ts";
import { studioCreative } from "../functions/_shared/studio-creative.ts";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function fixture(
  vars: Record<string, string>,
  mock: typeof fetch,
  run: () => Promise<void>,
) {
  const previous = Object.fromEntries(
    Object.keys(vars).map((key) => [key, Deno.env.get(key)]),
  );
  const original = globalThis.fetch;
  try {
    for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);
    globalThis.fetch = mock;
    await run();
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(previous))
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
  }
}

Deno.test(
  "Instagram state is session-bound, expires and is consumed once before token exchange",
  async () => {
    type RecordRow = Record<string, unknown>;
    let connection: RecordRow | undefined;
    const placement = {
      id: "f8f5f4e0-8792-4a61-b1a0-72f8f4e48ed2",
      status: "published",
      post_url: "https://www.instagram.com/p/test_post/",
      instagram_media_id: null as string | null,
    };
    let totalProviderCalls = 0;
    let mediaCalls = 0;
    const localHeaders = new Headers();
    const session = crypto.randomUUID();
    const origin = "https://owner.example.test";
    const short = "synthetic-short-token";
    const long = "synthetic-long-token";
    const simulate = (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(input));
      totalProviderCalls++;
      if (url.pathname === "/oauth/access_token") {
        assert(
          init?.body instanceof FormData,
          "code exchange was not form encoded",
        );
        return Promise.resolve(
          Response.json({
            data: [
              { permissions: "instagram_business_basic", access_token: short },
            ],
          }),
        );
      }
      if (url.pathname === "/access_token")
        return Promise.resolve(
          Response.json({ expires_in: 60 * 86400, access_token: long }),
        );
      assert(
        new Headers(init?.headers).get("authorization") === `Bearer ${long}`,
        "long-lived token not decrypted server-side",
      );
      if (url.pathname.endsWith("/me/media")) {
        mediaCalls++;
        assert(
          url.searchParams.get("limit") === "12",
          "media fetch was unbounded",
        );
        return Promise.resolve(
          Response.json({
            data: [
              {
                id: "22",
                permalink: "https://www.instagram.com/p/test_post/",
                timestamp: "2026-11-25T12:00:00Z",
                media_type: "IMAGE",
              },
            ],
            paging: {
              next: "https://example.invalid/ignored",
              cursors: { after: "later" },
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({ user_id: "1234", username: "fixture_artist" }),
      );
    };
    const client = {
      from(table: string) {
        const isConnection = table === "studio_instagram_connections";
        let action = "select";
        let changes: RecordRow = {};
        const predicates: Array<(row: RecordRow) => boolean> = [];
        const query = {
          upsert(value: RecordRow) {
            action = "upsert";
            changes = value;
            return query;
          },
          update(value: RecordRow) {
            action = "update";
            changes = value;
            return query;
          },
          delete() {
            action = "delete";
            return query;
          },
          select() {
            return query;
          },
          eq(key: string, value: unknown) {
            assert(
              key !== "token_cipher",
              "credential material went into a query filter",
            );
            if (key !== "artist_id")
              predicates.push((row) => row[key] === value);
            return query;
          },
          gt(key: string, value: string) {
            predicates.push((row) => String(row[key]) > value);
            return query;
          },
          in(key: string, values: unknown[]) {
            if (key !== "format")
              predicates.push((row) => values.includes(row[key]));
            return query;
          },
          async maybeSingle() {
            return await query;
          },
          then(
            resolve: (result: {
              data: RecordRow | RecordRow[] | null;
              error: null;
            }) => void,
          ) {
            const current = isConnection ? connection : placement;
            const matching =
              current && predicates.every((check) => check(current))
                ? current
                : null;
            if (action === "upsert") connection = { ...connection, ...changes };
            if (action === "update" && matching)
              Object.assign(matching, changes);
            if (action === "delete") connection = undefined;
            resolve({
              data:
                !isConnection && predicates.length === 1
                  ? matching
                    ? [matching]
                    : []
                  : matching,
              error: null,
            });
          },
        };
        return query;
      },
    } as unknown as Parameters<typeof studioInstagram>[1];
    const request = (input: Record<string, unknown>, sessionId = session) =>
      studioInstagram(input, client, localHeaders, sessionId, origin);
    const start = async () => {
      const response = await request({ view: "instagram_start" });
      const { url } = await response.json();
      const auth = new URL(url);
      assert(
        auth.searchParams.get("scope") === "instagram_business_basic",
        "scope was not minimal",
      );
      return auth.searchParams.get("state");
    };
    await fixture(
      {
        STUDIO_INSTAGRAM_APP_ID: "1234",
        STUDIO_INSTAGRAM_APP_SECRET: "test-only",
        STUDIO_INSTAGRAM_API_VERSION: "v27.0",
        STUDIO_INSTAGRAM_REDIRECT_URI: origin + "/studio/content",
        STUDIO_INSTAGRAM_TOKEN_KEY: btoa("x".repeat(32)),
      },
      simulate,
      async () => {
        const first = await start();
        assert(connection?.state_hash !== first, "raw state persisted");
        const finish = (state: string | null) => ({
          view: "instagram_finish",
          code: "synthetic-code",
          state,
        });
        assert(
          (await request(finish(first), crypto.randomUUID())).status === 409,
          "wrong session was accepted",
        );
        connection!.state_expires = "2000-01-01T00:00:00Z";
        assert(
          (await request(finish(first))).status === 409,
          "expired state was accepted",
        );
        assert(totalProviderCalls === 0, "rejected state reached the provider");
        const second = await start();
        assert(
          (await request(finish(second))).status === 200,
          "valid callback failed",
        );
        assert(
          (await request(finish(second))).status === 409,
          "callback replay succeeded",
        );
        assert(Number(totalProviderCalls) === 3, "replay reached the provider");
        const status = await (
          await request({ view: "instagram_status" })
        ).json();
        assert(
          status.status === "connected" &&
            !JSON.stringify(status).includes(long),
          "token leaked in status",
        );
        assert(
          !JSON.stringify(connection).includes(long),
          "token was stored in plaintext",
        );
        const page = await (
          await request({ view: "instagram_media", after: null })
        ).json();
        assert(
          page.items.length === 1 && page.next === "later",
          "media page was not sanitized",
        );
        assert(
          (
            await request({
              view: "instagram_associate",
              placementId: placement.id,
              mediaId: "99",
              after: null,
            })
          ).status === 409,
          "unverified media was associated",
        );
        assert(
          (
            await request({
              view: "instagram_associate",
              placementId: placement.id,
              mediaId: "22",
              after: null,
            })
          ).status === 200 && placement.instagram_media_id === "22",
          "verified permalink was not associated",
        );
        connection!.token_expires = "2000-01-01T00:00:00Z";
        assert(
          (await request({ view: "instagram_media", after: null })).status ===
            409,
          "expired token was used",
        );
        assert(mediaCalls === 3, "expired token reached provider");
        assert(
          (await request({ view: "instagram_disconnect" })).status === 200 &&
            !connection,
          "disconnect left credentials",
        );
        assert(
          (await request({ view: "instagram_media", after: null })).status ===
            409,
          "disconnected media was readable",
        );
      },
    );
  },
);

Deno.test(
  "AI copy fails closed when capped or malformed and submits validated structured candidates",
  async () => {
    let reserve = 1 as number | null;
    let providerCalls = 0;
    let candidate = {
      hook: "Una toma",
      caption: "Escucha el adelanto.",
      cta: "",
    };
    const client = {
      rpc: () => Promise.resolve({ data: reserve, error: null }),
    } as unknown as Parameters<typeof studioCreative>[1];
    const body = {
      view: "creative_generate",
      release: "shorty",
      releaseTitle: "Shorty",
      format: "ig_reel",
      language: "es",
      objective: "Discovery",
      pillar: "Performance",
      note: "",
    };
    const request = (input: unknown = body) =>
      studioCreative(input as typeof body, client, new Headers());
    await fixture(
      { STUDIO_OPENAI_API_KEY: "test-only", STUDIO_AI_ENABLED: "true" },
      (_url, input) => {
        providerCalls++;
        const payload = JSON.parse(String(input?.body));
        assert(
          payload.store === false &&
            payload.max_output_tokens === 900 &&
            payload.model === "gpt-6-luna",
          "unbounded or stored model request",
        );
        assert(payload.text.format.strict, "structured format missing");
        return Promise.resolve(
          Response.json({
            status: "completed",
            output: [
              {
                content: [
                  { type: "output_text", text: JSON.stringify(candidate) },
                ],
              },
            ],
          }),
        );
      },
      async () => {
        assert(
          (await request({ ...body, note: "x".repeat(601) })).status === 400 &&
            providerCalls === 0,
          "invalid input reached provider",
        );
        const valid = await request();
        assert(
          valid.status === 200 &&
            (await valid.json()).copy.hook === candidate.hook,
          "candidate was not returned",
        );
        candidate = { ...candidate, hook: "x".repeat(241) };
        assert((await request()).status === 503, "invalid output was returned");
        reserve = null;
        assert(
          (await request()).status === 429 && Number(providerCalls) === 2,
          "budget rejection called provider",
        );
      },
    );
  },
);

import { artistStudio } from "../functions/_shared/studio.ts";

const owner = "f8f5f4e0-8792-4a61-b1a0-72f8f4e48ed2";
const stranger = "fbf00b4a-2688-4ed4-a0af-c805fc4c3006";
const origin = "https://preview.example.test";

function jwt(sub: string, aal: string) {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub, aal, exp: Math.floor(Date.now() / 1000) + 60 })}.YQ`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test(
  "Studio requires the configured verified owner and AAL2 before data reads",
  async () => {
    const high = jwt(owner, "aal2");
    const low = jwt(owner, "aal1");
    const other = jwt(stranger, "aal2");
    const setup = {
      ARTIST_STUDIO_OWNER_ID: owner,
      ARTIST_STUDIO_ORIGINS: origin,
      SUPABASE_URL: "http://127.0.0.1:54321",
      SB_SECRET_KEY: "studio-synthetic-service-key",
    };
    const previous = new Map(
      Object.keys(setup).map((name) => [name, Deno.env.get(name)]),
    );
    const originalFetch = globalThis.fetch;
    const args: unknown[] = [];
    let confirmed = true;
    const request = (
      bearer?: string,
      body: object = { view: "session" },
      from = origin,
    ) =>
      new Request(`${origin}/functions/v1/artist-studio`, {
        method: "POST",
        headers: {
          Origin: from,
          ...(bearer && { Authorization: `Bearer ${bearer}` }),
        },
        body: JSON.stringify(body),
      });

    try {
      Object.entries(setup).forEach(([key, value]) => Deno.env.set(key, value));
      globalThis.fetch = async (input, init) => {
        const path = new URL(String(input)).pathname;
        const token = new Headers(init?.headers).get("authorization")?.slice(7);
        if (path === "/auth/v1/user") {
          if (token !== high && token !== low && token !== other)
            return Response.json({}, { status: 401 });
          return Response.json({
            id: token === other ? stranger : owner,
            email_confirmed_at: confirmed ? "2026-11-01" : null,
          });
        }
        if (path === "/rest/v1/rpc/artist_studio_fans") {
          args.push(JSON.parse(String(init?.body)));
          return Response.json({ total: 1, items: [] });
        }
        throw new Error("Unexpected fixture request");
      };

      for (const [fixture, status, code] of [
        [
          request(
            high,
            { view: "fans", search: "", page: 0 },
            "https://other.example.test",
          ),
          403,
          "forbidden",
        ],
        [request(), 401, "unauthenticated"],
        [request("untrusted-token"), 401, "unauthenticated"],
        [request(other), 403, "forbidden"],
        [request(low), 403, "mfa_required"],
        [
          request(high, { view: "fans", search: "", page: -1 }),
          400,
          "invalid_request",
        ],
      ] as const) {
        const response = await artistStudio(fixture);
        assert(
          response.status === status && (await response.json()).code === code,
          `Expected ${code}`,
        );
        assert(
          response.headers.get("Cache-Control") === "private, no-store",
          "Private response was cacheable",
        );
      }
      confirmed = false;
      assert(
        (await artistStudio(request(high))).status === 403,
        "Unverified owner was admitted",
      );
      assert(args.length === 0, "A denied request reached an RPC");

      confirmed = true;
      const result = await artistStudio(
        request(high, {
          view: "fans",
          search: " example.test ",
          page: 1,
          artist: "other-artist",
        }),
      );
      assert(
        result.status === 200 && (await result.json()).total === 1,
        "Owner could not read the directory",
      );
      assert(
        JSON.stringify(args[0]) ===
          JSON.stringify({
            p_artist: "jona-ferreira",
            p_search: "example.test",
            p_limit: 25,
            p_offset: 25,
          }),
        "Directory read was not scoped",
      );
    } finally {
      globalThis.fetch = originalFetch;
      for (const [name, value] of previous) {
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      }
    }
  },
);

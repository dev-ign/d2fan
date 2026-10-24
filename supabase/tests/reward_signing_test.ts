import { captureFan } from "../functions/_shared/handlers.ts";
import { FileSigningError, signedFile } from "../functions/_shared/platform.ts";

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const testEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "private-service-key-do-not-log",
  ACCESS_TOKEN_SECRET:
    "private-access-secret-do-not-log-at-least-32-characters",
  RATE_LIMIT_SALT: "private-rate-limit-salt-do-not-log",
};
const privatePath = "private-do-not-log/fan@example.com.jpg";
const fileMap = JSON.stringify({ "lead-magnet": privatePath });

Deno.test(
  "free reward signing diagnostics are categorized and preserve signup",
  async (t) => {
    const names = [
      ...Object.keys(testEnv),
      "SB_SECRET_KEY",
      "PRIVATE_FILE_PATHS",
      "EMAIL_PROVIDER_API_KEY",
    ];
    const previous = new Map(names.map((name) => [name, Deno.env.get(name)]));
    const originalFetch = globalThis.fetch;
    const originalError = console.error;
    const cases = [
      {
        name: "unset file map",
        map: undefined,
        category: "missing_configuration",
      },
      { name: "empty file map", map: "", category: "missing_configuration" },
      {
        name: "malformed JSON",
        map: '{"private-do-not-log":',
        category: "malformed_json",
      },
      { name: "null map", map: "null", category: "missing_mapping" },
      { name: "array map", map: "[]", category: "missing_mapping" },
      { name: "missing reward key", map: "{}", category: "missing_mapping" },
      {
        name: "non-string path",
        map: '{"lead-magnet":42}',
        category: "missing_mapping",
      },
      {
        name: "blank path",
        map: '{"lead-magnet":" "}',
        category: "missing_mapping",
      },
      {
        name: "missing object code",
        map: fileMap,
        status: 404,
        body: { code: "NoSuchKey", message: privatePath },
        category: "missing_storage_object",
      },
      {
        name: "legacy missing object",
        map: fileMap,
        status: 400,
        body: {
          statusCode: "404",
          error: "not_found",
          message: "Object not found",
        },
        category: "missing_storage_object",
      },
      {
        name: "missing bucket",
        map: fileMap,
        status: 404,
        body: { code: "NoSuchBucket", message: privatePath },
        category: "missing_configuration",
      },
      {
        name: "permission denied",
        map: fileMap,
        status: 403,
        body: { code: "AccessDenied", message: privatePath },
        category: "insufficient_permissions",
      },
      {
        name: "invalid credential",
        map: fileMap,
        status: 401,
        body: { code: "InvalidJWT", message: "private-token-do-not-log" },
        category: "insufficient_permissions",
      },
      {
        name: "legacy permission denied",
        map: fileMap,
        status: 400,
        body: {
          statusCode: "403",
          error: "unauthorized",
          message: privatePath,
        },
        category: "insufficient_permissions",
      },
      {
        name: "Storage API failure with sensitive body",
        map: fileMap,
        status: 500,
        body: {
          code: "private-provider-code-do-not-log",
          message: `${privatePath}?token=private-token-do-not-log`,
        },
        category: "storage_api_failure",
      },
      {
        name: "generic 404 is not assumed to be a missing object",
        map: fileMap,
        status: 404,
        body: { message: "Gateway not found" },
        category: "storage_api_failure",
      },
      {
        name: "network exception",
        map: fileMap,
        networkFailure: true,
        category: "storage_api_failure",
      },
      {
        name: "invalid success response",
        map: fileMap,
        body: null,
        category: "storage_api_failure",
      },
      {
        name: "successful signing",
        map: fileMap,
        body: {
          signedURL: "/object/sign/private-do-not-log?token=private-token",
        },
        category: undefined,
      },
    ];
    try {
      for (const [name, value] of Object.entries(testEnv))
        Deno.env.set(name, value);
      Deno.env.delete("SB_SECRET_KEY");
      Deno.env.delete("EMAIL_PROVIDER_API_KEY");
      for (const scenario of cases) {
        await t.step(scenario.name, async () => {
          if (scenario.map === undefined) Deno.env.delete("PRIVATE_FILE_PATHS");
          else Deno.env.set("PRIVATE_FILE_PATHS", scenario.map);
          const logs: unknown[][] = [];
          console.error = (...args: unknown[]) => logs.push(args);
          let captures = 0;
          let signs = 0;
          const json = (value: unknown, status = 200) =>
            new Response(JSON.stringify(value), {
              status,
              headers: { "Content-Type": "application/json" },
            });
          globalThis.fetch = async (input, init) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.includes("/rpc/check_rate")) return json(true);
            if (url.includes("/rpc/capture_fan")) {
              captures++;
              return json("test-fan-do-not-log");
            }
            if (url.includes("/storage/v1/object/sign/")) {
              signs++;
              const body = init?.body
                ? String(init.body)
                : input instanceof Request
                  ? await input.clone().text()
                  : "";
              assert(JSON.parse(body).expiresIn === 300, "signing TTL changed");
              if (scenario.networkFailure)
                throw new Error(
                  `${privatePath}?token=private-token-do-not-log`,
                );
              return json(scenario.body, scenario.status ?? 200);
            }
            throw new Error("unexpected HTTP request");
          };
          const result = await captureFan(new Request("http://localhost"), {
            requestId: crypto.randomUUID(),
            email: "fan@example.com",
            language: "en",
            source: "stay_close",
            emailMarketing: false,
            analyticsConsent: false,
            firstTouch: {},
            lastTouch: {},
          });
          assert(captures === 1, "capture was not completed");
          assert(Boolean(result.captureToken), "capture token missing");
          assert(result.delivery === "not_configured", "email became required");
          if (scenario.category) {
            assert(
              result.magnetUrl === undefined,
              "failed signing returned a URL",
            );
            // An exact payload assertion prevents accidental logging of paths,
            // provider codes/messages, contacts, keys, tokens or signed URLs.
            assert(
              JSON.stringify(logs) ===
                JSON.stringify([
                  [
                    JSON.stringify({
                      event: "free_reward_signing_failed",
                      category: scenario.category,
                    }),
                  ],
                ]),
              "diagnostic payload was not sanitized or category was incorrect",
            );
          } else {
            assert(
              result.magnetUrl?.includes("private-token"),
              "signed URL missing",
            );
            assert(
              result.magnetUrl?.includes("download="),
              "download option missing",
            );
            assert(
              logs.length === 0,
              "successful signing emitted an error log",
            );
          }
          assert(signs === (scenario.map === fileMap ? 1 : 0));
        });
      }
      await t.step(
        "missing server credentials are categorized without exposing values",
        async () => {
          Deno.env.set("PRIVATE_FILE_PATHS", fileMap);
          Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
          try {
            await signedFile("lead-magnet");
            throw new Error("expected signing rejection");
          } catch (error) {
            assert(error instanceof FileSigningError);
            assert(error.category === "missing_configuration");
            assert(error.message === "not_configured");
          }
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalError;
      for (const [name, value] of previous) {
        if (value === undefined) Deno.env.delete(name);
        else Deno.env.set(name, value);
      }
    }
  },
);

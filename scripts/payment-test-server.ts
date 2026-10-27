// Local adapter for the existing Edge handlers; never deploy this file.
import {
  captureFan,
  createCheckout,
  checkoutStatus,
  redeemVault,
} from "../supabase/functions/_shared/handlers.ts";
import {
  authorizePaymentTest,
  testItemSlug,
} from "../supabase/functions/_shared/payment-test.ts";
import {
  endpoint,
  token,
  env,
} from "../supabase/functions/_shared/platform.ts";

if (Deno.env.get("ACCION_TEST_CHECKOUT") !== "true")
  throw new Error("Test mode required");
if (!/^(sk|rk)_test_/.test(env("STRIPE_SECRET_KEY")))
  throw new Error("Stripe test key required");

const handlers: Record<string, (req: Request) => Promise<Response>> = {
  "payment-test-access": endpoint((req, b) =>
    authorizePaymentTest(req, b.token),
  ),
  "capture-fan": endpoint(async (req, b) => {
    await authorizePaymentTest(req, b.operatorTestToken);
    return captureFan(req, {
      ...b,
      analyticsConsent: false,
      emailMarketing: false,
    });
  }),
  "create-checkout": endpoint(async (req, b) => {
    await authorizePaymentTest(req, b.operatorTestToken);
    return createCheckout(req, { ...b, analyticsConsent: false });
  }),
  "checkout-status": endpoint(checkoutStatus),
  "redeem-vault": endpoint(redeemVault),
};
// Use a separate secret for the browser capability, never the access-token signing key.
const now = Math.floor(Date.now() / 1000);
const { signToken } = await import("../supabase/functions/_shared/security.ts");
const operator = await signToken(
  {
    scope: "operator_test",
    sub: testItemSlug,
    artist: "jona-ferreira",
    iat: now,
    exp: now + 3600,
  },
  env("ACCION_TEST_TOKEN_SECRET"),
);
// Fail early if ordinary access-token configuration is missing.
await token("status", "configuration-check", 1);
Deno.serve(
  {
    hostname: "127.0.0.1",
    port: 54324,
    onListen() {
      console.log("Open this private operator link (expires in one hour):");
      console.log(
        `http://localhost:5173/#vault-test=${encodeURIComponent(operator)}`,
      );
    },
  },
  (req) => {
    const url = new URL(req.url);
    if (url.host !== "127.0.0.1:54324")
      return new Response("Forbidden", { status: 403 });
    const name = url.pathname.replace(/^\/functions\/v1\//, "");
    return handlers[name]?.(req) ?? new Response("Not found", { status: 404 });
  },
);

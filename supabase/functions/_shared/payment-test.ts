import { verifyToken } from "./security.ts";
import { catalog, env, site } from "./platform.ts";

export const testItemSlug = "accion-wallpaper";
export async function authorizePaymentTest(req: Request, value: unknown) {
  // Neither a development flag nor Origin is an authorization credential.
  if (
    Deno.env.get("ACCION_TEST_CHECKOUT") !== "true" ||
    site() !== "http://localhost:5173" ||
    req.headers.get("origin") !== site() ||
    !/^(sk|rk)_test_/.test(env("STRIPE_SECRET_KEY"))
  )
    throw new Error("unauthorized");
  const claims = await verifyToken(
    value,
    "operator_test",
    catalog.artistId,
    env("ACCION_TEST_TOKEN_SECRET"),
  );
  if (
    claims.sub !== testItemSlug ||
    !Number.isFinite(claims.iat) ||
    !Number.isFinite(claims.exp) ||
    claims.exp - claims.iat > 3600
  )
    throw new Error("unauthorized");
  const item = catalog.vault.find((value) => value.slug === testItemSlug)!;
  return {
    itemSlug: testItemSlug,
    priceMinor: item.priceMinor,
    currency: catalog.currency,
  };
}

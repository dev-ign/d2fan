import { endpoint } from "../_shared/platform.ts";
import { createCheckout } from "../_shared/handlers.ts";
const handler = endpoint(createCheckout);

export function checkoutRequest(req: Request) {
  // Stage A denies direct API calls before rate counters, database or Stripe.
  if (
    Deno.env.get("COMMERCE_ENABLED") !== "true" &&
    Deno.env.get("SUPPORT_ENABLED") !== "true"
  )
    return Response.json(
      {
        success: false,
        error: {
          code: "commerce_disabled",
          message: "Payments are currently unavailable.",
          retryable: false,
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  return handler(req);
}

if (import.meta.main) Deno.serve(checkoutRequest);

import { endpoint } from "../_shared/platform.ts";
import { createCheckout } from "../_shared/handlers.ts";
Deno.serve(endpoint(createCheckout));

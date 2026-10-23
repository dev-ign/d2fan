import { endpoint } from "../_shared/platform.ts";
import { checkoutStatus } from "../_shared/handlers.ts";
Deno.serve(endpoint(checkoutStatus));

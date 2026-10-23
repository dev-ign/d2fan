import { endpoint } from "../_shared/platform.ts";
import { manageConsent } from "../_shared/handlers.ts";
Deno.serve(endpoint(manageConsent));

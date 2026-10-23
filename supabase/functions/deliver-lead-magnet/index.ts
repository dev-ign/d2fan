import { endpoint } from "../_shared/platform.ts";
import { deliverLeadMagnet } from "../_shared/handlers.ts";
Deno.serve(endpoint(deliverLeadMagnet));

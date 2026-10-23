import { endpoint } from "../_shared/platform.ts";
import { recoverAccess } from "../_shared/handlers.ts";
Deno.serve(endpoint(recoverAccess));

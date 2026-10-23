import { endpoint } from "../_shared/platform.ts";
import { captureFan } from "../_shared/handlers.ts";
Deno.serve(endpoint(captureFan));

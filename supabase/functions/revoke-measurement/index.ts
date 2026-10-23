import { endpoint } from "../_shared/platform.ts";
import { revokeMeasurement } from "../_shared/handlers.ts";
Deno.serve(endpoint(revokeMeasurement));

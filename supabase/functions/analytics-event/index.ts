import { endpoint } from "../_shared/platform.ts";
import { analyticsEvent } from "../_shared/handlers.ts";
Deno.serve(endpoint(analyticsEvent));

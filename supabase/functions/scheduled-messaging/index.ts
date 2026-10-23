import { endpoint } from "../_shared/platform.ts";
import { runMessaging } from "../_shared/messaging.ts";
Deno.serve(endpoint(() => runMessaging(), { worker: true }));

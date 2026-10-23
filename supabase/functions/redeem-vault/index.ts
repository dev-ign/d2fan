import { endpoint } from "../_shared/platform.ts";
import { redeemVault } from "../_shared/handlers.ts";
Deno.serve(endpoint(redeemVault));

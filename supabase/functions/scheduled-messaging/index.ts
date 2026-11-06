import { endpoint, env } from "../_shared/platform.ts";
import { messagingRequest } from "../_shared/messaging.ts";
const handler = endpoint(messagingRequest, { worker: true });
export function emailWorker(req: Request) {
  if (req.method === "GET") {
    const headers = {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    };
    try {
      if (
        req.headers.get("authorization") !== `Bearer ${env("SCHEDULER_SECRET")}`
      )
        return Response.json(
          { error: "unauthorized" },
          { status: 401, headers },
        );
      return Response.json(
        { emailSafetyRevision: "20261027202242", sending: false },
        { headers },
      );
    } catch {
      return Response.json(
        { error: "configuration" },
        { status: 503, headers },
      );
    }
  }
  return handler(req);
}
if (import.meta.main) Deno.serve(emailWorker);

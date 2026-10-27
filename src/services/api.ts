import { runtime } from "../config/runtime";
import type { ServiceResult } from "../../supabase/shared/contracts";
export async function api<T>(
  name: string,
  body: object,
  base = runtime.api,
): Promise<ServiceResult<T>> {
  if (!base)
    return {
      success: false,
      error: {
        code: "not_configured",
        message: "This connection is not ready yet. Please try again later.",
        retryable: true,
      },
    };
  try {
    const response = await fetch(`${base}/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: runtime.publishableKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as ServiceResult<T>;
    if (typeof result.success !== "boolean")
      throw new Error("invalid_response");
    return result;
  } catch {
    return {
      success: false,
      error: {
        code: "network",
        message:
          "Could not connect. Your details are still here; please try again.",
        retryable: true,
      },
    };
  }
}

import { runtime } from "../config/runtime";
import { api } from "./api";
let memoryToken = "";

// Only a scoped, expiring operator capability enters the browser. Never a server key.
export function operatorTestToken() {
  if (!runtime.paymentTestApi) return "";
  const params = new URLSearchParams(location.hash.slice(1));
  const value = params.get("vault-test");
  if (value) memoryToken = value;
  try {
    if (value) {
      sessionStorage.setItem("jona:paymentTestOperator", value);
      params.delete("vault-test");
      history.replaceState(
        null,
        "",
        `${location.pathname}${location.search}${params.size ? `#${params}` : ""}`,
      );
    }
    return (
      memoryToken || sessionStorage.getItem("jona:paymentTestOperator") || ""
    );
  } catch {
    return memoryToken;
  }
}
// Capture the link before Vault navigation changes the hash; strip it before
// the app starts analytics or loads external resources.
operatorTestToken();
export const checkPaymentTest = (token: string) =>
  api<{ itemSlug: string; priceMinor: number; currency: string }>(
    "payment-test-access",
    { token },
    runtime.paymentTestApi,
  );

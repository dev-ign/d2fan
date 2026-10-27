import type {
  CaptureRequest,
  CaptureResponse,
  CheckoutRequest,
  CheckoutResponse,
  CheckoutStatus,
} from "../../supabase/shared/contracts";
import { api } from "./api";
import { runtime } from "../config/runtime";
export const fanService = {
  capture: (request: CaptureRequest, testing = false) =>
    api<CaptureResponse>(
      "capture-fan",
      request,
      testing ? runtime.paymentTestApi : runtime.api,
    ),
  recover: (email: string) =>
    api<{ message: string }>("recover-access", { email }),
};
export const checkoutService = {
  create: (request: CheckoutRequest) =>
    api<CheckoutResponse>(
      "create-checkout",
      request,
      request.operatorTestToken ? runtime.paymentTestApi : runtime.api,
    ),
  status: (token: string) =>
    api<CheckoutStatus>(
      "checkout-status",
      { token },
      runtime.paymentTestApi || runtime.api,
    ),
};
export const vaultService = {
  reward: (token: string) =>
    api<{ links: { title: string; url: string }[] }>("deliver-lead-magnet", {
      token,
    }),
  redeem: (token: string) =>
    api<{ links: { title: string; url: string }[] }>(
      "redeem-vault",
      { token },
      runtime.paymentTestApi || runtime.api,
    ),
  consent: (token: string, action: "confirm" | "unsubscribe") =>
    api<{ message: string }>("manage-consent", { token, action }),
};

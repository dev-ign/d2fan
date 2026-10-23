import type {
  CaptureRequest,
  CaptureResponse,
  CheckoutRequest,
  CheckoutResponse,
  CheckoutStatus,
} from "../../supabase/shared/contracts";
import { api } from "./api";
export const fanService = {
  capture: (request: CaptureRequest) =>
    api<CaptureResponse>("capture-fan", request),
  recover: (email: string) =>
    api<{ message: string }>("recover-access", { email }),
};
export const checkoutService = {
  create: (request: CheckoutRequest) =>
    api<CheckoutResponse>("create-checkout", request),
  status: (token: string) => api<CheckoutStatus>("checkout-status", { token }),
};
export const vaultService = {
  reward: (token: string) =>
    api<{ links: { title: string; url: string }[] }>("deliver-lead-magnet", {
      token,
    }),
  redeem: (token: string) =>
    api<{ links: { title: string; url: string }[] }>("redeem-vault", { token }),
  consent: (token: string, action: "confirm" | "unsubscribe") =>
    api<{ message: string }>("manage-consent", { token, action }),
};

export type Language = "en" | "es";
export const wallpaperPackId = "la_cultura_wallpapers";
export interface RewardDownload {
  title: string;
  url: string;
  device?: "mobile" | "desktop";
}
export type ServiceResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: string; message: string; retryable: boolean };
    };
export type Attribution = Partial<
  Record<
    | "utm_source"
    | "utm_medium"
    | "utm_campaign"
    | "utm_content"
    | "utm_term"
    | "ref"
    | "release",
    string
  >
>;
export interface CaptureRequest {
  operatorTestToken?: string;
  requestId: string;
  email: string;
  language: Language;
  source: "stay_close" | "support_modal";
  emailMarketing: boolean;
  analyticsConsent: boolean;
  firstTouch: Attribution;
  lastTouch: Attribution;
  rewardId?: typeof wallpaperPackId;
}
export interface CaptureResponse {
  measurementToken?: string;
  captureToken: string;
  eventId: string;
  // not_configured remains readable while older capture functions are deployed.
  delivery: EmailDeliveryStatus | "not_configured";
  magnetUrl?: string;
  rewardId?: typeof wallpaperPackId;
  wallpaperLinks?: RewardDownload[];
}
export type EmailDeliveryStatus =
  | "disabled"
  | "queued"
  | "sent"
  | "failed"
  | "quarantined"
  | "skipped"
  | "unknown";
export interface RecoveryResponse {
  message: string;
  // Older deployed recovery functions return only a generic message.
  delivery?: "disabled" | "requested";
}
export type CheckoutRequest = { requestId: string } & (
  | {
      purpose: "tip";
      amountMinor: number;
      guestToken: string;
      operatorTestToken?: never;
    }
  | {
      purpose: "vault_unlock";
      captureToken: string;
      itemSlug: string;
      amountMinor?: number;
      analyticsConsent: boolean;
      operatorTestToken?: string;
    }
);
export interface CheckoutResponse {
  attemptId: string;
  statusToken: string;
  url: string;
  eventId: string;
}
export interface CheckoutStatus {
  checkoutUrl?: string;
  status:
    | "draft"
    | "pending_payment"
    | "completed"
    | "expired"
    | "cancelled"
    | "failed"
    | "refunded";
  accessToken?: string;
  amountMinor: number;
  currency: string;
  purpose: string;
  eventId?: string;
  itemSlug?: string;
  delivery: EmailDeliveryStatus;
}
export type AnalyticsEvent =
  | "PageView"
  | "Lead"
  | "InitiateCheckout"
  | "Purchase"
  | "VaultUnlock"
  | "DSPClick"
  | "MusicPreviewStarted"
  | "FanSignupViewed"
  | "FanSignupStarted"
  | "RewardDownloadClicked";

import catalog from "../../supabase/shared/catalog.json" with { type: "json" };
export { catalog };
export const runtime = {
  laCulturaWallpapers: import.meta.env.VITE_LA_CULTURA_WALLPAPERS === "true",
  supportEnabled: import.meta.env.VITE_SUPPORT_ENABLED === "true",
  commerceEnabled: import.meta.env.VITE_COMMERCE_ENABLED === "true",
  paymentSupportEmail: import.meta.env.VITE_PAYMENT_SUPPORT_EMAIL?.trim() ?? "",
  paymentTestApi:
    import.meta.env.DEV &&
    location.protocol === "http:" &&
    location.hostname === "localhost" &&
    import.meta.env.VITE_PAYMENT_TEST_API ===
      "http://127.0.0.1:54324/functions/v1"
      ? import.meta.env.VITE_PAYMENT_TEST_API
      : "",
  api: import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
    : "",
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  pixelId: import.meta.env.VITE_META_PIXEL_ID ?? "",
};

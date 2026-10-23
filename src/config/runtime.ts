import catalog from "../../supabase/shared/catalog.json";
export { catalog };
export const runtime = {
  api: import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
    : "",
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  pixelId: import.meta.env.VITE_META_PIXEL_ID ?? "",
};

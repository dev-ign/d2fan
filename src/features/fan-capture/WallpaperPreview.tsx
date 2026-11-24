import { useLocale } from "../../hooks/useLocale";

export function WallpaperPreview() {
  const { t } = useLocale();
  return (
    <div className="wallpaper-preview">
      <img
        src="/assets/la-cultura-desktop-preview.webp"
        alt={t.wallpapers.desktopPreview}
        width="576"
        height="324"
        loading="lazy"
      />
      <img
        src="/assets/la-cultura-mobile-preview.webp"
        alt={t.wallpapers.mobilePreview}
        width="184"
        height="400"
        loading="lazy"
      />
    </div>
  );
}

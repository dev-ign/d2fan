import { useLocale } from "../../hooks/useLocale";

export function WallpaperPreview() {
  const { t } = useLocale();
  return (
    <div className="wallpaper-preview">
      <img
        src="/assets/la-cultura-desktop-preview-blurred.webp"
        alt={t.wallpapers.desktopPreview}
        width="320"
        height="180"
        loading="lazy"
      />
      <img
        src="/assets/la-cultura-mobile-preview-blurred.webp"
        alt={t.wallpapers.mobilePreview}
        width="115"
        height="250"
        loading="lazy"
      />
    </div>
  );
}

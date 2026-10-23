import type { MusicRelease } from "./types";

export interface ResolvedReleaseTheme {
  image?: string;
  overlayColor: string;
  overlayOpacity: number;
  backgroundPosition: string;
}
export const RELEASE_THEME_DURATION_MS = 600;
const defaultColor = "#180e12";
// The dimmest normal text on themed surfaces uses --bone-1 (#bdb4a8).
const foreground = [189, 180, 168];
function luminance(rgb: number[]) {
  return rgb
    .map((value) => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
}
const channels = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
export function themeContrast(color: string, opacity: number): number {
  const brightest = channels(color).map(
    (value) => value * opacity + 255 * (1 - opacity),
  );
  return (luminance(foreground) + 0.05) / (luminance(brightest) + 0.05);
}
export function resolveReleaseTheme(
  release: Pick<MusicRelease, "coverArt" | "theme">,
): ResolvedReleaseTheme {
  const requested = release.theme;
  let color = /^#[0-9a-f]{6}$/i.test(requested?.overlayColor ?? "")
    ? requested!.overlayColor!
    : defaultColor;
  // Even a white cover must keep the shared muted foreground at AA contrast.
  if (themeContrast(color, 1) < 4.5) color = defaultColor;
  let opacity = Number.isFinite(requested?.overlayOpacity)
    ? Math.min(1, Math.max(0, requested!.overlayOpacity!))
    : 0.8;
  while (opacity < 1 && themeContrast(color, opacity) < 4.5)
    opacity = Math.min(1, opacity + 0.01);
  return {
    image:
      requested?.backgroundImage?.trim() ||
      release.coverArt?.trim() ||
      undefined,
    overlayColor: color,
    overlayOpacity: opacity,
    backgroundPosition: requested?.backgroundPosition?.trim() || "center",
  };
}
export function releaseThemeKey(theme: ResolvedReleaseTheme) {
  return JSON.stringify([
    theme.image,
    theme.overlayColor,
    theme.overlayOpacity,
    theme.backgroundPosition,
  ]);
}

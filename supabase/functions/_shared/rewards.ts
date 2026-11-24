import type { RewardDownload } from "../../shared/contracts.ts";
import { signPrivateObject } from "./platform.ts";

const wallpaperObjects = {
  mobile: "rewards/la-cultura/la-cultura-mobile-1206x2622.jpg",
  desktop: "rewards/la-cultura/la-cultura-desktop-3840x2160.jpg",
};

export function signWallpaperPack(): Promise<RewardDownload[]> {
  return Promise.all(
    (["mobile", "desktop"] as const).map(async (device) => ({
      device,
      title: `La Cultura ${device} wallpaper`,
      url: await signPrivateObject(wallpaperObjects[device]),
    })),
  );
}

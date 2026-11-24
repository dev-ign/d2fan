import type { RewardDownload } from "../../shared/contracts.ts";
import { signedFile } from "./platform.ts";

export function signWallpaperPack(): Promise<RewardDownload[]> {
  return Promise.all(
    (["mobile", "desktop"] as const).map(async (device) => ({
      device,
      title: `La Cultura ${device} wallpaper`,
      url: await signedFile(`la-cultura-${device}`),
    })),
  );
}

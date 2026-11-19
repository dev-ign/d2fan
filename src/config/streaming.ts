import type { MusicRelease } from "../domain/types";

export const platformNames: Record<
  keyof MusicRelease["streamingLinks"],
  string
> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtube: "YouTube Music",
  amazonMusic: "Amazon Music",
  tidal: "TIDAL",
};

export const streamingPlatforms = Object.keys(
  platformNames,
) as (keyof typeof platformNames)[];

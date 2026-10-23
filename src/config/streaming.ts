import type { MusicRelease } from "../domain/types";

export const platformNames: Record<
  keyof MusicRelease["streamingLinks"],
  string
> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  youtube: "YouTube Music",
  amazonMusic: "Amazon Music",
};

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

const platformDetails = {
  spotify: ["https://open.spotify.com", "/assets/spotify.svg"],
  appleMusic: ["https://music.apple.com", "/assets/apple-music.svg"],
  youtube: ["https://music.youtube.com", "/assets/youtube-music.svg"],
  amazonMusic: ["https://music.amazon.com", "/assets/amazon-music.svg"],
  tidal: ["https://tidal.com", "/assets/tidal.svg"],
} satisfies Record<keyof typeof platformNames, [string, string]>;

export function getStreamingLinks(release: MusicRelease) {
  return streamingPlatforms.flatMap((platform) => {
    const href = release.streamingLinks[platform];
    const [origin, icon] = platformDetails[platform];
    if (!href) return [];
    try {
      const url = new URL(href);
      if (url.origin !== origin || url.username || url.password) return [];
      return [{ platform, href, icon, name: platformNames[platform] }];
    } catch {
      return [];
    }
  });
}

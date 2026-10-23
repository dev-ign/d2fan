import { artist, releases, vaultItems } from "../data/content";
import type { ContentRepository } from "../domain/types";

export const localContentRepository: ContentRepository = {
  async getArtistBySlug(slug) {
    return slug === artist.slug ? artist : null;
  },
  async listReleases(artistId) {
    return releases.filter((release) => release.artistId === artistId);
  },
  async getReleaseBySlug(artistId, slug) {
    return (
      releases.find(
        (release) => release.artistId === artistId && release.slug === slug,
      ) ?? null
    );
  },
  async listVault(artistId) {
    return vaultItems.filter((item) => item.artistId === artistId);
  },
};

export interface Artist {
  id: string;
  slug: string;
  displayName: string;
  biography: { short: string; full: string };
  heroImage: string;
  featuredReleaseId: string;
}

export interface MusicRelease {
  id: string;
  artistId: string;
  slug: string;
  title: string;
  releaseDate: string;
  artworkUrl: string;
  previewUrl?: string;
  featured: boolean;
  streamingLinks: Partial<
    Record<"spotify" | "appleMusic" | "youtube" | "amazonMusic", string>
  >;
}

export interface VaultItem {
  id: string;
  artistId: string;
  slug: string;
  title: string;
  type: "audio" | "video" | "image" | "download";
  label: string;
  description: string;
  artworkUrl: string;
  priceMinor: number;
  currency: "usd";
  releaseSlug?: string;
  status: "coming-soon" | "available";
}

export interface ContentRepository {
  getArtistBySlug(slug: string): Promise<Artist | null>;
  listReleases(artistId: string): Promise<MusicRelease[]>;
  getReleaseBySlug(
    artistId: string,
    slug: string,
  ): Promise<MusicRelease | null>;
  listVault(artistId: string): Promise<VaultItem[]>;
}

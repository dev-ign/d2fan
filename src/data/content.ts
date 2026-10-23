import type { Artist, MusicRelease, VaultItem } from "../domain/types";
import { catalog } from "../config/runtime";

export const artist: Artist = {
  id: catalog.artistId,
  slug: "jona-ferreira",
  displayName: "Jona Ferreira",
  heroImage: "/assets/raw-hero-1.webp",
  featuredReleaseId: "accion",
  biography: {
    short:
      "Jona Ferreira is a Dominican-American artist and songwriter born and raised in Boston, creating music for every mood.",
    full: "Jona Ferreira is a Dominican-American artist and songwriter born and raised in Boston, creating music for every mood. Moving between reggaeton, dancehall, bachata, melodic urbano and darker Latin sounds, Jona’s catalog can be romantic, emotional, energetic or street — depending on the record. His approach is less about staying inside one genre and more about capturing a feeling.",
  },
};

const apple = (album: string, track: string) =>
  `https://music.apple.com/us/album/${album}?i=${track}`;

export const releases: MusicRelease[] = [
  {
    id: "accion",
    artistId: artist.id,
    slug: "accion",
    title: "Acción",
    releaseDate: "2026-09-25",
    coverArt: "/assets/raw-music-1.webp",
    previewUrl: "/assets/preview-accion.m4a",
    featured: true,
    streamingLinks: { appleMusic: apple("accion/6810901540", "6810901541") },
  },
  {
    id: "darte-nota",
    artistId: artist.id,
    slug: "darte-nota",
    title: "Darte Nota",
    releaseDate: "2026-09-11",
    coverArt: "/assets/raw-music-4.webp",
    previewUrl: "/assets/preview-darte-nota.m4a",
    featured: false,
    streamingLinks: {
      appleMusic: apple("darte-nota/6803679812", "6803684303"),
    },
  },
  {
    id: "contenta",
    artistId: artist.id,
    slug: "contenta",
    title: "Contenta",
    releaseDate: "2026-08-27",
    coverArt: "/assets/cover-contenta.webp",
    previewUrl: "/assets/preview-contenta.m4a",
    featured: false,
    streamingLinks: { appleMusic: apple("contenta/6800878990", "6800878991") },
  },
  {
    id: "cafe",
    artistId: artist.id,
    slug: "cafe",
    title: "Café",
    releaseDate: "2026-08-13",
    coverArt: "/assets/raw-vault-1.webp",
    previewUrl: "/assets/preview-cafe.m4a",
    featured: false,
    streamingLinks: { appleMusic: apple("caf%C3%A9/6798324063", "6798324064") },
  },
  {
    id: "caramelo",
    artistId: artist.id,
    slug: "caramelo",
    title: "Caramelo",
    releaseDate: "2026-06-24",
    coverArt: "/assets/raw-music-3.webp",
    previewUrl: "/assets/preview-caramelo.m4a",
    featured: false,
    streamingLinks: { appleMusic: apple("caramelo/6773485931", "6773485933") },
  },
  {
    id: "viaje-astral",
    artistId: artist.id,
    slug: "viaje-astral",
    title: "Viaje Astral",
    releaseDate: "2026-04-20",
    coverArt: "/assets/raw-music-2.webp",
    previewUrl: "/assets/preview-viaje-astral.m4a",
    featured: false,
    streamingLinks: {
      appleMusic: apple("viaje-astral/1884668562", "1884668563"),
    },
  },
];

const vaultMetadata = [
  {
    id: "untitled-demo",
    artistId: artist.id,
    slug: "untitled-demo",
    title: "UNTITLED DEMO",
    type: "audio",
    label: "UNRELEASED",
    description: "Voice memo → studio · ▮▮:▮▮",
    artworkUrl: "/assets/raw-vault-2.webp",
  },
  {
    id: "cafe-studio",
    artistId: artist.id,
    slug: "cafe-studio",
    title: "CAFÉ — IN THE STUDIO",
    type: "video",
    label: "BEHIND THE SONG",
    description: "Session footage · ▮▮ min",
    artworkUrl: "/assets/raw-vault-1.webp",
  },
  {
    id: "accion-wallpaper",
    artistId: artist.id,
    slug: "accion-wallpaper",
    title: "Acción — hi-res artwork & wallpapers",
    type: "download",
    label: "DOWNLOAD",
    description: "Hi-res artwork & wallpapers",
    artworkUrl: "/assets/raw-vault-3.webp",
  },
  {
    id: "shorty-cut",
    artistId: artist.id,
    slug: "shorty-cut",
    title: "Shorty — extended video",
    type: "video",
    label: "DIRECTOR’S CUT",
    description: "Extended video",
    artworkUrl: "/assets/raw-vault-4.webp",
  },
];

export const vaultItems: VaultItem[] = vaultMetadata.map((item) => {
  const product = catalog.vault.find((p) => p.slug === item.slug)!;
  return {
    ...item,
    type: item.type as VaultItem["type"],
    priceMinor: product.priceMinor,
    currency: "usd",
    status: product.availability === "available" ? "available" : "coming-soon",
    releaseSlug: product.releaseSlug ?? undefined,
  };
});

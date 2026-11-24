import type { Artist, MusicRelease, VaultItem } from "../domain/types";
import catalog from "../../supabase/shared/catalog.json" with { type: "json" };

export const artist: Artist = {
  id: catalog.artistId,
  slug: "jona-ferreira",
  displayName: "Jona Ferreira",
  heroImage: "/assets/raw-hero-1.webp",
  featuredReleaseId: "sayyouluvme",
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
    id: "sayyouluvme",
    artistId: artist.id,
    slug: "sayyouluvme",
    title: "SayYouLuvMe",
    artistCredit: "Jona Ferreira & SBFaraon",
    releaseDate: "2026-11-27",
    publicationStatus: "upcoming",
    distributionStatus: "approved",
    upc: "708208533336",
    catalogNumber: "CAT2529872",
    campaignId: "sayyouluvme_2026",
    preserveDisplayCase: true,
    coverArt: "/assets/sayyouloveme-cover2.jpg",
    streamingLinks: {},
  },
  {
    id: "shorty",
    artistId: artist.id,
    slug: "shorty",
    title: "Shorty",
    artistCredit: "Jona Ferreira & Sbfaraon",
    releaseDate: "2026-10-30",
    coverArt: "/assets/cover-shorty.webp",
    previewUrl: "/assets/preview-shorty.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/46UfoClXDXeEmP2LE5wmfG",
      appleMusic: apple("shorty/6820156512", "6820156513"),
      youtube: "https://music.youtube.com/watch?v=SPqO99mRY_M",
      amazonMusic:
        "https://music.amazon.com/albums/B0HM864LM5?trackAsin=B0HM8BM5GX",
      tidal: "https://tidal.com/track/567981978",
    },
  },
  {
    id: "accion",
    artistId: artist.id,
    slug: "accion",
    title: "Acción",
    releaseDate: "2026-09-25",
    coverArt: "/assets/raw-music-1.webp",
    previewUrl: "/assets/preview-accion.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/5eEnWv2dTIDEyOZ3vzHzTL",
      appleMusic: apple("accion/6810901540", "6810901541"),
      youtube: "https://music.youtube.com/watch?v=d2u2baaV01I",
      amazonMusic:
        "https://music.amazon.com/albums/B0HJG1C9HP?trackAsin=B0HJG79YM4",
      tidal: "https://tidal.com/track/560214280",
    },
  },
  {
    id: "darte-nota",
    artistId: artist.id,
    slug: "darte-nota",
    title: "Darte Nota",
    artistCredit: "Jona Ferreira & Sbfaraon",
    releaseDate: "2026-09-11",
    coverArt: "/assets/raw-music-4.webp",
    previewUrl: "/assets/preview-darte-nota.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/2YY10QFY13plqd8CeW0ag6",
      appleMusic: apple("darte-nota/6803679812", "6803684303"),
      youtube: "https://music.youtube.com/watch?v=0kGl9-ldy1Y",
      amazonMusic:
        "https://music.amazon.com/albums/B0HFZ228WR?trackAsin=B0HFYFR449",
      tidal: "https://tidal.com/track/554229876",
    },
  },
  {
    id: "contenta",
    artistId: artist.id,
    slug: "contenta",
    title: "Contenta",
    artistCredit: "Jona Ferreira & Sbfaraon",
    releaseDate: "2026-08-27",
    coverArt: "/assets/cover-contenta.webp",
    previewUrl: "/assets/preview-contenta.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/48mPIZq3rykMFldSWKg744",
      appleMusic: apple("contenta/6800878990", "6800878991"),
      youtube: "https://music.youtube.com/watch?v=NVV84A7efkA",
      amazonMusic:
        "https://music.amazon.com/albums/B0HF1Z79Z9?trackAsin=B0HF219BT3",
      tidal: "https://tidal.com/track/551857564",
    },
  },
  {
    id: "cafe",
    artistId: artist.id,
    slug: "cafe",
    title: "Café",
    releaseDate: "2026-08-13",
    coverArt: "/assets/raw-vault-1.webp",
    previewUrl: "/assets/preview-cafe.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/4dcmBUV6VqzSBzw20aGl5B",
      appleMusic: apple("caf%C3%A9/6798324063", "6798324064"),
      youtube: "https://music.youtube.com/watch?v=C-loLqHpajI",
      amazonMusic:
        "https://music.amazon.com/albums/B0HD1GJ752?trackAsin=B0HD17VQDZ",
      tidal: "https://tidal.com/track/549469831",
    },
  },
  {
    id: "caramelo",
    artistId: artist.id,
    slug: "caramelo",
    title: "Caramelo",
    artistCredit: "Jona Ferreira & Sbfaraon",
    releaseDate: "2026-06-24",
    coverArt: "/assets/raw-music-3.webp",
    previewUrl: "/assets/preview-caramelo.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/2qimsvScMeH5XCiTOJpr7F",
      appleMusic: apple("caramelo/6773485931", "6773485933"),
      youtube: "https://music.youtube.com/watch?v=sb6EryPbY_A",
      amazonMusic:
        "https://music.amazon.com/albums/B0H31RQSRH?trackAsin=B0H31FYGVK",
      tidal: "https://tidal.com/track/528205807",
    },
  },
  {
    id: "viaje-astral",
    artistId: artist.id,
    slug: "viaje-astral",
    title: "Viaje Astral",
    artistCredit: "Jona Ferreira, Andre Mateo & Sbfaraon",
    releaseDate: "2026-04-20",
    coverArt: "/assets/raw-music-2.webp",
    previewUrl: "/assets/preview-viaje-astral.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/album/7tRuZO7ExFvA1PYrV0sZlc",
      appleMusic: apple("viaje-astral/1884668562", "1884668563"),
      youtube: "https://music.youtube.com/watch?v=Dko4QsV9VEk",
      amazonMusic:
        "https://music.amazon.com/albums/B0GSC9LDPK?trackAsin=B0GSBMPT5Z",
      tidal: "https://tidal.com/track/506537887",
    },
  },
  {
    id: "lalo",
    artistId: artist.id,
    slug: "lalo",
    title: "Lalo",
    releaseDate: "2026-05-20",
    coverArt: "/assets/cover-lalo.webp",
    previewUrl: "/assets/preview-lalo.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/track/2x1GqWEEuPrYxcUsyBayhl",
      appleMusic: apple("lalo/1895975584", "6765511360"),
      youtube: "https://music.youtube.com/watch?v=vYeZ5T8t7aU",
      amazonMusic:
        "https://music.amazon.com/albums/B0GZ5JNL18?trackAsin=B0GZ5YBC8H",
      tidal: "https://tidal.com/track/520596120",
    },
  },
  {
    id: "sunday",
    artistId: artist.id,
    slug: "sunday",
    title: "Sunday",
    artistCredit: "Jona Ferreira & Sbfaraon",
    releaseDate: "2026-03-15",
    coverArt: "/assets/cover-sunday.webp",
    previewUrl: "/assets/preview-sunday.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/track/4z87zEyb9WCJ6xMiTnAOCx",
      appleMusic: apple("sunday/1875949492", "1875949493"),
      youtube: "https://music.youtube.com/watch?v=kYmAof1cyGc",
      tidal: "https://tidal.com/track/497498559",
    },
  },
  {
    id: "fria",
    artistId: artist.id,
    slug: "fria",
    title: "Fria",
    releaseDate: "2026-02-18",
    coverArt: "/assets/cover-fria.webp",
    previewUrl: "/assets/preview-fria.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/track/0FnbrH0Lc1iR2SnFZ4K3IQ",
      appleMusic: apple("fria/1866682775", "1866682776"),
      youtube: "https://music.youtube.com/watch?v=pMadUoIWlog",
      tidal: "https://tidal.com/track/487275570",
    },
  },
  {
    id: "me-avisas",
    artistId: artist.id,
    slug: "me-avisas",
    title: "Me Avisas",
    releaseDate: "2026-01-21",
    coverArt: "/assets/cover-me-avisas.webp",
    previewUrl: "/assets/preview-me-avisas.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/track/3Ot9005WUBVhQ438wEZaf3",
      appleMusic: apple("me-avisas/1856629737", "1856629738"),
      youtube: "https://music.youtube.com/watch?v=bo82HYgzAAo",
      tidal: "https://tidal.com/track/477327896",
    },
  },
  {
    id: "12-uvas",
    artistId: artist.id,
    slug: "12-uvas",
    title: "12 Uvas",
    artistCredit: "Jona Ferreira, Andre Mateo & Sbfaraon",
    releaseDate: "2025-12-26",
    coverArt: "/assets/cover-12-uvas.webp",
    previewUrl: "/assets/preview-12-uvas.m4a",
    streamingLinks: {
      spotify: "https://open.spotify.com/track/7cJsxOOzckYjh2Hw6K0ofB",
      appleMusic: apple("12-uvas/1851082318", "1851082320"),
      youtube: "https://music.youtube.com/watch?v=tbfB_veQz1I",
      amazonMusic:
        "https://music.amazon.com/albums/B0FZZGNF8T?trackAsin=B0G1117WK8",
      tidal: "https://tidal.com/track/471989340",
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

export const contentFormats = {
  ig_reel: { platform: "instagram", label: "Instagram Reel" },
  ig_story: { platform: "instagram", label: "Instagram Story" },
  ig_feed: { platform: "instagram", label: "Instagram feed post" },
  tt_video: { platform: "tiktok", label: "TikTok video" },
  tt_photo: { platform: "tiktok", label: "TikTok photo post" },
  yt_short: { platform: "youtube", label: "YouTube Short" },
} as const;

export const contentStatuses = {
  idea: "Idea",
  draft: "Draft",
  ready: "Ready",
  published: "Published manually",
  archived: "Archived",
} as const;

export const contentLanguages = {
  en: "English",
  es: "Spanish",
  bilingual: "Bilingual",
} as const;

export const easternDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    now,
  );

export const contentPageSize = 25;

export interface ContentFields {
  title: string;
  release_slug: string | null;
  pillar: string;
  language: keyof typeof contentLanguages;
  hook: string;
  caption: string;
  cta: string;
  format: keyof typeof contentFormats;
  status: keyof typeof contentStatuses;
  planned_on: string | null;
  published_on: string | null;
  post_url: string | null;
  media_url: string | null;
}

export interface StudioContentItem extends ContentFields {
  id: string;
  revision: number;
}

export interface ContentPage {
  items: StudioContentItem[];
  has_more: boolean;
  week_count: number;
  queue: Record<"idea" | "draft" | "ready" | "published" | "overdue", number>;
}

export interface ContentAcquisition {
  requests: number;
  contacts: number;
}

export type ContentRequest =
  | {
      view: "content";
      week: string | null;
      status: keyof typeof contentStatuses | "active";
      page: number;
    }
  | {
      view: "content_save";
      id: string;
      revision: number | null;
      fields: ContentFields;
    }
  | { view: "content_acquisition"; id: string };

// Letters keep the generated public tag within the capture contract's privacy filter.
export const placementTag = (id: string) =>
  "studio_" +
  id
    .replaceAll("-", "")
    .replace(/[0-9a-f]/g, (hex) => String.fromCharCode(97 + parseInt(hex, 16)));

export function approvedMediaUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /\.(mp4|webm|jpe?g|png|webp)$/i.test(url.pathname)
    )
      return url;
  } catch {
    return;
  }
}

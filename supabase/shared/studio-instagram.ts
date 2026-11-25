export interface InstagramStatus {
  status:
    "setup_required" | "disconnected" | "pending" | "connected" | "reauthorize";
  profile: { id: string; username: string; avatar: string | null } | null;
  syncedAt: string | null;
}

export interface InstagramMedia {
  id: string;
  permalink: string;
  timestamp: string;
  format: string;
  caption: string;
  thumbnail: string | null;
  placementId?: string;
}

export interface InstagramMediaPage {
  items: InstagramMedia[];
  next: string | null;
}

export type InstagramRequest =
  | { view: "instagram_status" | "instagram_start" | "instagram_disconnect" }
  | { view: "instagram_finish"; code: string; state: string }
  | { view: "instagram_media"; after: string | null }
  | {
      view: "instagram_associate";
      placementId: string;
      mediaId: string;
      after: string | null;
    };

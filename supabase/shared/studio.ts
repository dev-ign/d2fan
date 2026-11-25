export interface StudioReadiness {
  supportEnabled: boolean;
  vaultEnabled: boolean;
  rewardEmailEnabled: boolean;
  marketingEmailEnabled: boolean;
}

export interface StudioReport {
  as_of: string;
  reward_requests_30_days: number;
  totals: {
    captured_contacts: number;
    confirmed_marketing_subscribers: number;
  };
  last_30_days: { new_contacts: number; first_confirmations: number };
  daily_eastern: {
    day: string;
    new_contacts: number;
    first_confirmations: number;
  }[];
  campaign: string;
  campaign_totals: StudioCampaignTotals;
  campaign_breakdown: (StudioCampaignTotals & {
    acquisition_source: string;
    medium: string;
    creative: string;
    landing_path: string | null;
    associated_release: string | null;
    language: string;
  })[];
  live_revenue_by_currency: {
    currency: string;
    verified_payments: number;
    linked_paying_fans: number;
    guest_payments: number;
    gross_minor: number;
    full_refunds_minor: number;
    payments_with_unknown_refund_amount: number;
    net_after_refunds_minor: number | null;
  }[];
  operations: { reward_email_accepted: number; reward_email_failed: number };
}

interface StudioCampaignTotals {
  requests: number;
  contacts: number;
  contacts_with_confirmed_request: number;
}

export interface StudioFans {
  total: number;
  items: {
    id: string;
    email: string;
    language: "en" | "es";
    created_at: string;
    updated_at: string;
    email_verified_at: string | null;
    acquisition_source: string | null;
    first_release: string | null;
    recent_release: string | null;
    consent: "confirmed" | "pending" | "revoked" | "unverified" | "none";
  }[];
}

export type StudioRequest =
  | { view: "session" }
  | { view: "report"; campaign: string }
  | { view: "fans"; search: string; page: number };

export const studioPageSize = 25;

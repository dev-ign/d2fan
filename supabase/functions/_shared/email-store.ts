import { catalog, db, rpc } from "./platform.ts";
import type { OutgoingEmail } from "./resend.ts";
export interface EmailJob {
  id: string;
  fan_id: string | null;
  kind: string;
  dedupe_key: string;
  attempts: number;
  created_at: string;
  payload: Record<string, unknown>;
  lease_token: string;
  lease_until: string;
  email_policy_version: number;
  first_provider_attempt_at: string | null;
  retry_deadline_at: string | null;
  email_links_expire_at: string | null;
}
export interface Purchase {
  id: string;
  purpose: string;
  status: string;
  amount_minor: number;
  currency: string;
  vault_item_slug: string | null;
}
export interface EmailStore {
  claim(id: string | null, marketing: boolean): Promise<EmailJob[]>;
  begin(
    job: EmailJob,
    body: OutgoingEmail,
    expires: string,
    marketing: boolean,
  ): Promise<EmailJob | null>;
  finish(
    job: EmailJob,
    outcome: "accepted" | "retry" | "failed" | "skipped",
    provider?: string,
    error?: string,
  ): Promise<boolean>;
  fan(
    id: string,
  ): Promise<{ email_normalized: string; preferred_language: string }>;
  permission(id: string): Promise<boolean>;
  purchases(job: EmailJob): Promise<Purchase[]>;
  reminderEligible(job: EmailJob): Promise<boolean>;
  createTest(run: string, recipient: string, language: string): Promise<string>;
  maintenance(marketing: boolean): Promise<void>;
}
export function emailStore(): EmailStore {
  return {
    claim: (id, marketing) =>
      rpc("claim_email_jobs", { p_job: id, p_marketing: marketing }),
    async begin(job, body, expires, marketing) {
      const rows = await rpc<EmailJob[]>("begin_email_dispatch", {
        p_job: job.id,
        p_lease: job.lease_token,
        p_body: body,
        p_links_expire: expires,
        p_marketing: marketing,
      });
      return rows[0] || null;
    },
    finish: (job, outcome, provider, error) =>
      rpc("finish_email_dispatch", {
        p_job: job.id,
        p_lease: job.lease_token,
        p_outcome: outcome,
        p_provider: provider || null,
        p_error: error || null,
      }),
    async fan(id) {
      const { data, error } = await db()
        .from("fans")
        .select("email_normalized,preferred_language")
        .eq("id", id)
        .eq("artist_id", catalog.artistId)
        .single();
      if (error || !data) throw new Error("database_unavailable");
      return data;
    },
    permission: (id) => rpc("email_permission", { p_fan: id }),
    async purchases(job) {
      let query = db()
        .from("purchases")
        .select("id,purpose,status,amount_minor,currency,vault_item_slug")
        .eq("artist_id", catalog.artistId)
        .eq("fan_id", job.fan_id)
        .in("status", ["paid", "partially_refunded"]);
      if (job.kind === "purchase")
        query = query.eq("id", job.payload.purchaseId);
      const { data, error } = await query;
      if (error) throw new Error("database_unavailable");
      return data || [];
    },
    async reminderEligible(job) {
      const { data: attempt, error } = await db()
        .from("checkout_attempts")
        .select("id,status,created_at")
        .eq("id", job.payload.attemptId)
        .eq("artist_id", catalog.artistId)
        .eq("fan_id", job.fan_id)
        .single();
      if (error || !attempt) throw new Error("database_unavailable");
      const { data: paid, error: purchaseError } = await db()
        .from("purchases")
        .select("id")
        .eq("artist_id", catalog.artistId)
        .eq("fan_id", job.fan_id)
        .gte("paid_at", attempt.created_at)
        .limit(1);
      if (purchaseError) throw new Error("database_unavailable");
      return attempt.status === "expired" && !paid?.length;
    },
    createTest: (run, recipient, language) =>
      rpc("create_controlled_email_test", {
        p_run: run,
        p_recipient: recipient,
        p_language: language,
      }),
    async maintenance(marketing) {
      const { error } = await db()
        .from("checkout_attempts")
        .update({ status: "expired" })
        .in("status", ["draft", "pending_payment"])
        .lt("expires_at", new Date().toISOString());
      if (error) throw new Error("database_unavailable");
      if (marketing) await rpc("schedule_reminders", {});
    },
  };
}

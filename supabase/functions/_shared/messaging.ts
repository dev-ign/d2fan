import {
  db,
  env,
  rpc,
  token,
  site,
  signedFile,
  catalog,
  digest,
} from "./platform.ts";
import { template } from "./templates.ts";
interface Job {
  id: string;
  fan_id: string;
  kind: string;
  dedupe_key: string;
  attempts: number;
  created_at: string;
  payload: Record<string, unknown>;
}
interface Outgoing {
  from: string;
  to: string[];
  subject: string;
  text: string;
  headers?: Record<string, string>;
}
export async function runMessaging() {
  const client = db();
  // Stale drafts never imply payment; expire only after the Stripe session's configured deadline.
  const { error: expiryError } = await client
    .from("checkout_attempts")
    .update({ status: "expired" })
    .in("status", ["draft", "pending_payment"])
    .lt("expires_at", new Date().toISOString());
  if (expiryError) throw new Error("database_unavailable");
  await rpc("schedule_reminders", {});
  const { error: staleError } = await client
    .from("delivery_jobs")
    .update({ status: "failed", last_error: "retry_limit" })
    .eq("status", "processing")
    .gte("attempts", 6)
    .lt("lease_until", new Date().toISOString());
  if (staleError) throw new Error("database_unavailable");
  const jobs = await rpc<Job[]>("claim_jobs", {});
  const result = { sent: 0, failed: 0, skipped: 0 };
  for (const job of jobs) {
    try {
      const { data: fan, error } = await client
        .from("fans")
        .select("email_normalized,preferred_language")
        .eq("id", job.fan_id)
        .eq("artist_id", catalog.artistId)
        .single();
      if (error || !fan) throw new Error("database_unavailable");
      if (job.kind === "welcome" || job.kind === "reminder") {
        if (!(await rpc<boolean>("email_permission", { p_fan: job.fan_id }))) {
          await finish(job, "skipped");
          result.skipped++;
          continue;
        }
      }
      if (job.kind === "reminder") {
        const { data: a, error: aError } = await client
          .from("checkout_attempts")
          .select("id,status,created_at")
          .eq("id", job.payload.attemptId)
          .single();
        if (aError || !a) throw new Error("database_unavailable");
        const { data: paid, error: pError } = await client
          .from("purchases")
          .select("id")
          .eq("fan_id", job.fan_id)
          .gte("paid_at", a.created_at)
          .limit(1);
        if (pError) throw new Error("database_unavailable");
        if (a.status !== "expired" || paid?.length) {
          await finish(job, "skipped");
          result.skipped++;
          continue;
        }
      }
      let providerId: string;
      if (job.kind === "meta") {
        const { data: current, error: currentError } = await client
          .from("delivery_jobs")
          .select("status")
          .eq("id", job.id)
          .single();
        if (currentError) throw new Error("database_unavailable");
        if (current.status === "skipped") {
          result.skipped++;
          continue;
        }

        const body = {
          access_token: env("META_CAPI_ACCESS_TOKEN"),
          test_event_code: Deno.env.get("META_TEST_EVENT_CODE") || undefined,
          data: [
            {
              event_name: job.payload.event,
              event_id: job.payload.eventId,
              event_time: Math.floor(new Date(job.created_at).getTime() / 1000),
              action_source: "website",
              event_source_url: site(),
              user_data: { em: [await digest(fan.email_normalized)] },
              custom_data: {
                value:
                  typeof job.payload.amountMinor === "number"
                    ? job.payload.amountMinor / 100
                    : undefined,
                currency: job.payload.currency,
              },
            },
          ],
        };
        const response = await fetch(
          `https://graph.facebook.com/${env("META_API_VERSION")}/${env("META_PIXEL_ID")}/events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) throw new Error("provider_rejected");
        providerId = "meta-accepted";
      } else {
        let outgoing = job.payload.emailBody as Outgoing | undefined;
        if (!outgoing) {
          const links: string[] = [];
          const issued = Math.floor(new Date(job.created_at).getTime() / 1000);
          const link = async (
            scope: "reward" | "confirm" | "unsubscribe" | "access",
            sub: string,
            ttl = 172800,
          ) =>
            `${site()}/#${scope}=${encodeURIComponent(await token(scope, sub, ttl, issued))}`;
          if (job.kind === "capture") {
            if (job.payload.magnet) {
              await signedFile("lead-magnet");
              links.push(`Exclusive: ${await link("reward", job.fan_id)}`);
            }
            if (job.payload.confirm)
              links.push(
                `Confirm / Confirmar: ${await link("confirm", job.fan_id)}`,
              );
          }
          if (job.kind === "purchase" || job.kind === "recovery") {
            let query = client
              .from("purchases")
              .select("id,purpose,status,amount_minor,currency,vault_item_slug")
              .eq("artist_id", catalog.artistId)
              .eq("fan_id", job.fan_id)
              .in("status", ["paid", "partially_refunded"]);
            if (job.kind === "purchase")
              query = query.eq("id", job.payload.purchaseId);
            const { data: purchases, error: pError } = await query;
            if (pError) throw new Error("database_unavailable");
            if (!purchases?.length) {
              await finish(job, "skipped");
              result.skipped++;
              continue;
            }
            for (const p of purchases) {
              links.push(
                `${(p.amount_minor / 100).toFixed(2)} ${p.currency.toUpperCase()} · ${p.vault_item_slug ?? "Artist support"}`,
              );
              if (p.purpose === "vault_unlock")
                links.push(await link("access", p.id));
            }
          }
          if (job.kind === "welcome" || job.kind === "reminder") {
            links.push(
              job.kind === "reminder"
                ? `${site()}/#status=${encodeURIComponent(await token("status", String(job.payload.attemptId), 7 * 86400, issued))}`
                : site(),
            );
            links.push(
              `Unsubscribe / Cancelar: ${await link("unsubscribe", job.fan_id, 365 * 86400)}`,
            );
            links.push(env("BUSINESS_POSTAL_ADDRESS"));
          }
          const content = template(
            job.kind,
            fan.preferred_language,
            links,
            env("SUPPORT_EMAIL"),
          );
          outgoing = {
            from: env("EMAIL_FROM_ADDRESS"),
            to: [fan.email_normalized],
            ...content,
          };
          // Freeze the payload before sending. Provider idempotency requires identical retry bodies.
          const { error: bodyError } = await client
            .from("delivery_jobs")
            .update({ payload: { ...job.payload, emailBody: outgoing } })
            .eq("id", job.id);
          if (bodyError) throw new Error("database_unavailable");
        }
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env("EMAIL_PROVIDER_API_KEY")}`,
            "Content-Type": "application/json",
            "Idempotency-Key": job.dedupe_key,
          },
          body: JSON.stringify(outgoing),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("provider_rejected");
        const receipt = (await response.json()) as { id: string };
        providerId = receipt.id;
      }
      await finish(job, "sent", providerId);
      result.sent++;
    } catch {
      if (job.kind !== "meta") {
        await client.from("fan_events").upsert(
          {
            artist_id: catalog.artistId,
            fan_id: job.fan_id,
            event_type: "email_delivery_failed",
            event_id: `failed:${job.id}:${job.attempts}`,
            metadata: { attempt: job.attempts },
          },
          { onConflict: "event_id", ignoreDuplicates: true },
        );
      }
      const { error } = await client
        .from("delivery_jobs")
        .update({
          status: job.attempts >= 6 ? "failed" : "pending",
          available_at: new Date(
            Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000,
          ).toISOString(),
          lease_until: null,
          last_error: "delivery_failed",
        })
        .eq("id", job.id)
        .eq("attempts", job.attempts);
      if (error) throw new Error("database_unavailable");
      result.failed++;
    }
  }
  return result;
}
async function finish(job: Job, status: string, providerId?: string) {
  const { error } = await db()
    .from("delivery_jobs")
    .update({
      status,
      provider_id: providerId,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      lease_until: null,
    })
    .eq("id", job.id)
    .eq("attempts", job.attempts);
  if (error) throw new Error("database_unavailable");
  if (status === "sent" && job.kind !== "meta") {
    const { error: eventError } = await db()
      .from("fan_events")
      .upsert(
        {
          artist_id: catalog.artistId,
          fan_id: job.fan_id,
          event_type:
            job.kind === "capture" && job.payload.magnet
              ? "lead_magnet_delivered"
              : "email_sent",
          event_id: `sent:${job.id}`,
        },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    if (eventError) throw new Error("database_unavailable");
  }
}

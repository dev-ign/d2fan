import {
  catalog,
  db,
  digest,
  env,
  rpc,
  signedFile,
  site,
  token,
} from "./platform.ts";
import { template } from "./templates.ts";
import {
  canDispatch,
  classifyEmail,
  EmailConfigurationError,
  mailbox,
  plainEmail,
  readEmailConfig,
} from "./email-policy.ts";
import { emailStore, type EmailJob, type EmailStore } from "./email-store.ts";
import {
  EmailProviderError,
  sendResendEmail,
  type OutgoingEmail,
} from "./resend.ts";
import { uuid } from "../../shared/validation.ts";

interface Dependencies {
  store: EmailStore;
  get: (name: string) => string | undefined;
  now: () => number;
  sign: typeof token;
  rewardReady: () => Promise<unknown>;
  send: typeof sendResendEmail;
}
function dependencies(overrides: Partial<Dependencies> = {}): Dependencies {
  return {
    store: emailStore(),
    get: (name) => Deno.env.get(name),
    now: Date.now,
    sign: token,
    rewardReady: () => signedFile("lead-magnet"),
    send: sendResendEmail,
    ...overrides,
  };
}
type Config = ReturnType<typeof readEmailConfig>;
function validateFrozenBody(
  body: OutgoingEmail,
  recipient: string,
  marketing: boolean,
  config: Config,
) {
  if (
    Object.keys(body).some(
      (key) => !["from", "to", "reply_to", "subject", "text"].includes(key),
    ) ||
    mailbox(body.from).split("@")[1] !== "jonaferreira.com" ||
    body.to?.length !== 1 ||
    body.to[0] !== recipient ||
    plainEmail(body.reply_to) !== body.reply_to ||
    !body.subject ||
    !body.text
  )
    throw new EmailProviderError("invalid_frozen_body", false);
  if (
    marketing &&
    (!config.marketingReady ||
      !body.text.includes(config.postal) ||
      !body.text.includes("#unsubscribe="))
  )
    throw new EmailProviderError("marketing_requirements", false);
}
async function render(
  job: EmailJob,
  recipient: string,
  language: string,
  config: Config,
  deps: Dependencies,
) {
  if (job.payload.emailBody)
    return {
      body: job.payload.emailBody as OutgoingEmail,
      expires: job.email_links_expire_at || "",
    };
  const es = language === "es",
    links: string[] = [];
  // Fresh links use this database lease's issuance time, never queue creation time.
  const issued = Math.floor((Date.parse(job.lease_until) - 120_000) / 1000);
  if (!Number.isFinite(issued) || issued > deps.now() / 1000 + 30)
    throw new Error("invalid_lease");
  let earliestExpiry = issued + 48 * 3600;
  const link = async (
    scope: "reward" | "confirm" | "unsubscribe" | "access" | "status",
    sub: string,
    ttl = 48 * 3600,
  ) => {
    // Confirmation keeps the original request timestamp so a queued request
    // cannot become a fresh consent grant after a later withdrawal.
    const linkIssued =
      scope === "confirm"
        ? Math.floor(Date.parse(job.created_at) / 1000)
        : issued;
    const requestId =
      scope === "confirm" && job.dedupe_key.startsWith("capture:")
        ? job.dedupe_key.slice("capture:".length)
        : undefined;
    if (scope === "confirm" && !uuid(requestId))
      throw new EmailProviderError("invalid_confirmation_request", false);
    earliestExpiry = Math.min(earliestExpiry, linkIssued + ttl);
    return `${config.origin}/#${scope}=${encodeURIComponent(await deps.sign(scope, sub, ttl, linkIssued, requestId))}`;
  };
  if (job.kind === "capture" || job.kind === "transactional_test") {
    if (job.payload.magnet === true || job.kind === "transactional_test") {
      await deps.rewardReady();
      links.push(
        `${es ? "Descarga solicitada" : "Requested download"}: ${await link("reward", job.fan_id || `owner-test:${job.id}`)}`,
      );
    }
    if (job.kind === "capture" && job.payload.confirm === true)
      links.push(
        `${es ? "Confirmar solicitud" : "Confirm request"}: ${await link("confirm", job.fan_id!)}`,
      );
  }
  if (job.kind === "purchase" || job.kind === "recovery") {
    const purchases = await deps.store.purchases(job);
    if (!purchases.length) return null;
    for (const purchase of purchases) {
      links.push(
        `${(purchase.amount_minor / 100).toFixed(2)} ${purchase.currency.toUpperCase()} · ${purchase.vault_item_slug || (es ? "Apoyo al artista" : "Artist support")}`,
      );
      if (purchase.purpose === "vault_unlock")
        links.push(await link("access", purchase.id));
    }
  }
  if (job.kind === "welcome" || job.kind === "reminder") {
    links.push(
      job.kind === "reminder"
        ? await link("status", String(job.payload.attemptId), 7 * 86400)
        : config.origin,
    );
    links.push(
      `${es ? "Cancelar suscripción" : "Unsubscribe"}: ${await link("unsubscribe", job.fan_id!, 365 * 86400)}`,
    );
    links.push(config.postal);
  }
  const content = template(job.kind, language, links, config.support, {
    magnet: job.payload.magnet === true,
    confirm: job.payload.confirm === true,
  });
  return {
    body: {
      from: config.from,
      to: [recipient],
      reply_to: config.support,
      ...content,
    },
    expires: new Date(earliestExpiry * 1000).toISOString(),
  };
}
export async function deliverEmailJob(
  job: EmailJob,
  config: Config,
  overrides: Partial<Dependencies> = {},
) {
  const deps = dependencies(overrides);
  try {
    if (
      job.email_policy_version !== 1 ||
      !job.lease_token ||
      Date.parse(job.lease_until) <= deps.now()
    )
      return "skipped";
    const marketing = classifyEmail(job.kind, job.payload) === "marketing";
    if (
      marketing &&
      (!config.marketingReady ||
        !job.fan_id ||
        !(await deps.store.permission(job.fan_id)))
    ) {
      await deps.store.finish(
        job,
        "skipped",
        undefined,
        "marketing_permission",
      );
      return "skipped";
    }
    if (job.kind === "reminder" && !(await deps.store.reminderEligible(job))) {
      await deps.store.finish(job, "skipped", undefined, "reminder_ineligible");
      return "skipped";
    }
    if (
      (job.kind === "purchase" || job.kind === "recovery") &&
      !(await deps.store.purchases(job)).length
    ) {
      await deps.store.finish(job, "skipped", undefined, "no_active_purchase");
      return "skipped";
    }
    const fan =
      job.kind === "transactional_test"
        ? {
            email_normalized: String(job.payload.recipient),
            preferred_language: String(job.payload.language),
          }
        : await deps.store.fan(job.fan_id!);
    const recipient = plainEmail(fan.email_normalized);
    if (
      job.kind === "transactional_test" &&
      (recipient !== plainEmail(deps.get("EMAIL_TEST_RECIPIENT") || "") ||
        job.payload.ownerRunId !== deps.get("EMAIL_TEST_RUN_ID"))
    )
      throw new EmailProviderError("test_not_allowlisted", false);
    const rendered = await render(
      job,
      recipient,
      fan.preferred_language,
      config,
      deps,
    );
    if (!rendered) {
      await deps.store.finish(job, "skipped", undefined, "no_active_purchase");
      return "skipped";
    }
    validateFrozenBody(rendered.body, recipient, marketing, config);
    const current = await deps.store.begin(
      job,
      rendered.body,
      rendered.expires,
      config.marketingReady,
    );
    if (!current) return "skipped";
    if (
      !canDispatch(
        current.first_provider_attempt_at,
        current.retry_deadline_at,
        deps.now(),
      ) ||
      Date.parse(current.lease_until) <= deps.now() + 10_000 ||
      Date.parse(rendered.expires) <= deps.now() + 30_000
    ) {
      await deps.store.finish(
        current,
        "failed",
        undefined,
        "dispatch_deadline",
      );
      return "failed";
    }
    if (marketing && !(await deps.store.permission(job.fan_id!))) {
      await deps.store.finish(
        current,
        "skipped",
        undefined,
        "marketing_permission",
      );
      return "skipped";
    }
    // No await may intervene between this final time check and provider dispatch.
    if (
      !canDispatch(
        current.first_provider_attempt_at,
        current.retry_deadline_at,
        deps.now(),
      ) ||
      Date.parse(current.lease_until) <= deps.now() + 10_000 ||
      Date.parse(rendered.expires) <= deps.now() + 30_000
    ) {
      await deps.store.finish(
        current,
        "failed",
        undefined,
        "dispatch_deadline",
      );
      return "failed";
    }
    const provider = await deps.send(
      rendered.body,
      config.key,
      current.dedupe_key,
    );
    const recorded = await deps.store.finish(current, "accepted", provider);
    return recorded ? "sent" : "unresolved";
  } catch (error) {
    const policyError =
      error instanceof Error &&
      ["unsupported_email", "invalid_email", "invalid_lease"].includes(
        error.message,
      );
    const code =
      error instanceof EmailProviderError
        ? error.code
        : policyError
          ? error.message
          : "delivery_ambiguous";
    const retry =
      !policyError &&
      (!(error instanceof EmailProviderError) || error.retryable);
    await deps.store.finish(job, retry ? "retry" : "failed", undefined, code);
    console.error(JSON.stringify({ event: "email_delivery_failure", code }));
    return "failed";
  }
}
export async function runMessaging(overrides: Partial<Dependencies> = {}) {
  const deps = dependencies(overrides);
  if (deps.get("EMAIL_DELIVERY_ENABLED") !== "true")
    throw new EmailConfigurationError(["EMAIL_DELIVERY_ENABLED"]);
  const config = readEmailConfig(deps.get);
  await deps.store.maintenance(config.marketingReady);
  const jobs = await deps.store.claim(null, config.marketingReady);
  const result = {
    sent: 0,
    failed: 0,
    skipped: 0,
    unresolved: 0,
    marketingDisabled: config.marketingBlock,
  };
  for (const job of jobs) result[await deliverEmailJob(job, config, deps)]++;
  if (
    !overrides.store &&
    jobs.length === 0 &&
    deps.get("META_CAPI_ACCESS_TOKEN")
  )
    await runMetaJobs();
  return result;
}
export async function messagingRequest(
  _req: Request,
  body: Record<string, unknown>,
  overrides: Partial<Dependencies> = {},
) {
  if (!body.operation || body.operation === "ordinary")
    return runMessaging(overrides);
  if (
    !["controlled_test_preview", "controlled_test_send"].includes(
      String(body.operation),
    )
  )
    throw new Error("invalid_request");
  const deps = dependencies(overrides),
    config = readEmailConfig(deps.get);
  if (
    !uuid(body.runId) ||
    body.runId !== deps.get("EMAIL_TEST_RUN_ID") ||
    !["en", "es"].includes(String(body.language))
  )
    throw new Error("invalid_request");
  let recipient: string;
  try {
    recipient = plainEmail(body.recipient);
    if (recipient !== plainEmail(deps.get("EMAIL_TEST_RECIPIENT") || ""))
      throw new Error();
  } catch {
    throw new EmailConfigurationError(["EMAIL_TEST_RECIPIENT"]);
  }
  if (body.operation === "controlled_test_preview")
    return {
      mode: "preview",
      send: false,
      recipientAllowlisted: true,
      senderDomainCompatible: true,
      marketingEnabled: false,
      backlogProcessing: false,
      linksExpireHours: 48,
    };
  if (deps.get("EMAIL_TEST_SEND_ENABLED") !== "true")
    throw new EmailConfigurationError(["EMAIL_TEST_SEND_ENABLED"]);
  const id = await deps.store.createTest(
    body.runId as string,
    recipient,
    String(body.language),
  );
  const jobs = await deps.store.claim(id, false);
  return {
    mode: "controlled_test",
    claimed: jobs.length,
    results: await Promise.all(
      jobs.map((job) => deliverEmailJob(job, config, deps)),
    ),
    marketingEnabled: false,
    backlogProcessing: false,
  };
}
async function runMetaJobs() {
  const client = db(),
    jobs = await rpc<EmailJob[]>("claim_jobs", {});
  for (const job of jobs) {
    try {
      const { data: current } = await client
        .from("delivery_jobs")
        .select("status")
        .eq("id", job.id)
        .single();
      if (current?.status === "skipped") continue;
      const { data: fan, error } = await client
        .from("fans")
        .select("email_normalized")
        .eq("id", job.fan_id)
        .eq("artist_id", catalog.artistId)
        .single();
      if (error || !fan) throw new Error("database_unavailable");
      const response = await fetch(
        `https://graph.facebook.com/${env("META_API_VERSION")}/${env("META_PIXEL_ID")}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            access_token: env("META_CAPI_ACCESS_TOKEN"),
            test_event_code: Deno.env.get("META_TEST_EVENT_CODE") || undefined,
            data: [
              {
                event_name: job.payload.event,
                event_id: job.payload.eventId,
                event_time: Math.floor(
                  new Date(job.created_at).getTime() / 1000,
                ),
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
          }),
        },
      );
      if (!response.ok) throw new Error("provider_rejected");
      const { error: writeError } = await client
        .from("delivery_jobs")
        .update({
          status: "sent",
          provider_id: "meta-accepted",
          sent_at: new Date().toISOString(),
          lease_until: null,
        })
        .eq("id", job.id)
        .eq("attempts", job.attempts)
        .eq("status", "processing");
      if (writeError) throw new Error("database_unavailable");
    } catch {
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
        .eq("attempts", job.attempts)
        .eq("status", "processing");
      if (error) throw new Error("database_unavailable");
    }
  }
}

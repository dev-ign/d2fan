import {
  normalizeEmail,
  boundedAttribution,
  validAmount,
  uuid,
} from "../../shared/validation.ts";
import {
  catalog,
  db,
  env,
  site,
  token,
  verify,
  rpc,
  signedFile,
  FileSigningError,
  digest,
  enqueue,
  contactLimit,
} from "./platform.ts";
import type {
  CheckoutStatus,
  EmailDeliveryStatus,
  RecoveryResponse,
  RewardDownload,
} from "../../shared/contracts.ts";
import { wallpaperPackId } from "../../shared/contracts.ts";
import { signWallpaperPack } from "./rewards.ts";
import { authorizePaymentTest, testItemSlug } from "./payment-test.ts";
import { captureEmailConfigured } from "./email-policy.ts";
import {
  attemptModeMatches,
  checkoutSessionIdMatches,
  checkoutUrl,
  paymentConfiguration,
  stripe,
  stripeModeMatches,
  verifyStripeAccount,
} from "./payments.ts";

export async function captureFan(_req: Request, b: Record<string, unknown>) {
  const email = normalizeEmail(b.email);
  const pack = b.rewardId === wallpaperPackId;
  if (
    !uuid(b.requestId) ||
    !["en", "es"].includes(String(b.language)) ||
    !["stay_close", "support_modal"].includes(String(b.source)) ||
    typeof b.emailMarketing !== "boolean" ||
    typeof b.analyticsConsent !== "boolean" ||
    (b.rewardId !== undefined && (!pack || b.source !== "stay_close"))
  )
    throw new Error("invalid_request");
  await contactLimit(email, "capture");
  const first = boundedAttribution(b.firstTouch),
    last = boundedAttribution(b.lastTouch);
  const fingerprint = await digest(
    JSON.stringify([
      email,
      b.language,
      b.source,
      b.emailMarketing,
      first,
      last,
    ]),
  );
  const fan = await rpc<string>(
    pack ? "capture_fan_with_reward" : "capture_fan",
    {
      p_artist: catalog.artistId,
      p_request: b.requestId,
      p_email: email,
      p_language: b.language,
      ...(pack ? { p_reward_id: wallpaperPackId } : { p_source: b.source }),
      p_first: first,
      p_last: last,
      p_opt_in: b.emailMarketing,
      p_fingerprint: fingerprint,
    },
  );
  let magnetUrl: string | undefined;
  let wallpaperLinks: RewardDownload[] | undefined;
  if (b.source === "stay_close") {
    try {
      if (pack) wallpaperLinks = await signWallpaperPack();
      else magnetUrl = await signedFile("lead-magnet");
    } catch (error) {
      // Only fixed categories reach logs; capture remains successful. Never log
      // the exception itself: provider messages can contain paths or secrets.
      console.error(
        JSON.stringify({
          event: "free_reward_signing_failed",
          category:
            error instanceof FileSigningError
              ? error.category
              : "storage_api_failure",
        }),
      );
    }
  }
  if (b.analyticsConsent)
    await enqueue(fan, "meta", `meta:capture:${b.requestId}`, {
      event: "Lead",
      eventId: `capture:${b.requestId}`,
    });
  let delivery: EmailDeliveryStatus = "unknown";
  try {
    // The capture RPC has validated this request's fingerprint and canonical fan.
    // Read only this request's job, never the fan's other messaging history.
    const { data: job, error } = await db()
      .from("delivery_jobs")
      .select(
        "id,attempts,status,provider_id,sent_at,quarantined_at,email_policy_version",
      )
      .eq("artist_id", catalog.artistId)
      .eq("fan_id", fan)
      .eq("kind", "capture")
      .eq("dedupe_key", `capture:${b.requestId}`)
      .maybeSingle();
    if (!error && job) {
      if (job.quarantined_at) delivery = "quarantined";
      else if (job.status === "sent")
        delivery = job.provider_id && job.sent_at ? "sent" : "unknown";
      else if (job.status === "failed" || job.status === "skipped")
        delivery = job.status;
      else if (["pending", "processing"].includes(job.status)) {
        if (!captureEmailConfigured()) delivery = "disabled";
        else if (job.email_policy_version === 1) {
          delivery = "queued";
          // A signup can dispatch only its own fresh job. Never drain backlog or
          // automatically retry a provider attempt after an ambiguous response.
          if (job.status === "pending" && job.attempts === 0 && uuid(job.id)) {
            delivery = "unknown";
            const response = await fetch(
              `${env("SUPABASE_URL")}/functions/v1/scheduled-messaging`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${env("SCHEDULER_SECRET")}`,
                },
                body: JSON.stringify({
                  operation: "dispatch_job",
                  jobId: job.id,
                }),
                signal: AbortSignal.timeout(5_000),
              },
            );
            const result = await response.json();
            if (
              response.ok &&
              result.success === true &&
              result.data?.sent === 1
            )
              delivery = "sent";
          }
        }
      }
    }
  } catch {
    // A delivery lookup failure must not undo capture or withhold the free reward.
  }
  return {
    measurementToken: b.analyticsConsent
      ? await token(
          "measurement",
          fan,
          30 * 86400,
          undefined,
          b.requestId as string,
        )
      : undefined,
    captureToken: await token(
      "capture",
      fan,
      1800,
      undefined,
      b.requestId as string,
    ),
    eventId: `capture:${b.requestId}`,
    delivery,
    magnetUrl,
    ...(pack && { rewardId: wallpaperPackId, wallpaperLinks }),
  };
}
export async function createCheckout(req: Request, b: Record<string, unknown>) {
  const guest = b.purpose === "tip";
  const operator = b.operatorTestToken !== undefined;
  if (!uuid(b.requestId) || (!guest && b.purpose !== "vault_unlock"))
    throw new Error("invalid_request");
  if (
    guest
      ? Deno.env.get("SUPPORT_ENABLED") !== "true"
      : !operator && Deno.env.get("COMMERCE_ENABLED") !== "true"
  )
    throw new Error("commerce_disabled");
  const config = paymentConfiguration();
  if (!guest && config.mode !== "test") throw new Error("commerce_disabled");

  let guestHash: string | null = null;
  let fanId: string | null = null;
  if (guest) {
    if (
      !uuid(b.guestToken) ||
      b.guestToken === b.requestId ||
      Object.keys(b).some(
        (key) =>
          !["requestId", "purpose", "guestToken", "amountMinor"].includes(key),
      )
    )
      throw new Error("invalid_request");
    guestHash = await digest(b.guestToken);
  } else {
    if (typeof b.analyticsConsent !== "boolean" || b.guestToken !== undefined)
      throw new Error("invalid_request");
    fanId = (await verify(b.captureToken, "capture")).sub;
    if (operator) await authorizePaymentTest(req, b.operatorTestToken);
  }

  const item = guest
    ? undefined
    : catalog.vault.find((v) => v.slug === b.itemSlug);
  if (
    !guest &&
    (!item ||
      (operator
        ? item.slug !== testItemSlug
        : item.availability !== "available"))
  )
    throw new Error("unavailable_item");
  const amount = guest ? b.amountMinor : item?.priceMinor;
  if (!validAmount(amount, catalog.support.minMinor, catalog.support.maxMinor))
    throw new Error("invalid_amount");

  const origin = new URL(site());
  if (
    origin.protocol !== "https:" &&
    !(config.mode === "test" && origin.origin === "http://localhost:5173")
  )
    throw new Error("payment_configuration");
  const payments = stripe(config);
  await verifyStripeAccount(payments, config);
  if (item) await signedFile(item.slug);

  const client = db();
  const itemSlug = item?.slug ?? null;
  const { error: insertError } = await client.from("checkout_attempts").upsert(
    {
      id: b.requestId,
      artist_id: catalog.artistId,
      fan_id: fanId,
      purpose: b.purpose,
      item_slug: itemSlug,
      amount_minor: amount,
      currency: catalog.currency,
      analytics_consent: !guest && b.analyticsConsent === true,
      payment_mode: config.mode,
      stripe_account_id: config.accountId,
      guest_token_hash: guestHash,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (insertError) throw new Error("database_unavailable");
  const { data: attempt, error } = await client
    .from("checkout_attempts")
    .select(
      "id,fan_id,purpose,item_slug,amount_minor,analytics_consent,payment_mode,stripe_account_id,guest_token_hash,status,expires_at,created_at,stripe_session_id,checkout_url",
    )
    .eq("id", b.requestId)
    .eq("artist_id", catalog.artistId)
    .single();
  if (error || !attempt) throw new Error("database_unavailable");
  if (
    attempt.fan_id !== fanId ||
    attempt.guest_token_hash !== guestHash ||
    attempt.amount_minor !== amount ||
    attempt.purpose !== b.purpose ||
    attempt.item_slug !== itemSlug ||
    attempt.payment_mode !== config.mode ||
    attempt.stripe_account_id !== config.accountId ||
    !["draft", "pending_payment"].includes(attempt.status) ||
    Date.parse(attempt.expires_at) <= Date.now()
  )
    throw new Error("request_conflict");

  const issued = Math.floor(Date.parse(attempt.created_at) / 1000);
  const statusToken = await token("status", attempt.id, 7 * 86400, issued);
  const eventId = `checkout:${attempt.id}`;
  let url = attempt.checkout_url;
  if (url !== null) {
    if (!checkoutUrl(url) || !attemptModeMatches(attempt, config))
      throw new Error("payment_configuration");
  } else {
    let email: string | undefined;
    if (fanId) {
      const { data: fan, error: fanError } = await client
        .from("fans")
        .select("email_normalized")
        .eq("id", fanId)
        .eq("artist_id", catalog.artistId)
        .single();
      if (fanError || !fan) throw new Error("unauthorized");
      email = fan.email_normalized;
    }
    const metadata = {
      attempt_id: attempt.id,
      artist_id: catalog.artistId,
      purpose: b.purpose as string,
      ...(operator ? { test_flow: "accion-operator" } : {}),
    };
    const session = await payments.checkout.sessions.create(
      {
        mode: "payment",
        ...(guest && config.mode === "live"
          ? {
              payment_method_types: ["card"],
              adaptive_pricing: { enabled: false },
            }
          : {}),
        ...(guest
          ? { integration_identifier: "jona-d2fan-support-prjxwdha" }
          : {}),
        ...(email ? { customer_email: email } : {}),
        client_reference_id: attempt.id,
        line_items: [
          {
            price_data: {
              currency: catalog.currency,
              unit_amount: amount,
              product_data: {
                name: !item
                  ? "Support Jona Ferreira"
                  : item.slug === testItemSlug
                    ? "Acción — Hi-Res Artwork & Wallpapers"
                    : `Vault: ${item.slug}`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${origin.origin}/?checkout=return#status=${encodeURIComponent(statusToken)}`,
        cancel_url: `${origin.origin}/?checkout=cancel#status=${encodeURIComponent(statusToken)}`,
        expires_at: Math.floor(Date.parse(attempt.expires_at) / 1000),
        metadata: {
          ...metadata,
          ...(fanId ? { fan_id: fanId, item_slug: itemSlug ?? "" } : {}),
        },
        payment_intent_data: { metadata },
      },
      { idempotencyKey: eventId },
    );
    if (
      !stripeModeMatches(session, config.mode) ||
      !checkoutSessionIdMatches(session.id, config.mode) ||
      session.mode !== "payment" ||
      session.client_reference_id !== attempt.id ||
      session.amount_total !== amount ||
      session.currency !== catalog.currency ||
      !checkoutUrl(session.url)
    )
      throw new Error("payment_configuration");
    const { data: saved, error: updateError } = await client
      .from("checkout_attempts")
      .update({
        stripe_session_id: session.id,
        checkout_url: session.url,
        status: "pending_payment",
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.id)
      .in("status", ["draft", "pending_payment"])
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error("database_unavailable");
    if (!saved) throw new Error("request_conflict");
    url = session.url;
  }

  if (fanId) {
    const { error: eventError } = await client.from("fan_events").upsert(
      {
        artist_id: catalog.artistId,
        fan_id: fanId,
        event_type: "checkout_started",
        event_id: eventId,
        source: "support_modal",
      },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
    if (eventError) throw new Error("database_unavailable");
    if (attempt.analytics_consent && b.analyticsConsent === true)
      await enqueue(fanId, "meta", `meta:checkout:${attempt.id}`, {
        event: "InitiateCheckout",
        eventId,
        amountMinor: amount,
        currency: catalog.currency,
      });
  }
  return { attemptId: attempt.id, statusToken, url, eventId };
}
export async function checkoutStatus(
  _req: Request,
  b: Record<string, unknown>,
): Promise<CheckoutStatus> {
  const claims = await verify(b.token, "status");
  const { data: a, error } = await db()
    .from("checkout_attempts")
    .select("*")
    .eq("id", claims.sub)
    .eq("artist_id", catalog.artistId)
    .single();
  if (error || !a) throw new Error("unauthorized");
  let resumeUrl: string | undefined;
  if (a.status === "pending_payment" && checkoutUrl(a.checkout_url)) {
    try {
      const config = paymentConfiguration();
      const enabled =
        a.purpose === "tip"
          ? Deno.env.get("SUPPORT_ENABLED") === "true"
          : config.mode === "test" &&
            (Deno.env.get("COMMERCE_ENABLED") === "true" ||
              (Deno.env.get("ACCION_TEST_CHECKOUT") === "true" &&
                site() === "http://localhost:5173"));
      if (enabled && attemptModeMatches(a, config)) resumeUrl = a.checkout_url;
    } catch {
      // Financial status remains readable after checkout admission is withdrawn.
    }
  }
  const result: CheckoutStatus = {
    status: a.status,
    checkoutUrl: resumeUrl,
    amountMinor: a.amount_minor,
    currency: a.currency,
    purpose: a.purpose,
    itemSlug: a.item_slug ?? undefined,
    delivery:
      a.fan_id !== null && captureEmailConfigured() ? "unknown" : "disabled",
  };
  if (a.status === "completed") {
    const { data: p, error: pError } = await db()
      .from("purchases")
      .select("id,status")
      .eq("checkout_attempt_id", a.id)
      .single();
    if (pError || !p) throw new Error("database_unavailable");
    result.status = p.status === "refunded" ? "refunded" : "completed";
    result.eventId = `purchase:${p.id}`;
    if (a.fan_id === null) return result;
    if (p.status !== "refunded" && a.purpose === "vault_unlock")
      result.accessToken = await token("access", p.id, 900);
    const { data: job, error: jobError } = await db()
      .from("delivery_jobs")
      .select("status,provider_id,sent_at,quarantined_at,email_policy_version")
      .eq("dedupe_key", `purchase:${p.id}`)
      .maybeSingle();
    if (jobError) result.delivery = "unknown";
    else if (job?.quarantined_at) result.delivery = "quarantined";
    else if (job?.status === "sent")
      result.delivery = job.provider_id && job.sent_at ? "sent" : "unknown";
    else if (job?.status === "failed" || job?.status === "skipped")
      result.delivery = job.status;
    else if (!captureEmailConfigured()) result.delivery = "disabled";
    else if (
      job?.email_policy_version === 1 &&
      ["pending", "processing"].includes(job.status)
    )
      result.delivery = "queued";
    else result.delivery = "unknown";
  }
  return result;
}
export async function redeemVault(_req: Request, b: Record<string, unknown>) {
  const claims = await verify(b.token, "access");
  const { data: p, error } = await db()
    .from("purchases")
    .select("id,fan_id,vault_item_slug,status")
    .eq("id", claims.sub)
    .eq("artist_id", catalog.artistId)
    .single();
  if (error || !p || p.status === "refunded" || !p.vault_item_slug)
    throw new Error("unauthorized");
  const { data: u } = await db()
    .from("vault_unlocks")
    .select("id")
    .eq("artist_id", catalog.artistId)
    .eq("fan_id", p.fan_id)
    .eq("item_slug", p.vault_item_slug)
    .eq("status", "active")
    .maybeSingle();
  if (!u) throw new Error("unauthorized");
  return {
    links: [
      {
        title:
          p.vault_item_slug === testItemSlug
            ? "Acción package"
            : p.vault_item_slug,
        url: await signedFile(p.vault_item_slug),
      },
    ],
  };
}
export async function recoverAccess(
  _req: Request,
  b: Record<string, unknown>,
): Promise<RecoveryResponse> {
  const email = normalizeEmail(b.email);
  // Return the same availability for every address; do not build a disabled backlog.
  if (!captureEmailConfigured())
    return {
      delivery: "disabled",
      message:
        "Email recovery is currently disabled. Existing download links still work.",
    };
  await contactLimit(email, "recovery");
  const { data: fan, error } = await db()
    .from("fans")
    .select("id")
    .eq("artist_id", catalog.artistId)
    .eq("email_normalized", email)
    .maybeSingle();
  if (error) throw new Error("database_unavailable");
  if (fan)
    await enqueue(
      fan.id,
      "recovery",
      `recovery:${fan.id}:${Math.floor(Date.now() / 300000)}`,
    );
  return {
    delivery: "requested",
    message:
      "If that email has eligible purchases, the recovery request is saved. Email delivery has not been confirmed.",
  };
}
export async function manageConsent(_req: Request, b: Record<string, unknown>) {
  if (!["confirm", "unsubscribe"].includes(String(b.action)))
    throw new Error("invalid_request");
  const claims = await verify(
    b.token,
    b.action === "confirm" ? "confirm" : "unsubscribe",
  );
  if (b.action === "unsubscribe") {
    // This signature works before and after the atomic-consent migration. The
    // compatibility function delegates to the same locked revocation operation.
    await rpc<void>("update_email_consent", {
      p_artist: catalog.artistId,
      p_fan: claims.sub,
      p_status: "revoked",
    });
  } else {
    if (!uuid(claims.actionId)) throw new Error("unauthorized");
    const updated = await rpc<boolean>("update_email_consent", {
      p_artist: catalog.artistId,
      p_fan: claims.sub,
      p_status: "granted",
      p_request: claims.actionId,
    });
    if (!updated) throw new Error("unauthorized");
  }
  return {
    message:
      b.action === "confirm"
        ? "You’re in. Welcome to La Cultura."
        : "You have been unsubscribed from marketing. Purchase access stays available.",
  };
}
export async function analyticsEvent(
  _req: Request,
  b: Record<string, unknown>,
) {
  if (
    b.consent !== true ||
    !["PageView", "DSPClick"].includes(String(b.event)) ||
    !uuid(b.eventId)
  )
    throw new Error("invalid_request");
  // Anonymous events never claim an identified fan. Server campaign events use the canonical outbox.
  const response = await fetch(
    `https://graph.facebook.com/${env("META_API_VERSION")}/${env("META_PIXEL_ID")}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: env("META_CAPI_ACCESS_TOKEN"),
        test_event_code: Deno.env.get("META_TEST_EVENT_CODE") || undefined,
        data: [
          {
            event_name: b.event,
            event_id: b.eventId,
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: site(),
            user_data: {
              client_user_agent: _req.headers.get("user-agent") || "",
              client_ip_address: _req.headers
                .get("x-forwarded-for")
                ?.split(",")[0]
                ?.trim(),
            },
            custom_data: boundedAttribution({ release: b.release_slug }),
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error("analytics_unavailable");
  return { accepted: true };
}

export async function deliverLeadMagnet(
  _req: Request,
  b: Record<string, unknown>,
) {
  const claims = await verify(b.token, "reward");
  if (claims.actionId !== undefined) {
    if (!uuid(claims.actionId)) throw new Error("unauthorized");
    const { data: job, error } = await db()
      .from("delivery_jobs")
      .select("payload")
      .eq("artist_id", claims.artist)
      .eq("fan_id", claims.sub)
      .eq("kind", "capture")
      .eq("dedupe_key", `capture:${claims.actionId}`)
      .maybeSingle();
    if (error) throw new Error("database_unavailable");
    if (job?.payload?.rewardId !== wallpaperPackId)
      throw new Error("unauthorized");
    return { links: await signWallpaperPack() };
  }
  return {
    links: [
      { title: "Acción wallpaper", url: await signedFile("lead-magnet") },
    ],
  };
}

export async function revokeMeasurement(
  _req: Request,
  b: Record<string, unknown>,
) {
  if (!Array.isArray(b.tokens) || b.tokens.length > 20)
    throw new Error("invalid_request");
  for (const value of b.tokens) {
    let claims;
    try {
      claims = await verify(value, "status");
    } catch {
      try {
        claims = await verify(value, "measurement");
      } catch {
        continue;
      }
    }
    if (claims.scope === "measurement" && claims.actionId) {
      const { error } = await db()
        .from("delivery_jobs")
        .update({ status: "skipped" })
        .eq("fan_id", claims.sub)
        .eq("dedupe_key", `meta:capture:${claims.actionId}`)
        .eq("kind", "meta")
        .in("status", ["pending", "processing"]);
      if (error) throw new Error("database_unavailable");
    } else if (claims.scope === "status") {
      const { error } = await db()
        .from("checkout_attempts")
        .update({ analytics_consent: false })
        .eq("id", claims.sub)
        .eq("artist_id", catalog.artistId);
      if (error) throw new Error("database_unavailable");
      const { data: p, error: purchaseError } = await db()
        .from("purchases")
        .select("id")
        .eq("checkout_attempt_id", claims.sub)
        .maybeSingle();
      if (purchaseError) throw new Error("database_unavailable");
      const keys = [`meta:checkout:${claims.sub}`];
      if (p) keys.push(`meta:purchase:${p.id}`, `meta:unlock:${p.id}`);
      const { error: jobError } = await db()
        .from("delivery_jobs")
        .update({ status: "skipped" })
        .in("dedupe_key", keys)
        .eq("kind", "meta")
        .in("status", ["pending", "processing"]);
      if (jobError) throw new Error("database_unavailable");
    }
  }
  return { revoked: true };
}

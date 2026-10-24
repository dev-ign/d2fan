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
  stripe,
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
import type { CheckoutStatus } from "../../shared/contracts.ts";

export async function captureFan(_req: Request, b: Record<string, unknown>) {
  const email = normalizeEmail(b.email);
  if (
    !uuid(b.requestId) ||
    !["en", "es"].includes(String(b.language)) ||
    !["stay_close", "support_modal"].includes(String(b.source)) ||
    typeof b.emailMarketing !== "boolean" ||
    typeof b.analyticsConsent !== "boolean"
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
  const fan = await rpc<string>("capture_fan", {
    p_artist: catalog.artistId,
    p_request: b.requestId,
    p_email: email,
    p_language: b.language,
    p_source: b.source,
    p_first: first,
    p_last: last,
    p_opt_in: b.emailMarketing,
    p_fingerprint: fingerprint,
  });
  let magnetUrl: string | undefined;
  if (b.source === "stay_close") {
    try {
      magnetUrl = await signedFile("lead-magnet");
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
    delivery: envConfigured("EMAIL_PROVIDER_API_KEY")
      ? "queued"
      : "not_configured",
    magnetUrl,
  };
}
function envConfigured(name: string) {
  return Boolean(Deno.env.get(name));
}
export async function createCheckout(
  _req: Request,
  b: Record<string, unknown>,
) {
  const claims = await verify(b.captureToken, "capture");
  if (
    !uuid(b.requestId) ||
    !["tip", "vault_unlock"].includes(String(b.purpose)) ||
    typeof b.analyticsConsent !== "boolean"
  )
    throw new Error("invalid_request");
  const item = catalog.vault.find((v) => v.slug === b.itemSlug);
  const amount = b.purpose === "tip" ? b.amountMinor : item?.priceMinor;
  if (b.purpose === "vault_unlock") {
    if (!item || item.availability !== "available")
      throw new Error("unavailable_item");
    await signedFile(item.slug); // Never take payment for a missing file.
  }
  if (!validAmount(amount, catalog.support.minMinor, catalog.support.maxMinor))
    throw new Error("invalid_amount");
  const client = db();
  const { data: fan, error: fanError } = await client
    .from("fans")
    .select("email_normalized")
    .eq("id", claims.sub)
    .eq("artist_id", catalog.artistId)
    .single();
  if (fanError || !fan) throw new Error("unauthorized");
  const { error: insertError } = await client.from("checkout_attempts").upsert(
    {
      id: b.requestId,
      artist_id: catalog.artistId,
      fan_id: claims.sub,
      purpose: b.purpose,
      item_slug: b.purpose === "tip" ? null : b.itemSlug,
      amount_minor: amount,
      currency: catalog.currency,
      analytics_consent: b.analyticsConsent,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (insertError) throw new Error("database_unavailable");
  const { data: attempt, error } = await client
    .from("checkout_attempts")
    .select("*")
    .eq("id", b.requestId)
    .eq("artist_id", catalog.artistId)
    .single();
  if (error || !attempt) throw new Error("database_unavailable");
  if (
    attempt.fan_id !== claims.sub ||
    attempt.amount_minor !== amount ||
    attempt.purpose !== b.purpose ||
    attempt.item_slug !== (b.purpose === "tip" ? null : b.itemSlug)
  )
    throw new Error("request_conflict");
  if (
    attempt.status === "completed" ||
    new Date(attempt.expires_at).getTime() <= Date.now()
  )
    throw new Error("request_conflict");
  const issued = Math.floor(new Date(attempt.created_at).getTime() / 1000);
  const statusToken = await token("status", attempt.id, 7 * 86400, issued);
  const session = attempt.checkout_url
    ? { id: attempt.stripe_session_id, url: attempt.checkout_url }
    : await stripe().checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          customer_email: fan.email_normalized,
          client_reference_id: attempt.id,
          line_items: [
            {
              price_data: {
                currency: catalog.currency,
                unit_amount: amount,
                product_data: {
                  name:
                    b.purpose === "tip"
                      ? "Support Jona Ferreira"
                      : `Vault: ${item?.slug}`,
                },
              },
              quantity: 1,
            },
          ],
          success_url: `${site()}/?checkout=return#status=${encodeURIComponent(statusToken)}`,
          cancel_url: `${site()}/?checkout=cancel#status=${encodeURIComponent(statusToken)}`,
          expires_at: Math.floor(new Date(attempt.expires_at).getTime() / 1000),
          metadata: { attempt_id: attempt.id, artist_id: catalog.artistId },
          payment_intent_data: {
            metadata: { attempt_id: attempt.id, artist_id: catalog.artistId },
          },
        },
        { idempotencyKey: `checkout:${attempt.id}` },
      );
  const { error: updateError } = await client
    .from("checkout_attempts")
    .update({
      stripe_session_id: session.id,
      checkout_url: session.url,
      status: "pending_payment",
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .in("status", ["draft", "pending_payment"]);
  if (updateError) throw new Error("database_unavailable");
  const { error: eventError } = await client.from("fan_events").upsert(
    {
      artist_id: catalog.artistId,
      fan_id: claims.sub,
      event_type: "checkout_started",
      event_id: `checkout:${attempt.id}`,
      source: "support_modal",
    },
    { onConflict: "event_id", ignoreDuplicates: true },
  );
  if (eventError) throw new Error("database_unavailable");
  if (b.analyticsConsent)
    await enqueue(claims.sub, "meta", `meta:checkout:${attempt.id}`, {
      event: "InitiateCheckout",
      eventId: `checkout:${attempt.id}`,
      amountMinor: amount,
      currency: catalog.currency,
    });
  return {
    attemptId: attempt.id,
    statusToken,
    url: session.url,
    eventId: `checkout:${attempt.id}`,
  };
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
  const result: CheckoutStatus = {
    status: a.status,
    checkoutUrl: a.status === "pending_payment" ? a.checkout_url : undefined,
    amountMinor: a.amount_minor,
    currency: a.currency,
    purpose: a.purpose,
    itemSlug: a.item_slug,
    delivery: "pending",
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
    if (p.status !== "refunded" && a.purpose === "vault_unlock")
      result.accessToken = await token("access", p.id, 900);
    const { data: job } = await db()
      .from("delivery_jobs")
      .select("status")
      .eq("dedupe_key", `purchase:${p.id}`)
      .maybeSingle();
    result.delivery = job?.status || "pending";
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
      { title: p.vault_item_slug, url: await signedFile(p.vault_item_slug) },
    ],
  };
}
export async function recoverAccess(_req: Request, b: Record<string, unknown>) {
  const email = normalizeEmail(b.email);
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
    message:
      "If that email has purchases, an access email will be sent. Check spam too.",
  };
}
export async function manageConsent(_req: Request, b: Record<string, unknown>) {
  if (!["confirm", "unsubscribe"].includes(String(b.action)))
    throw new Error("invalid_request");
  const claims = await verify(
    b.token,
    b.action === "confirm" ? "confirm" : "unsubscribe",
  );
  // A confirmation issued before a later revocation cannot re-enable marketing.
  if (b.action === "confirm") {
    const { data: revoked, error } = await db()
      .from("consent_records")
      .select("id")
      .eq("fan_id", claims.sub)
      .eq("status", "revoked")
      .gte("captured_at", new Date(claims.iat * 1000).toISOString())
      .limit(1);
    if (error) throw new Error("database_unavailable");
    if (revoked?.length) throw new Error("unauthorized");
  }
  await rpc("update_email_consent", {
    p_artist: catalog.artistId,
    p_fan: claims.sub,
    p_status: b.action === "confirm" ? "granted" : "revoked",
  });
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
  await verify(b.token, "reward");
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

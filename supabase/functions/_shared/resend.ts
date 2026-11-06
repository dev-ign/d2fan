import { mailbox, plainEmail } from "./email-policy.ts";
export interface OutgoingEmail {
  from: string;
  to: string[];
  reply_to: string;
  subject: string;
  text: string;
}
export class EmailProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}
export async function sendResendEmail(
  body: OutgoingEmail,
  key: string,
  dedupe: string,
  request: typeof fetch = fetch,
) {
  if (
    Object.keys(body).some(
      (name) => !["from", "to", "reply_to", "subject", "text"].includes(name),
    ) ||
    body.to?.length !== 1 ||
    plainEmail(body.to[0]) !== body.to[0] ||
    !body.text ||
    !body.subject ||
    mailbox(body.from).split("@")[1] !== "jonaferreira.com" ||
    plainEmail(body.reply_to) !== body.reply_to ||
    !dedupe ||
    dedupe.length > 256
  )
    throw new EmailProviderError("invalid_email_request", false);
  let response: Response;
  try {
    response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": dedupe,
      },
      // JSONB reorders keys. Serialize this fixed field order on first send and
      // every retry so the provider always receives identical request bytes.
      body: JSON.stringify({
        from: body.from,
        to: body.to,
        reply_to: body.reply_to,
        subject: body.subject,
        text: body.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EmailProviderError("provider_ambiguous", true);
  }
  if (!response.ok) {
    // Never log provider bodies: they can contain recipients, private links or keys.
    if (response.status === 401 || response.status === 403)
      throw new EmailProviderError("provider_authentication", false);
    if (
      [408, 409, 425, 429].includes(response.status) ||
      response.status >= 500
    )
      throw new EmailProviderError("provider_retryable", true);
    throw new EmailProviderError("provider_rejected", false);
  }
  try {
    const value = await response.json();
    if (
      typeof value.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(value.id)
    )
      throw new Error();
    return value.id as string;
  } catch {
    throw new EmailProviderError("provider_ambiguous", true);
  }
}

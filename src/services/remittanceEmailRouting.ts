import { createHmac } from "node:crypto";

import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * Remittance mail arriving on the webhook that already exists.
 *
 * One Resend `email.received` webhook is registered and it points at the credit
 * negotiation route. Registering a second one would be a change to the Resend
 * account, so the routing decision lives here instead: mail addressed to the
 * remittance mailbox is handed to remittance intake, and everything else
 * carries on to negotiation untouched.
 *
 * Nothing here looks inside the attachment. That is intake's job, behind the
 * scanner; this code runs before any of it and only reads the envelope.
 */

export interface ResendInboundEventLike {
  type?: unknown;
  data?: {
    email_id?: unknown;
    from?: unknown;
    to?: unknown;
    received_for?: unknown;
    subject?: unknown;
    created_at?: unknown;
    attachments?: unknown;
  };
}

export type RemittanceRoutingStatus =
  | "routed"
  | "refused"
  | "no_attachment"
  | "not_configured"
  | "unreachable";

export interface RemittanceRoutingResult {
  status: RemittanceRoutingStatus;
  reason?: string;
}

/** Narrowed once, so the callers below never spread an `any`. */
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

function addresses(event: ResendInboundEventLike): string[] {
  // A catch-all delivers to one address and records the intended one in
  // received_for, so both lists count.
  return [...asList(event.data?.to), ...asList(event.data?.received_for)]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());
}

/**
 * Whether this message belongs to remittance.
 *
 * An unconfigured mailbox claims nothing. The opposite default would have one
 * workstream quietly swallowing the other's mail the moment a variable was
 * missing.
 */
export function isRemittanceRecipient(event: ResendInboundEventLike, env: RuntimeEnv): boolean {
  const configured = env.RECOUP_INBOUND_APPROVED_RECIPIENT?.trim().toLowerCase();

  if (configured === undefined || configured.length === 0) {
    return false;
  }

  return addresses(event).includes(configured);
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function firstAttachment(event: ResendInboundEventLike): Record<string, unknown> | undefined {
  const [first] = asList(event.data?.attachments);

  return typeof first === "object" && first !== null ? (first as Record<string, unknown>) : undefined;
}

/**
 * The attachment bytes, however Resend chose to send them.
 *
 * Three shapes, because production uses the third and the tests only covered
 * the first two:
 *
 *   content       inline base64, the documented shape
 *   download_url  a direct link
 *   id            an attachment id, and nothing else
 *
 * A real email.received carries only the id and a size. Resolving it costs an
 * extra hop through /emails/inbound/{email}/attachments/{id}, which returns a
 * short-lived download_url. Until that hop existed a genuine email reached the
 * route and produced nothing at all, while every stubbed test passed.
 */
async function readAttachmentBytes(
  attachment: Record<string, unknown>,
  env: RuntimeEnv,
  fetcher: typeof fetch,
  emailId: string
): Promise<string | undefined> {
  if (typeof attachment.content === "string" && attachment.content.length > 0) {
    return attachment.content;
  }

  const apiKey = env.RESEND_API_KEY?.trim();

  if (apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }

  const auth = { authorization: `Bearer ${apiKey}` };

  try {
    let url = typeof attachment.download_url === "string" ? attachment.download_url : undefined;

    if (url === undefined) {
      // The id-only shape: ask Resend where the file lives before fetching it.
      const attachmentId = attachment.id;

      if (typeof attachmentId !== "string" || attachmentId.length === 0 || emailId.length === 0) {
        return undefined;
      }

      const lookup = await fetcher(
        `https://api.resend.com/emails/inbound/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
        { headers: auth }
      );

      if (!lookup.ok) {
        return undefined;
      }

      const described = (await lookup.json()) as { download_url?: unknown };
      url = typeof described.download_url === "string" ? described.download_url : undefined;

      if (url === undefined) {
        return undefined;
      }
    }

    /**
     * The download url is pre-signed and short-lived. Sending the API key to a
     * CDN host that did not ask for it leaks the credential, so it goes only on
     * the api.resend.com lookup above.
     */
    const response = await fetcher(url);

    return response.ok
      ? Buffer.from(await response.arrayBuffer()).toString("base64")
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hands the message to remittance intake.
 *
 * Never throws. Resend retries anything that is not a 2xx, and a refused
 * attachment is a settled answer rather than a delivery failure — retrying it
 * only repeats the refusal, and intake has already recorded it as work for a
 * person.
 */
export async function routeRemittanceEmail(input: {
  event: ResendInboundEventLike;
  env: RuntimeEnv;
  fetcher?: typeof fetch;
}): Promise<RemittanceRoutingResult> {
  const { event, env } = input;
  const fetcher = input.fetcher ?? fetch;

  const secret = env.RECOUP_INBOUND_SHARED_SECRET?.trim();
  const apiUrl = env.RECOUP_API_URL?.trim().replace(/\/$/u, "");

  if (secret === undefined || secret.length === 0 || apiUrl === undefined || apiUrl.length === 0) {
    return { status: "not_configured" };
  }

  const attachment = firstAttachment(event);

  if (attachment === undefined) {
    return { status: "no_attachment" };
  }

  const contentBase64 = await readAttachmentBytes(
    attachment,
    env,
    fetcher,
    readText(event.data?.email_id)
  );

  if (contentBase64 === undefined) {
    return { status: "no_attachment" };
  }

  const body = JSON.stringify({
    messageId: readText(event.data?.email_id),
    from: readText(event.data?.from),
    to: env.RECOUP_INBOUND_APPROVED_RECIPIENT?.trim() ?? "",
    subject: readText(event.data?.subject),
    receivedAt: readText(event.data?.created_at, new Date().toISOString()),
    attachment: {
      filename: readText(attachment.filename, "remittance"),
      mimeType: readText(attachment.content_type, "application/octet-stream"),
      contentBase64
    }
  });

  /**
   * Never throws out of here. This runs inside a webhook, and an exception
   * becomes a 500, which Resend reads as a delivery failure and retries.
   * An unreachable API is worth reporting, not worth replaying the same mail
   * against.
   */
  let response: Response;

  try {
    response = await fetcher(`${apiUrl}/inbound/remittance`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-recoup-signature": createHmac("sha256", secret).update(body).digest("hex")
      },
      body
    });
  } catch {
    return { status: "unreachable" };
  }

  if (response.ok) {
    return { status: "routed" };
  }

  const refusal = (await response.json().catch(() => ({}))) as { reason?: unknown };

  return {
    status: "refused",
    reason: typeof refusal.reason === "string" ? refusal.reason : String(response.status)
  };
}

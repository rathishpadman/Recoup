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
 * Inline `content` is the documented shape and the one the adapter test
 * assumed. Resend does not always use it, and an assumption checked only
 * against a stub is how most of the defects on this path got to production, so
 * the linked form is handled rather than trusted not to happen.
 */
async function readAttachmentBytes(
  attachment: Record<string, unknown>,
  env: RuntimeEnv,
  fetcher: typeof fetch
): Promise<string | undefined> {
  if (typeof attachment.content === "string" && attachment.content.length > 0) {
    return attachment.content;
  }

  const url = attachment.download_url;
  const apiKey = env.RESEND_API_KEY?.trim();

  if (typeof url !== "string" || apiKey === undefined || apiKey.length === 0) {
    return undefined;
  }

  try {
    const response = await fetcher(url, { headers: { authorization: `Bearer ${apiKey}` } });

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

  const contentBase64 = await readAttachmentBytes(attachment, env, fetcher);

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

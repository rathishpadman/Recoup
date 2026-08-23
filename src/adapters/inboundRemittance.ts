import { createHmac, timingSafeEqual } from "node:crypto";

import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import type { DemoAttachment } from "../services/attachmentSecurity.js";
import type { InboundMessage } from "../services/remittanceIntake.js";

/**
 * Provider-neutral inbound remittance port.
 *
 * D-03 has not named a provider, so this holds the canonical envelope and the
 * shape-mapping for each candidate rather than committing to one. Selecting a
 * provider is configuration, and an unrecognised value selects nothing: a
 * misconfigured deployment must accept no mail at all rather than silently
 * falling back to a default.
 *
 * ASSUMED AUTHENTICATION, NOT A RATIFIED PROVIDER SIGNATURE. The shared-secret
 * HMAC below keeps an anonymous caller from injecting a remittance. It is not
 * the approved-provider signature contract D-03 owns, it does not close D-03,
 * and it must be replaced when a provider is ratified.
 */

export type InboundProvider = "gmail" | "resend";

export type InboundParseFailure =
  | "not_configured"
  | "signature_invalid"
  | "unknown_provider"
  | "malformed_payload"
  | "attachment_missing";

export type InboundParseResult =
  | { ok: true; message: InboundMessage; attachment: DemoAttachment }
  | { ok: false; reason: InboundParseFailure };

/** Header each candidate provider signs with. */
const SIGNATURE_HEADER: Record<InboundProvider, string> = {
  gmail: "x-recoup-signature",
  resend: "resend-signature"
};

export function resolveInboundProvider(env: RuntimeEnv): InboundProvider | undefined {
  const configured = env.RECOUP_INBOUND_PROVIDER?.trim().toLowerCase();

  return configured === "gmail" || configured === "resend" ? configured : undefined;
}

/**
 * Senders permitted to originate a remittance. Unset means nobody: an empty
 * allowlist that accepted everyone would be the most dangerous possible
 * reading of a missing value.
 */
export function isAllowedInboundSender(sender: string, env: RuntimeEnv): boolean {
  const configured = env.RECOUP_INBOUND_ALLOWED_SENDERS?.trim();

  if (configured === undefined || configured.length === 0) {
    return false;
  }

  const allowed = configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return allowed.includes(sender.trim().toLowerCase());
}

function signatureMatches(rawBody: string, secret: string, presented: string | undefined): boolean {
  if (presented === undefined) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  // Some providers prefix the scheme; compare only the hex digest.
  const presentedBytes = Buffer.from(presented.trim().replace(/^sha256=/u, ""), "utf8");

  return (
    expectedBytes.length === presentedBytes.length && timingSafeEqual(expectedBytes, presentedBytes)
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function decodeAttachment(
  filename: unknown,
  mime: unknown,
  contentBase64: unknown
): DemoAttachment | undefined {
  if (typeof filename !== "string" || typeof contentBase64 !== "string") {
    return undefined;
  }

  return {
    filename,
    declaredMime: typeof mime === "string" ? mime : "application/octet-stream",
    bytes: Buffer.from(contentBase64, "base64").toString("utf8")
  };
}

/** Gmail has no inbound webhook of its own; a relay posts this shape. */
function parseGmail(payload: Record<string, unknown>): InboundParseResult {
  const attachmentRecord = asRecord(payload.attachment);

  if (attachmentRecord === undefined) {
    return { ok: false, reason: "attachment_missing" };
  }

  const attachment = decodeAttachment(
    attachmentRecord.filename,
    attachmentRecord.mimeType,
    attachmentRecord.contentBase64
  );

  const { messageId, from, to, subject, receivedAt } = payload;

  if (
    attachment === undefined ||
    typeof messageId !== "string" ||
    typeof from !== "string" ||
    typeof to !== "string"
  ) {
    return { ok: false, reason: "malformed_payload" };
  }

  return {
    ok: true,
    attachment,
    message: {
      provider: "gmail",
      providerEventId: messageId,
      messageId,
      // Verified by the transport above; the envelope records that it was.
      signature: "verified",
      recipient: to,
      sender: from,
      subject: typeof subject === "string" ? subject : "",
      attachmentRef: attachment.filename,
      receivedAt: typeof receivedAt === "string" ? receivedAt : new Date().toISOString()
    }
  };
}

function parseResend(payload: Record<string, unknown>): InboundParseResult {
  const data = asRecord(payload.data);

  if (data === undefined) {
    return { ok: false, reason: "malformed_payload" };
  }

  const attachments = Array.isArray(data.attachments) ? data.attachments : [];
  const first = asRecord(attachments[0]);

  if (first === undefined) {
    return { ok: false, reason: "attachment_missing" };
  }

  const attachment = decodeAttachment(first.filename, first.content_type, first.content);
  const messageId = data.email_id;
  const from = data.from;
  const recipients: unknown = data.to;
  const to: unknown = Array.isArray(recipients) ? recipients[0] : recipients;

  if (
    attachment === undefined ||
    typeof messageId !== "string" ||
    typeof from !== "string" ||
    typeof to !== "string"
  ) {
    return { ok: false, reason: "malformed_payload" };
  }

  return {
    ok: true,
    attachment,
    message: {
      provider: "resend",
      providerEventId: messageId,
      messageId,
      signature: "verified",
      recipient: to,
      sender: from,
      subject: typeof data.subject === "string" ? data.subject : "",
      attachmentRef: attachment.filename,
      receivedAt: typeof data.created_at === "string" ? data.created_at : new Date().toISOString()
    }
  };
}

export function parseInboundRequest(input: {
  env: RuntimeEnv;
  rawBody: string;
  headers: Record<string, string | undefined>;
}): InboundParseResult {
  const { env, rawBody, headers } = input;
  const provider = resolveInboundProvider(env);

  if (provider === undefined) {
    return { ok: false, reason: "unknown_provider" };
  }

  const secret = env.RECOUP_INBOUND_SHARED_SECRET?.trim();

  // No secret means the gate cannot be enforced, so nothing is accepted.
  if (secret === undefined || secret.length === 0) {
    return { ok: false, reason: "not_configured" };
  }

  if (!signatureMatches(rawBody, secret, headers[SIGNATURE_HEADER[provider]])) {
    return { ok: false, reason: "signature_invalid" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "malformed_payload" };
  }

  const record = asRecord(payload);

  if (record === undefined) {
    return { ok: false, reason: "malformed_payload" };
  }

  return provider === "gmail" ? parseGmail(record) : parseResend(record);
}

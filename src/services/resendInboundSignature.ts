import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend (Svix) inbound webhook signature verification.
 *
 * Extracted from the credit-negotiation inbound route so cash application uses
 * the same implementation rather than a second copy. Webhook signature checking
 * is exactly the code that must not be reimplemented per feature: two copies
 * drift, and the one that drifts is the one that stops rejecting forgeries.
 *
 * The signed payload is `{svix-id}.{svix-timestamp}.{rawBody}`, HMAC-SHA256
 * under the base64 secret that follows the `whsec_` prefix.
 */

/** Rejects replays older or newer than this, in seconds. */
export const RESEND_SIGNATURE_TOLERANCE_SECONDS = 300;

export interface ResendSignatureInput {
  headers: Headers;
  nowMs: number;
  rawBody: string;
  signingSecret: string;
}

function safeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  // Length must be compared separately: timingSafeEqual throws on a mismatch.
  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function decodeSvixSecret(secret: string): Buffer | undefined {
  const trimmed = secret.trim();
  if (!trimmed.startsWith("whsec_")) {
    return undefined;
  }

  const encoded = trimmed.slice("whsec_".length);
  if (encoded.length === 0 || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) {
    return undefined;
  }

  const decoded = Buffer.from(encoded, "base64");
  return decoded.length === 0 ? undefined : decoded;
}

export function verifyResendWebhookSignature(input: ResendSignatureInput): boolean {
  const webhookId = input.headers.get("svix-id")?.trim();
  const timestamp = input.headers.get("svix-timestamp")?.trim();
  const signatureHeader = input.headers.get("svix-signature")?.trim();

  if (webhookId === undefined || timestamp === undefined || signatureHeader === undefined) {
    return false;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Math.floor(input.nowMs / 1000) - timestampSeconds) > RESEND_SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const secret = decodeSvixSecret(input.signingSecret);
  if (secret === undefined) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.${input.rawBody}`)
    .digest("base64");

  return signatureHeader
    .split(/\s+/u)
    .flatMap((entry) => {
      const [version, signature, extra] = entry.split(",");
      return version === "v1" && signature !== undefined && extra === undefined ? [signature] : [];
    })
    .some((signature) => safeEqualStrings(signature, expected));
}

/**
 * Builds the signature verifier the remittance intake expects, closing over the
 * configured secret. Returns undefined when no secret is configured, so intake
 * fails closed rather than accepting unsigned mail.
 */
export function createResendSignatureVerifier(
  env: Partial<Record<string, string | undefined>>,
  now: () => number = () => Date.now()
): ((input: { headers: Headers; rawBody: string }) => boolean) | undefined {
  const signingSecret = env.RESEND_INBOUND_SIGNING_SECRET?.trim();

  if (signingSecret === undefined || signingSecret.length === 0) {
    return undefined;
  }

  return (input) =>
    verifyResendWebhookSignature({
      headers: input.headers,
      nowMs: now(),
      rawBody: input.rawBody,
      signingSecret
    });
}

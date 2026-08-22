import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createResendSignatureVerifier,
  decodeSvixSecret,
  verifyResendWebhookSignature
} from "../../src/services/resendInboundSignature.js";

const secretBytes = Buffer.from("cash-application-test-secret-value");
const signingSecret = `whsec_${secretBytes.toString("base64")}`;
const nowMs = Date.UTC(2026, 7, 22, 9, 0, 0);
const timestamp = String(Math.floor(nowMs / 1000));
const rawBody = JSON.stringify({ type: "email.received" });

function sign(id: string, ts: string, body: string): string {
  return createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64");
}

function headersFor(overrides: Record<string, string> = {}): Headers {
  return new Headers({
    "svix-id": "msg_1",
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sign("msg_1", timestamp, rawBody)}`,
    ...overrides
  });
}

describe("Resend inbound signature verification", () => {
  it("accepts a correctly signed webhook", () => {
    expect(
      verifyResendWebhookSignature({ headers: headersFor(), nowMs, rawBody, signingSecret })
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(
      verifyResendWebhookSignature({
        headers: headersFor(),
        nowMs,
        rawBody: JSON.stringify({ type: "email.received", injected: true }),
        signingSecret
      })
    ).toBe(false);
  });

  it("rejects a forged signature", () => {
    expect(
      verifyResendWebhookSignature({
        headers: headersFor({ "svix-signature": "v1,ZmFrZXNpZ25hdHVyZQ==" }),
        nowMs,
        rawBody,
        signingSecret
      })
    ).toBe(false);
  });

  it("rejects a replay outside the tolerance window", () => {
    const oldTimestamp = String(Math.floor(nowMs / 1000) - 600);
    expect(
      verifyResendWebhookSignature({
        headers: headersFor({
          "svix-timestamp": oldTimestamp,
          "svix-signature": `v1,${sign("msg_1", oldTimestamp, rawBody)}`
        }),
        nowMs,
        rawBody,
        signingSecret
      })
    ).toBe(false);
  });

  it("accepts a correctly signed webhook inside the tolerance window", () => {
    const recent = String(Math.floor(nowMs / 1000) - 60);
    expect(
      verifyResendWebhookSignature({
        headers: headersFor({
          "svix-timestamp": recent,
          "svix-signature": `v1,${sign("msg_1", recent, rawBody)}`
        }),
        nowMs,
        rawBody,
        signingSecret
      })
    ).toBe(true);
  });

  it.each(["svix-id", "svix-timestamp", "svix-signature"])("rejects a missing %s", (header) => {
    const headers = headersFor();
    headers.delete(header);
    expect(verifyResendWebhookSignature({ headers, nowMs, rawBody, signingSecret })).toBe(false);
  });

  it("rejects a signature bound to a different message id", () => {
    expect(
      verifyResendWebhookSignature({
        headers: headersFor({ "svix-signature": `v1,${sign("msg_other", timestamp, rawBody)}` }),
        nowMs,
        rawBody,
        signingSecret
      })
    ).toBe(false);
  });

  it("ignores signature entries that are not v1", () => {
    expect(
      verifyResendWebhookSignature({
        headers: headersFor({ "svix-signature": `v2,${sign("msg_1", timestamp, rawBody)}` }),
        nowMs,
        rawBody,
        signingSecret
      })
    ).toBe(false);
  });

  it("accepts when one of several space-separated signatures matches", () => {
    expect(
      verifyResendWebhookSignature({
        headers: headersFor({
          "svix-signature": `v1,ZmFrZQ== v1,${sign("msg_1", timestamp, rawBody)}`
        }),
        nowMs,
        rawBody,
        signingSecret
      })
    ).toBe(true);
  });
});

describe("svix secret decoding", () => {
  it("requires the whsec_ prefix", () => {
    expect(decodeSvixSecret(secretBytes.toString("base64"))).toBeUndefined();
  });

  it.each(["whsec_", "whsec_!!!!", "whsec_A"])("rejects malformed secret %s", (secret) => {
    expect(decodeSvixSecret(secret)).toBeUndefined();
  });

  it("decodes a valid secret", () => {
    expect(decodeSvixSecret(signingSecret)?.equals(secretBytes)).toBe(true);
  });
});

describe("the intake verifier fails closed", () => {
  it("returns undefined when no secret is configured", () => {
    expect(createResendSignatureVerifier({})).toBeUndefined();
    expect(createResendSignatureVerifier({ RESEND_INBOUND_SIGNING_SECRET: "   " })).toBeUndefined();
  });

  it("verifies against the configured secret when present", () => {
    const verify = createResendSignatureVerifier(
      { RESEND_INBOUND_SIGNING_SECRET: signingSecret },
      () => nowMs
    );

    expect(verify).toBeDefined();
    expect(verify?.({ headers: headersFor(), rawBody })).toBe(true);
    expect(verify?.({ headers: headersFor(), rawBody: "tampered" })).toBe(false);
  });
});

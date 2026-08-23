import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  isAllowedInboundSender,
  parseInboundRequest,
  resolveInboundProvider
} from "../../src/adapters/inboundRemittance.ts";

/**
 * Provider-neutral inbound port, which the implementation spec names and the
 * repository did not have. D-03 has not selected a provider, so the port takes
 * two adapters behind a flag rather than assuming one.
 *
 * The shared secret here is NOT the approved provider signature D-03 will
 * ratify. It is a gate that keeps an unauthenticated caller from injecting a
 * remittance, and it is labelled as such so it cannot be mistaken for closure.
 */

const secret = "inbound-test-secret";

function sign(rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

const gmailBody = JSON.stringify({
  messageId: "MSG-1",
  from: "ar@customer.example",
  to: "remittance@recoup.example",
  subject: "Remittance advice PAY-1001",
  receivedAt: "2026-08-23T09:00:00.000Z",
  attachment: {
    filename: "remittance-PAY-1001.csv",
    mimeType: "text/csv",
    contentBase64: Buffer.from("header\nrow", "utf8").toString("base64")
  }
});

const env = {
  RECOUP_INBOUND_PROVIDER: "gmail",
  RECOUP_INBOUND_SHARED_SECRET: secret,
  RECOUP_INBOUND_APPROVED_RECIPIENT: "remittance@recoup.example",
  RECOUP_INBOUND_ALLOWED_SENDERS: "ar@customer.example, billing@other.example"
};

describe("inbound remittance port", () => {
  it("selects the provider from configuration rather than assuming one", () => {
    expect(resolveInboundProvider({ ...env, RECOUP_INBOUND_PROVIDER: "gmail" })).toBe("gmail");
    expect(resolveInboundProvider({ ...env, RECOUP_INBOUND_PROVIDER: "resend" })).toBe("resend");
  });

  it("refuses an unknown provider instead of defaulting", () => {
    expect(resolveInboundProvider({ ...env, RECOUP_INBOUND_PROVIDER: "sendgrid" })).toBeUndefined();
    expect(resolveInboundProvider({})).toBeUndefined();
  });

  it("accepts a correctly signed message and yields the canonical envelope", () => {
    const result = parseInboundRequest({
      env,
      rawBody: gmailBody,
      headers: { "x-recoup-signature": sign(gmailBody) }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.provider).toBe("gmail");
    expect(result.message.sender).toBe("ar@customer.example");
    expect(result.message.recipient).toBe("remittance@recoup.example");
    expect(result.message.messageId).toBe("MSG-1");
    expect(result.attachment.filename).toBe("remittance-PAY-1001.csv");
    expect(result.attachment.bytes).toBe("header\nrow");
  });

  it("rejects a wrong signature", () => {
    const result = parseInboundRequest({
      env,
      rawBody: gmailBody,
      headers: { "x-recoup-signature": sign("tampered") }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("signature_invalid");
  });

  it("rejects a missing signature rather than treating absence as trust", () => {
    const result = parseInboundRequest({ env, rawBody: gmailBody, headers: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("signature_invalid");
  });

  it("refuses to run at all when no shared secret is configured", () => {
    const result = parseInboundRequest({
      env: { ...env, RECOUP_INBOUND_SHARED_SECRET: undefined },
      rawBody: gmailBody,
      headers: { "x-recoup-signature": sign(gmailBody) }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_configured");
  });

  it("reads the sender allowlist as a list, trimming entries", () => {
    expect(isAllowedInboundSender("ar@customer.example", env)).toBe(true);
    expect(isAllowedInboundSender("billing@other.example", env)).toBe(true);
    expect(isAllowedInboundSender("stranger@elsewhere.example", env)).toBe(false);
  });

  it("matches the allowlist without regard to case", () => {
    expect(isAllowedInboundSender("AR@Customer.Example", env)).toBe(true);
  });

  it("allows nobody when the allowlist is unset, rather than everybody", () => {
    expect(isAllowedInboundSender("ar@customer.example", { ...env, RECOUP_INBOUND_ALLOWED_SENDERS: undefined })).toBe(
      false
    );
  });

  it("parses the Resend inbound shape under its own signature header", () => {
    const resendEnv = { ...env, RECOUP_INBOUND_PROVIDER: "resend" };
    const body = JSON.stringify({
      data: {
        email_id: "MSG-R1",
        from: "ar@customer.example",
        to: ["remittance@recoup.example"],
        subject: "Remittance advice",
        created_at: "2026-08-23T09:00:00.000Z",
        attachments: [
          {
            filename: "r.csv",
            content_type: "text/csv",
            content: Buffer.from("a,b", "utf8").toString("base64")
          }
        ]
      }
    });

    const result = parseInboundRequest({
      env: resendEnv,
      rawBody: body,
      headers: { "resend-signature": sign(body) }
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.provider).toBe("resend");
    expect(result.message.messageId).toBe("MSG-R1");
    expect(result.attachment.bytes).toBe("a,b");
  });
});

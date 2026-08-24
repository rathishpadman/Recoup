import { describe, expect, it } from "vitest";

import {
  isRemittanceRecipient,
  routeRemittanceEmail
} from "../../src/services/remittanceEmailRouting.ts";

/**
 * Remittance mail arriving on the webhook that already exists.
 *
 * One Resend `email.received` webhook is registered, pointing at the credit
 * negotiation route. Registering a second one for remittance would be a change
 * to the Resend account, and the instruction was to use the same hook, so the
 * routing decision moves into the app: mail addressed to the remittance
 * mailbox is handed to remittance intake, everything else carries on to
 * negotiation exactly as before.
 *
 * The decision is made on the recipient alone. Nothing about the attachment is
 * inspected here — that is intake's job, behind the scanner, and this code runs
 * before any of it.
 */

const env = {
  RECOUP_INBOUND_APPROVED_RECIPIENT: "remittance@north-bay.dev",
  RECOUP_INBOUND_SHARED_SECRET: "test-secret",
  RECOUP_API_URL: "https://api.invalid"
};

function event(to: string[], attachments: unknown[] = [
  { filename: "advice.csv", content_type: "text/csv", content: Buffer.from("a,b", "utf8").toString("base64") }
]) {
  return {
    type: "email.received",
    data: {
      email_id: "EMAIL-1",
      from: "ar@customer.example",
      to,
      received_for: [],
      subject: "Remittance advice",
      created_at: "2026-08-24T09:00:00.000Z",
      attachments
    }
  };
}

describe("deciding whether mail is remittance", () => {
  it("recognises the configured mailbox", () => {
    expect(isRemittanceRecipient(event(["remittance@north-bay.dev"]), env)).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(isRemittanceRecipient(event(["  Remittance@North-Bay.dev "]), env)).toBe(true);
  });

  it("reads the received_for list too, which is where a catch-all lands", () => {
    const raw = event(["someone-else@north-bay.dev"]);
    raw.data.received_for = ["remittance@north-bay.dev"] as never;

    expect(isRemittanceRecipient(raw, env)).toBe(true);
  });

  it("leaves negotiation mail alone", () => {
    expect(isRemittanceRecipient(event(["credit@north-bay.dev"]), env)).toBe(false);
  });

  it("claims nothing when no mailbox is configured", () => {
    // Unconfigured must mean "not mine", never "everything is mine".
    expect(isRemittanceRecipient(event(["remittance@north-bay.dev"]), {})).toBe(false);
  });
});

describe("handing it to intake", () => {
  it("posts the canonical inbound shape", async () => {
    let seen: { url: string; body: Record<string, unknown> } | undefined;
    const fetcher = ((url: string, init: { body: string }) => {
      seen = { url, body: JSON.parse(init.body) as Record<string, unknown> };
      return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    }) as unknown as typeof fetch;

    await routeRemittanceEmail({ event: event(["remittance@north-bay.dev"]), env, fetcher });

    expect(seen?.url).toContain("/inbound/remittance");
    expect(seen?.body.messageId).toBe("EMAIL-1");
    expect(seen?.body.to).toBe("remittance@north-bay.dev");
  });

  it("signs the body so intake can verify it", async () => {
    let signature: string | undefined;
    const fetcher = ((_url: string, init: RequestInit) => {
      signature = (init.headers as Record<string, string>)["x-recoup-signature"];
      return Promise.resolve(new Response("{}", { status: 202 }));
    }) as unknown as typeof fetch;

    await routeRemittanceEmail({ event: event(["remittance@north-bay.dev"]), env, fetcher });

    expect(signature).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("carries the attachment through when Resend inlines it", async () => {
    let body: Record<string, unknown> | undefined;
    const fetcher = ((_url: string, init: { body: string }) => {
      body = JSON.parse(init.body) as Record<string, unknown>;
      return Promise.resolve(new Response("{}", { status: 202 }));
    }) as unknown as typeof fetch;

    await routeRemittanceEmail({ event: event(["remittance@north-bay.dev"]), env, fetcher });

    const attachment = body?.attachment as Record<string, unknown>;
    expect(attachment.filename).toBe("advice.csv");
    expect(Buffer.from(String(attachment.contentBase64), "base64").toString("utf8")).toBe("a,b");
  });

  it("fetches the attachment when Resend sends only a link", async () => {
    /**
     * Resend does not always inline the bytes. The adapter test that assumed it
     * did was written against a stub, which is exactly the shape of every other
     * defect on this path: the stub answered whatever the code asked.
     */
    const linked = event(["remittance@north-bay.dev"], [
      { filename: "advice.csv", content_type: "text/csv", download_url: "https://resend.invalid/att/1" }
    ]);

    const fetcher = ((url: string, init?: { body: string }) => {
      if (url.includes("resend.invalid")) {
        return Promise.resolve(new Response("x,y", { status: 200 }));
      }
      const body = JSON.parse(init?.body ?? "{}") as Record<string, unknown>;
      const attachment = body.attachment as Record<string, unknown>;
      expect(Buffer.from(String(attachment.contentBase64), "base64").toString("utf8")).toBe("x,y");
      return Promise.resolve(new Response("{}", { status: 202 }));
    }) as unknown as typeof fetch;

    const result = await routeRemittanceEmail({
      event: linked,
      env: { ...env, RESEND_API_KEY: "key" },
      fetcher
    });

    expect(result.status).toBe("routed");
  });

  it("says so plainly when the mail carried no attachment", async () => {
    const result = await routeRemittanceEmail({
      event: event(["remittance@north-bay.dev"], []),
      env,
      fetcher: () => Promise.reject(new Error("must not be called"))
    });

    expect(result.status).toBe("no_attachment");
  });

  it("does not throw when the API is unreachable", async () => {
    // An exception here becomes a 500, which Resend reads as a delivery
    // failure and retries — replaying the same mail against a dead API.
    const result = await routeRemittanceEmail({
      event: event(["remittance@north-bay.dev"]),
      env,
      fetcher: () => Promise.reject(new Error("ECONNREFUSED"))
    });

    expect(result.status).toBe("unreachable");
  });
  it("does not throw when intake refuses, because the webhook must still 200", async () => {
    // Resend retries a non-2xx. A refused attachment is a settled answer, not a
    // delivery failure, and retrying it just repeats the refusal.
    const result = await routeRemittanceEmail({
      event: event(["remittance@north-bay.dev"]),
      env,
      fetcher: () =>
        Promise.resolve(new Response(JSON.stringify({ reason: "attachment_unsupported" }), { status: 422 }))
    });

    expect(result.status).toBe("refused");
    expect(result.reason).toBe("attachment_unsupported");
  });
});

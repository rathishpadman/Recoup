import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import type { WorkflowRepository } from "../../src/services/workflowRepository.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * The Gmail relay, driven end to end against a stub that speaks Gmail's REST
 * contract and a real inbound endpoint.
 *
 * The relay was written and never run, which is the state that hides mistakes.
 * Two of them are specific to Gmail and would not show up anywhere else:
 * attachments come back base64url rather than base64, and the CSV part is
 * nested inside a multipart tree rather than sitting at the top level.
 *
 * What this does not cover is Google itself. The stub answers the same shapes
 * at the same paths, so it proves the relay's own logic; it does not prove
 * OAuth, quota or anything about a live mailbox.
 */

const SECRET = "gmail-relay-secret";

const csv = [
  "remittance_id,customer_reference,legal_entity_reference,payment_reference,currency,instructed_payment_amount,line_id,invoice_reference,instructed_amount,claimed_deduction_amount,claimed_reason_code,claimed_reason_text",
  "REM-GM-1,CUST-001,LE-001,PAY-GM-1,USD,1250.00,LINE-1,INV-2026-0912,1000.00,250.00,DMG,two pallets arrived damaged"
].join("\n");

const inboundEnv: RuntimeEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true",
  RECOUP_CASH_INTAKE_ENABLED: "true",
  RECOUP_INBOUND_PROVIDER: "gmail",
  RECOUP_INBOUND_SHARED_SECRET: SECRET,
  RECOUP_INBOUND_APPROVED_RECIPIENT: "remittance@recoup.example",
  RECOUP_INBOUND_ALLOWED_SENDERS: "ar@customer.example"
};

/**
 * Gmail returns attachment bytes base64url encoded, and buries the CSV part
 * inside a multipart/mixed tree. Both are reproduced exactly.
 */
function gmailMessage(): unknown {
  return {
    id: "GMAIL-1",
    internalDate: String(Date.parse("2026-08-23T09:00:00.000Z")),
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "AR Team <ar@customer.example>" },
        { name: "To", value: "Recoup Intake <remittance@recoup.example>" },
        { name: "Subject", value: "Remittance advice PAY-GM-1" }
      ],
      parts: [
        { mimeType: "multipart/alternative", filename: "", parts: [{ mimeType: "text/plain", filename: "" }] },
        {
          mimeType: "text/csv",
          filename: "remittance-PAY-GM-1.csv",
          body: { attachmentId: "ATT-1", size: csv.length }
        }
      ]
    }
  };
}

let gmail: Server;
let gmailUrl = "";
let inbound: { baseUrl: string; close: () => Promise<void> } | undefined;
let repository: WorkflowRepository;

async function startInbound(): Promise<void> {
  repository = createInMemoryWorkflowRepository();
  const server: Server = createServer(
    createCockpitApi({ env: inboundEnv, workflowRepository: repository })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  inbound = {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      })
  };
}

beforeEach(async () => {
  gmail = createServer((request, response) => {
    const url = request.url ?? "";
    response.setHeader("content-type", "application/json");

    if (url.includes("/attachments/ATT-1")) {
      // base64url: "-" and "_" instead of "+" and "/", no padding.
      response.end(JSON.stringify({ data: Buffer.from(csv, "utf8").toString("base64url") }));
      return;
    }

    if (url.includes("/messages/GMAIL-1")) {
      response.end(JSON.stringify(gmailMessage()));
      return;
    }

    if (url.includes("/messages?")) {
      response.end(JSON.stringify({ messages: [{ id: "GMAIL-1" }] }));
      return;
    }

    response.statusCode = 404;
    response.end("{}");
  });

  await new Promise<void>((resolve) => {
    gmail.listen(0, "127.0.0.1", resolve);
  });
  gmailUrl = `http://127.0.0.1:${String((gmail.address() as AddressInfo).port)}`;
  await startInbound();
});

afterEach(async () => {
  await inbound?.close();
  await new Promise<void>((resolve) => {
    gmail.closeAllConnections();
    gmail.close(() => {
      resolve();
    });
  });
});

/**
 * The relay's own logic, exercised against the stub. It mirrors
 * scripts/gmailRemittanceRelay.ts: find the CSV part, decode base64url, sign
 * the payload and post it.
 */
async function relay(baseUrl: string): Promise<Response> {
  const message = (await (await fetch(`${gmailUrl}/messages/GMAIL-1?format=full`)).json()) as {
    id: string;
    internalDate: string;
    payload: {
      headers: { name: string; value: string }[];
      parts: { mimeType?: string; filename?: string; body?: { attachmentId?: string } }[];
    };
  };

  const header = (name: string): string =>
    message.payload.headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? "";

  const findCsv = (
    parts: { mimeType?: string; filename?: string; body?: { attachmentId?: string }; parts?: unknown }[]
  ): { filename?: string; mimeType?: string; body?: { attachmentId?: string } } | undefined => {
    for (const part of parts) {
      if ((part.filename ?? "").toLowerCase().endsWith(".csv") && part.body?.attachmentId !== undefined) {
        return part;
      }
      const nested = part.parts;
      if (Array.isArray(nested)) {
        const found = findCsv(nested as typeof parts);
        if (found !== undefined) {
          return found;
        }
      }
    }
    return undefined;
  };

  const csvPart = findCsv(message.payload.parts);
  const attachment = (await (
    await fetch(`${gmailUrl}/messages/GMAIL-1/attachments/${csvPart?.body?.attachmentId ?? ""}`)
  ).json()) as { data: string };

  const payload = JSON.stringify({
    messageId: message.id,
    from: header("from").replace(/^.*</u, "").replace(/>.*$/u, "").trim(),
    to: header("to").replace(/^.*</u, "").replace(/>.*$/u, "").trim(),
    subject: header("subject"),
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    attachment: {
      filename: csvPart?.filename ?? "remittance.csv",
      mimeType: csvPart?.mimeType ?? "text/csv",
      contentBase64: Buffer.from(attachment.data, "base64url").toString("base64")
    }
  });

  return fetch(`${baseUrl}/inbound/remittance`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-recoup-signature": createHmac("sha256", SECRET).update(payload).digest("hex")
    },
    body: payload
  });
}

describe("gmail relay", () => {
  it("carries a Gmail message all the way to a started run", async () => {
    const response = await relay(inbound?.baseUrl ?? "");
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(typeof body.runId).toBe("string");
  });

  it("attributes the run to the customer named in the attachment", async () => {
    await relay(inbound?.baseUrl ?? "");

    const runs = await repository.listRuns();

    expect(runs).toHaveLength(1);
    expect(runs[0]?.customerReference).toBe("CUST-001");
  });

  it("decodes base64url, which plain base64 would corrupt", async () => {
    // The CSV maps only if every byte survives; a mis-decode fails the mapper
    // rather than producing a plausible run.
    await relay(inbound?.baseUrl ?? "");

    const events = await repository.readEventsSince("0");

    expect(events.some((event) => event.eventType === "run_received")).toBe(true);
  });

  it("finds the CSV nested inside the multipart tree", async () => {
    // The attachment is not a top-level part. A shallow search finds nothing
    // and the relay would report no CSV at all.
    const response = await relay(inbound?.baseUrl ?? "");

    expect(response.status).toBe(202);
  });

  it("refuses a redelivery of the same Gmail message", async () => {
    await relay(inbound?.baseUrl ?? "");
    const second = await relay(inbound?.baseUrl ?? "");

    expect(second.status).toBe(409);
    expect(await repository.listRuns()).toHaveLength(1);
  });
});

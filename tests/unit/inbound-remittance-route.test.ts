import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import { createCockpitApi } from "../../src/services/cockpitApi.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import type { WorkflowRepository } from "../../src/services/workflowRepository.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * POST /inbound/remittance is the entry point the pipeline never had: every
 * caller of the intake and the cash run lived in tests, so nothing deployed
 * could start a run.
 *
 * The gates asserted here are the ones that keep it from becoming an open
 * injection point: the rollout stage, the shared secret, the sender allowlist
 * and the approved recipient. Each must refuse on its own.
 */

const secret = "route-test-secret";
const csv = [
  "remittance_id,customer_reference,legal_entity_reference,payment_reference,currency,instructed_payment_amount,line_id,invoice_reference,instructed_amount,claimed_deduction_amount,claimed_reason_code,claimed_reason_text",
  'REM-E2E-1,CUST-001,LE-001,PAY-E2E-1,USD,1250.00,LINE-1,INV-1,1000.00,250.00,DMG,"damaged pallet"'
].join("\n");

const baseEnv: RuntimeEnv = {
  RECOUP_CASH_ROLLOUT_STAGE: "shadow",
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true",
  RECOUP_CASH_INTAKE_ENABLED: "true",
  RECOUP_INBOUND_PROVIDER: "gmail",
  RECOUP_INBOUND_SHARED_SECRET: secret,
  RECOUP_INBOUND_APPROVED_RECIPIENT: "remittance@recoup.example",
  RECOUP_INBOUND_ALLOWED_SENDERS: "ar@customer.example"
};

function body(
  overrides: {
    from?: string;
    to?: string;
    messageId?: string;
    filename?: string;
    mimeType?: string;
    content?: string;
  } = {}
): string {
  return JSON.stringify({
    messageId: overrides.messageId ?? "MSG-E2E-1",
    from: overrides.from ?? "ar@customer.example",
    to: overrides.to ?? "remittance@recoup.example",
    subject: "Remittance advice",
    receivedAt: "2026-08-23T09:00:00.000Z",
    attachment: {
      filename: overrides.filename ?? "remittance.csv",
      mimeType: overrides.mimeType ?? "text/csv",
      contentBase64: Buffer.from(overrides.content ?? csv, "utf8").toString("base64")
    }
  });
}

function sign(raw: string): string {
  return createHmac("sha256", secret).update(raw).digest("hex");
}

async function startApi(input: {
  env: RuntimeEnv;
  workflowRepository: WorkflowRepository;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer(
    createCockpitApi({ env: input.env, workflowRepository: input.workflowRepository })
  );
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () => new Promise<void>((resolve) => server.close(() => { resolve(); }))
  };
}

async function post(
  baseUrl: string,
  raw: string,
  headers: Record<string, string>
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/inbound/remittance`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: raw
  });

  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe("POST /inbound/remittance", () => {
  it("accepts a signed message from an allowed sender and starts a run", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      const raw = body();
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(result.status).toBe(202);
      expect(result.json.accepted).toBe(true);
      expect(typeof result.json.runId).toBe("string");

      const runs = await repository.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.customerReference).toBe("CUST-001");
    } finally {
      await api.close();
    }
  });

  it("is idempotent when the provider redelivers the same message", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      const raw = body();
      const first = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });
      const second = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(first.status).toBe(202);
      // A redelivery is refused as a replay rather than creating a second run.
      expect(second.status).toBe(409);
      expect(second.json.reason).toBe("replay_detected");
      expect(await repository.listRuns()).toHaveLength(1);
    } finally {
      await api.close();
    }
  });

  it("refuses a sender that is not on the allowlist", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      const raw = body({ from: "stranger@elsewhere.example" });
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(result.status).toBe(403);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("refuses a wrong signature", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      const raw = body();
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign("nope") });

      expect(result.status).toBe(401);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it("refuses mail addressed to something other than the approved recipient", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      const raw = body({ to: "someone-else@recoup.example" });
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(result.status).toBe(422);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  /**
   * AC-05. Before this, intake refused the file and the operations screen
   * showed nothing, so a customer’s note could be turned away with nobody
   * aware it had arrived.
   */
  it("leaves a visible blocker when the attachment cannot be read", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      const raw = body({ messageId: "MSG-BAD-1", content: "this is not a remittance at all" });
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(result.status).toBe(422);

      const runs = await repository.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.state).toBe("Review");

      const events = await repository.listEvents(runs[0]?.runId ?? "");
      expect(events[0]?.safeSummary ?? "").toMatch(/could not be read/iu);
    } finally {
      await api.close();
    }
  });

  it("still opens nothing for a request that may not be from a customer", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({ env: baseEnv, workflowRepository: repository });

    try {
      // Anyone who can reach the endpoint could otherwise fill the board.
      const raw = body({ messageId: "MSG-BAD-2", to: "someone-else@recoup.example" });
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(result.status).toBe(422);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
  it("is closed when the inbound kill switch is engaged", async () => {
    const repository = createInMemoryWorkflowRepository();
    const api = await startApi({
      env: { ...baseEnv, RECOUP_CASH_KILL_INBOUND: "true" },
      workflowRepository: repository
    });

    try {
      const raw = body();
      const result = await post(api.baseUrl, raw, { "x-recoup-signature": sign(raw) });

      expect(result.status).toBe(404);
      expect(await repository.listRuns()).toHaveLength(0);
    } finally {
      await api.close();
    }
  });
});

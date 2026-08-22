import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";
import {
  WORKER_ENABLED_FLAG,
  createWorkflowWorker,
  type CashRunControl
} from "../../src/services/workflowWorker.js";

/**
 * Phase 7A negative-gate evidence.
 *
 * Both refusal paths must leave persisted state byte-equivalent. A snapshot
 * hash before and after is the strongest cheap proof: any attempt increment,
 * lease acquisition, dead-letter row or extra event changes the digest.
 */

const demoEnv = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "MSG-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  mapperVersion: "csv-v1",
  lines: [
    {
      lineId: "LINE-1",
      invoiceReference: "INV-1",
      instructedAmount: "1000.00",
      claimedDeductionAmount: "250.00",
      claimedReasonCode: "DMG",
      sourceRecordIds: ["REM-SRC-1"]
    }
  ],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const validControl: CashRunControl = { enabled: true, maxAttempts: 5, maxWaitSeconds: 3600 };

async function snapshot(
  repository: ReturnType<typeof createInMemoryWorkflowRepository>,
  runId: string
): Promise<string> {
  const [run, events, cases] = await Promise.all([
    repository.getRun(runId),
    repository.listEvents(runId),
    repository.listCases()
  ]);

  return createHash("sha256")
    .update(JSON.stringify({ run, events, cases }))
    .digest("hex");
}

describe("a refused worker start mutates nothing", () => {
  it("leaves state byte-equivalent when the worker flag is absent", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const before = await snapshot(repository, outcome.runId);

    const claimDueCommands = vi.fn(() => Promise.resolve());
    const result = createWorkflowWorker({
      env: {},
      loadCashRunControl: () => validControl,
      claimDueCommands
    });

    const after = await snapshot(repository, outcome.runId);

    expect(result.status).toBe("refused");
    expect(claimDueCommands).not.toHaveBeenCalled();
    expect(after).toBe(before);
  });

  it("leaves state byte-equivalent when cash_run_control is missing", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const before = await snapshot(repository, outcome.runId);

    const claimDueCommands = vi.fn(() => Promise.resolve());
    const result = createWorkflowWorker({
      env: { [WORKER_ENABLED_FLAG]: "true" },
      loadCashRunControl: () => undefined,
      claimDueCommands
    });

    const after = await snapshot(repository, outcome.runId);

    expect(result.status).toBe("refused");
    expect(claimDueCommands).not.toHaveBeenCalled();
    expect(after).toBe(before);
  });

  it("leaves state byte-equivalent when cash_run_control is invalid", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });

    const before = await snapshot(repository, outcome.runId);

    const result = createWorkflowWorker({
      env: { [WORKER_ENABLED_FLAG]: "true" },
      loadCashRunControl: () => ({ enabled: true, maxAttempts: 0, maxWaitSeconds: 3600 })
    });

    const after = await snapshot(repository, outcome.runId);

    expect(result.status).toBe("refused");
    expect(after).toBe(before);
  });

  it("carries no claim-capable path at all in Phase 7A", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/services/workflowWorker.ts", "utf8");

    // Phase 7B owns claiming and leasing. Nothing here may acquire either.
    expect(source).not.toMatch(/\bclaimDueCommands\s*\(/u);
    expect(source).not.toMatch(/lease_owner|acquireLease|UPDATE/u);
    expect(source).not.toMatch(/setInterval|setTimeout/u);
  });
});

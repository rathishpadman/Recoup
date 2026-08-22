import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isRehearsalOnly,
  projectAgentOperations,
  projectAllocationForDisplay,
  projectLiveCase
} from "../../src/services/liveCaseReadModel.js";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";

/**
 * SA-CA-03: live cases never alter S1-S8 storage, enums or gold totals.
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

describe("live cases stay out of the gold set", () => {
  it("projects a live case with no scenario id", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    if (outcome.liveCase === undefined) throw new Error("expected a live case");

    const summary = projectLiveCase({
      liveCase: outcome.liveCase,
      receiptSourceSystem: "rehearsal-proxy"
    });

    expect(summary).not.toHaveProperty("scenarioId");
    expect(summary.origin).toBe("live_cash_application");
    expect(summary.caseId).not.toMatch(/^S\d+$/u);
  });

  it("reads no gold-set storage anywhere in the read model", () => {
    const source = readFileSync("src/services/liveCaseReadModel.ts", "utf8");
    expect(source).not.toMatch(/ScenarioId|scenarioId/u);
    expect(source).not.toMatch(/goldSet|gold_set|SyntheticDataset/u);
    expect(source).not.toMatch(/seed\s*[:=]\s*42/u);
  });

  it("marks a rehearsal receipt so the surface cannot imply live cash", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    if (outcome.liveCase === undefined) throw new Error("expected a live case");

    const summary = projectLiveCase({
      liveCase: outcome.liveCase,
      receiptSourceSystem: "rehearsal-proxy"
    });

    expect(summary.rehearsalOnly).toBe(true);
    expect(summary.provenanceMode).toBe("replay");
  });

  it.each([
    ["rehearsal-proxy", true],
    ["synthetic-source", true],
    ["demo-bank", true],
    ["sap-odata", false]
  ])("classifies %s correctly", (sourceSystem, expected) => {
    expect(isRehearsalOnly(sourceSystem)).toBe(expected);
  });

  it("carries money through as strings and performs no arithmetic", () => {
    const source = readFileSync("src/services/liveCaseReadModel.ts", "utf8");
    // Comments describe the rule; the code has to obey it, so inspect code only.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "");

    expect(code).not.toMatch(/Decimal/u);
    expect(code).not.toMatch(/parseFloat|parseInt|Number\(/u);
    // No arithmetic between identifiers at all in a presentation projection.
    expect(code).not.toMatch(/\b\w*[Aa]mount\w*\s*[+\-*/]\s*\w/u);
  });

  it("surfaces the assumed-policy caveat next to the numbers", () => {
    const display = projectAllocationForDisplay({
      allocationId: "ALLOC-1",
      receiptId: "CR-1",
      remittanceId: "REM-1",
      currency: "USD",
      receiptAmount: "1250.00",
      totalAppliedAmount: "1000.00",
      totalDeductionAmount: "250.00",
      totalUnappliedAmount: "0.00",
      reconciliationStatus: "balanced",
      policyVersion: "demo-allocation-policy-v1-ASSUMED",
      calculationVersion: "demo-calc-v1",
      lines: [],
      recordIds: ["REM-SRC-1"]
    });

    expect(display.assumedPolicy).toBe(true);
    expect(display.applied).toBe("1000.00");
  });
});

describe("agent operations rows derive from events, not from agent claims", () => {
  it("projects the last real event for a run", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env: demoEnv, repository });
    const run = await repository.getRun(outcome.runId);
    const events = await repository.listEvents(outcome.runId);
    if (run === undefined) throw new Error("expected a run");

    const row = projectAgentOperations({ run, events });

    expect(row?.runId).toBe(outcome.runId);
    expect(row?.lastEventType).toBe("maya_ready");
    expect(row?.blocked).toBe(false);
    expect(row?.caseId).toBe(outcome.caseId);
  });

  it("marks a blocked run blocked", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice: { ...advice, lines: [{ ...advice.lines[0], claimedReasonCode: "NOPE" }] },
      invoices,
      env: demoEnv,
      repository
    });

    const run = await repository.getRun(outcome.runId);
    const events = await repository.listEvents(outcome.runId);
    if (run === undefined) throw new Error("expected a run");

    expect(projectAgentOperations({ run, events })?.blocked).toBe(true);
  });

  it("returns nothing for a run with no events rather than inventing a status", async () => {
    const repository = createInMemoryWorkflowRepository();
    const run = await repository.createRun({
      runId: "RUN-EMPTY",
      workflowName: "cash_application_to_maya",
      workflowVersion: "v1",
      triggerType: "replay_email",
      triggerRecordId: "MSG-X",
      correlationId: "COR-X",
      state: "Received",
      currentPhase: "intake",
      provenanceMode: "replay",
      createdAt: "2026-08-22T09:00:00Z",
      updatedAt: "2026-08-22T09:00:00Z"
    });

    expect(projectAgentOperations({ run, events: [] })).toBeUndefined();
  });
});

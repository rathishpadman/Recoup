import { describe, expect, it } from "vitest";

import {
  describeCashRolloutPosture,
  isCashCapabilityEnabled,
  mayClaimLiveEffectiveness
} from "../../config/cashRollout.js";
import { startCashApplicationRun } from "../../src/services/cashApplicationRun.js";
import { createInMemoryWorkflowRepository } from "../../src/services/workflowRepository.js";

/**
 * Specification 17 rollout stages, exercised against the real pipeline rather
 * than against the config module alone.
 *
 * A stage table that nothing consults is decoration. These assertions run the
 * cash application path at each stage and check that what the stage permits is
 * what actually happens.
 */

const line = {
  lineId: "LINE-1",
  invoiceReference: "INV-1",
  instructedAmount: "1000.00",
  claimedDeductionAmount: "250.00",
  claimedReasonCode: "DMG",
  sourceRecordIds: ["REM-SRC-1"]
};

const advice = {
  remittanceId: "REM-1",
  inboundMessageId: "MSG-1",
  customerReference: "CUST-001",
  legalEntityReference: "LE-001",
  paymentReference: "PAY-1001",
  currency: "USD",
  instructedPaymentAmount: "1250.00",
  mapperVersion: "csv-v1-ASSUMED",
  lines: [line],
  sourceRecordIds: ["REM-SRC-1"],
  provenanceMode: "replay" as const
};

const invoices = [
  { invoiceRecordId: "INV-1", invoiceReference: "INV-1", balance: "1250.00", currency: "USD" }
];

const cashFlags = {
  RECOUP_CASH_REHEARSAL_ENABLED: "true",
  RECOUP_CASH_DEMO_POLICY_ENABLED: "true"
};

describe("stage disabled leaves the pipeline inert", () => {
  it("does not allocate with the stage unset and no cash flags", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: {},
      repository
    });

    expect(outcome.state).not.toBe("Ready");
    expect(await repository.listCases()).toHaveLength(0);
  });

  it("enables no capability at schema_only, so schema can ship before exposure", () => {
    const posture = describeCashRolloutPosture({ RECOUP_CASH_ROLLOUT_STAGE: "schema_only" });
    expect(posture.enabledCapabilities).toHaveLength(0);
    expect(posture.mayClaimLiveEffectiveness).toBe(false);
  });
});

describe("rehearsal stage runs the path without claiming anything live", () => {
  const env = { ...cashFlags, RECOUP_CASH_ROLLOUT_STAGE: "rehearsal" };

  it("completes a run to a Maya-ready case", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env, repository });

    expect(outcome.state).toBe("Ready");
    expect(outcome.caseId).toBeDefined();
  });

  it("stamps the case replay, never live", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env, repository });

    expect(outcome.liveCase?.provenanceMode).toBe("replay");
  });

  it("cites an assumed policy version so the caveat travels with the case", async () => {
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env, repository });

    expect(outcome.liveCase?.policyVersions.allocation).toContain("ASSUMED");
  });

  it("refuses a live effectiveness claim at this stage", () => {
    expect(mayClaimLiveEffectiveness(env)).toBe(false);
  });

  it("opens intake, claiming and the operations view", () => {
    expect(isCashCapabilityEnabled(env, "inbound_acceptance")).toBe(true);
    expect(isCashCapabilityEnabled(env, "command_claiming")).toBe(true);
    expect(isCashCapabilityEnabled(env, "agent_operations_exposure")).toBe(true);
  });

  it("still withholds live case creation and the Maya origin surface", () => {
    expect(isCashCapabilityEnabled(env, "live_case_creation")).toBe(false);
    expect(isCashCapabilityEnabled(env, "maya_live_origin_exposure")).toBe(false);
  });
});

describe("kill switches govern the pipeline, not just the config", () => {
  it("stops intake while leaving the worker able to drain what it accepted", () => {
    const env = {
      ...cashFlags,
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      RECOUP_CASH_KILL_INBOUND: "true"
    };

    expect(isCashCapabilityEnabled(env, "inbound_acceptance")).toBe(false);
    expect(isCashCapabilityEnabled(env, "command_claiming")).toBe(true);
  });

  it("hides the operations view without stopping evidence being recorded", async () => {
    const env = {
      ...cashFlags,
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      RECOUP_CASH_KILL_AGENT_OPS_UI: "true"
    };

    expect(isCashCapabilityEnabled(env, "agent_operations_exposure")).toBe(false);

    // Turning off the lights is not the same as stopping the work: the run
    // still completes and its events are still written.
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({ advice, invoices, env, repository });

    expect(outcome.state).toBe("Ready");
    expect((await repository.listEvents(outcome.runId)).length).toBeGreaterThan(0);
  });

  it("beats the stage even at production", () => {
    const posture = describeCashRolloutPosture({
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      RECOUP_CASH_KILL_INBOUND: "true",
      RECOUP_CASH_KILL_CLAIMING: "true",
      RECOUP_CASH_KILL_CASE_CREATION: "true",
      RECOUP_CASH_KILL_AGENT_OPS_UI: "true",
      RECOUP_CASH_KILL_MAYA_ORIGIN_UI: "true"
    });

    expect(posture.enabledCapabilities).toHaveLength(0);
    expect(posture.engagedKillSwitches).toHaveLength(5);
  });
});

describe("a stage bump alone does not promote demo data", () => {
  it("keeps the run inert at production when the cash flags are off", async () => {
    // Reaching the production stage must not be enough on its own. The demo
    // policy and rehearsal source are separately flagged, so an environment
    // that bumps only the stage gets nothing rather than silently allocating
    // against assumed values.
    const repository = createInMemoryWorkflowRepository();
    const outcome = await startCashApplicationRun({
      advice,
      invoices,
      env: { RECOUP_CASH_ROLLOUT_STAGE: "production" },
      repository
    });

    expect(outcome.state).not.toBe("Ready");
    expect(await repository.listCases()).toHaveLength(0);
  });
});

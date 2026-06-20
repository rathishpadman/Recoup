import { describe, expect, it } from "vitest";
import { decisionEvalBars } from "../../config/thresholds.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { calculateAccuracy } from "../../evals/harness.js";
import { buildSyntheticDataset } from "../../datagen/generate.js";
import { createInMemoryStore } from "../../src/memory/store.js";
import { readAgentHandoffPacket, readTransactionState } from "../../src/memory/session.js";

describe("Forensics Investigator hero run", () => {
  it("classifies the canonical settlement run with release-bar validity accuracy", () => {
    const run = runForensicsInvestigation();
    const labels = new Map(buildSyntheticDataset({ seed: 42 }).deductionLines.map((line) => [line.lineId, line.verdict]));
    const cases = run.decisions.map((decision) => ({
      predicted: decision.verdict,
      actual: labels.get(decision.lineId)
    }));

    expect(run.decisions).toHaveLength(20);
    expect(calculateAccuracy(cases)).toBeGreaterThanOrEqual(decisionEvalBars.deductionValidityAccuracy);
    expect(calculateAccuracy(cases)).toBe(1);
  });

  it("hands invalid and partial decisions to Recovery and routes valid decisions to draft Billing", () => {
    const run = runForensicsInvestigation();

    expect(run.actions.filter((action) => action.actionType === "route-billing")).toHaveLength(7);
    expect(run.actions.filter((action) => action.actionType === "draft-rebill")).toHaveLength(13);
    expect(run.actions.map((action) => action.status)).toEqual(Array<string>(20).fill("pending_human"));
    expect(run.actions.map((action) => action.dispatchedExternally)).toEqual(Array<boolean>(20).fill(false));
  });

  it("derives routing from computed verdicts instead of evaluation labels", () => {
    const run = runForensicsInvestigation();

    expect(run.decisions.every((decision) => !("actualVerdict" in decision))).toBe(true);
    expect(run.actions.filter((action) => action.actionType === "route-billing").map((action) => action.lineId)).toEqual(
      run.decisions.filter((decision) => decision.verdict === "valid").map((decision) => decision.lineId)
    );
    expect(run.actions.filter((action) => action.actionType === "draft-rebill").map((action) => action.lineId)).toEqual(
      run.decisions.filter((decision) => decision.verdict !== "valid").map((decision) => decision.lineId)
    );
  });

  it("emits a trace with a tool event, handoff, and Forensics model text delta", () => {
    const run = runForensicsInvestigation();

    expect(run.trace.some((event) => event.type === "finding" && event.payload.source === "tool")).toBe(true);
    expect(run.trace.some((event) => event.type === "status" && event.payload.kind === "handoff")).toBe(true);
    expect(run.trace.some((event) => event.type === "status" && event.payload.kind === "model-text-delta")).toBe(true);
  });

  it("records unresolved Appendix-G constants as blocked metadata rather than invented values", () => {
    const run = runForensicsInvestigation();

    expect(run.openDependencies).toEqual([
      "decision-confidence-threshold",
      "run-control-token-budget",
      "run-control-step-budget",
      "run-control-retry-cap"
    ]);
  });

  it("persists cited transaction and handoff memory when a memory store is supplied", () => {
    const store = createInMemoryStore();
    const run = runForensicsInvestigation({ memoryStore: store, sessionId: "unit-run" });

    const decision = run.decisions.find((candidate) => candidate.lineId === "S1-L1");
    expect(decision).toBeDefined();
    expect(readTransactionState(store, "S1-L1", "deduction-decision")).toMatchObject({
      category: "transaction_state",
      payload: {
        key: "deduction-decision",
        value: {
          confidence: "blocked: decision-confidence-threshold unset",
          decisionId: "deduction-decision:S1-L1",
          producedBy: "agent:forensics-investigator",
          routing: "billing",
          ruleId: "damage-evidence-valid",
          verdict: "valid"
        }
      },
      recordIds: decision?.recordIds
    });
    expect(readAgentHandoffPacket(store, "forensics-recovery:unit-run")).toMatchObject({
      category: "agent_handoff_packets",
      payload: {
        capability: "B",
        caseId: "unit-run",
        deterministicBasis: "runForensicsInvestigation trace + recoupHandoffGraph",
        fromAgent: "Forensics Investigator",
        intent: "stage-recovery-and-billing-drafts",
        status: "created",
        summary: "Forensics completed cited decisions and staged human-review recovery or Billing drafts.",
        toAgent: "Recovery Drafter"
      }
    });
  });
});

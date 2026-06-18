import { describe, expect, it } from "vitest";
import { decisionEvalBars } from "../../config/thresholds.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { calculateAccuracy } from "../../evals/harness.js";
import { buildSyntheticDataset } from "../../datagen/generate.js";

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
});

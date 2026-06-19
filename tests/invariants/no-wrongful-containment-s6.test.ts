import { describe, expect, it } from "vitest";
import { findWrongfulContainments, type CustomerIntentLabel } from "../../evals/harness.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";

describe("I-22 S6 no wrongful containment", () => {
  it("does not contain distressed-honest Harbor in the closed loop", () => {
    const labels: CustomerIntentLabel[] = [{ customerId: "CUST-HARBOR", intentLabel: "distressed-honest" }];
    const run = runRiskMeshClosedLoop();

    expect(findWrongfulContainments(labels, run.containmentDecisions)).toEqual([]);
  });
});

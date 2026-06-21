import { describe, expect, it } from "vitest";
import { arbitrationPnlWeights } from "../../config/weights.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";

describe("I-21 arbitration auditability", () => {
  it("audits Risk Mesh positions, supplied Day-1 weights, and blocked resolution", () => {
    const run = runRiskMeshClosedLoop();
    const arbitrationEntry = run.auditEntries.find((entry) => entry.entryType === "arbitration.blocked");

    expect(arbitrationEntry).toBeDefined();
    expect(arbitrationEntry?.payload).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      resolution: "blocked",
      weightsUsed: {
        billing: 0.15,
        collections: 0.25,
        credit: 0.35,
        fulfillment: 0.25
      }
    });
    expect(arbitrationEntry?.payload).toMatchObject({ weightsUsed: arbitrationPnlWeights });
    expect(arbitrationEntry?.recordIds).toContain("ORDER-HARBOR-640K");
    expect(run.auditTrailValid).toBe(true);
  });
});

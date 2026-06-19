import { describe, expect, it } from "vitest";
import { arbitrationPnlWeights } from "../../config/weights.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";

describe("I-21 arbitration auditability", () => {
  it("audits Risk Mesh positions, expert-weight placeholder, and blocked resolution", () => {
    const run = runRiskMeshClosedLoop();
    const arbitrationEntry = run.auditEntries.find((entry) => entry.entryType === "arbitration.blocked");

    expect(arbitrationEntry).toBeDefined();
    expect(arbitrationEntry?.payload).toMatchObject({
      caseId: "ARB-HARBOR-ORDER-640K",
      resolution: "blocked",
      weightsUsed: arbitrationPnlWeights
    });
    expect(arbitrationEntry?.recordIds).toContain("ORDER-HARBOR-640K");
    expect(run.auditTrailValid).toBe(true);
  });
});

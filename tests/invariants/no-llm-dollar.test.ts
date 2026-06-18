import { describe, expect, it } from "vitest";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";

describe("I-1 no model-supplied dollars in action outputs", () => {
  it("rejects legacy Billing-route payloads that carry free dollar amounts", () => {
    expect(() => {
      invokeServiceTool("actions.routeBilling", {
        lineId: "S1-L1",
        requestedAmount: "999.00",
        computedDeltaAmount: "100.00",
        recordIds: ["S1-L1", "PHOTO-CARRIER-1"],
        basis: "Damage claim supported by photo evidence and carrier report.",
        evidenceDocumentIds: ["PHOTO-CARRIER-1"]
      });
    }).toThrow();
  });

  it("rejects action tools without a deterministic decision provenance object", () => {
    expect(() => {
      invokeServiceTool("actions.routeBilling", {
        lineId: "S1-L1",
        requestedAmount: "100.00",
        computedDeltaAmount: "100.00",
        recordIds: ["S1-L1", "PHOTO-CARRIER-1"],
        basis: "Damage claim supported by photo evidence and carrier report.",
        evidenceDocumentIds: ["PHOTO-CARRIER-1"]
      });
    }).toThrow();
  });

  it("derives proposed action amounts from Forensics decision deltas only", () => {
    const run = runForensicsInvestigation();

    expect(
      run.actions.every((action) => {
        const decision = run.decisions.find((candidate) => candidate.lineId === action.lineId);
        return decision !== undefined && action.proposedAmount.equals(decision.deterministicBasis.computedDeltaAmount);
      })
    ).toBe(true);
  });
});

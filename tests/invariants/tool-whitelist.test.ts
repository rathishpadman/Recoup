import { describe, expect, it } from "vitest";
import { invokeServiceTool, serviceTools } from "../../src/services/serviceLayer.js";

describe("I-15 whitelisted typed tools", () => {
  it("exposes only bounded retrieval and draft action tools", () => {
    expect(Object.keys(serviceTools).sort()).toEqual([
      "actions.draftOutreach",
      "actions.draftRebill",
      "actions.proposeHold",
      "actions.proposeTerms",
      "actions.routeBilling",
      "approvals.decide",
      "audit.read",
      "core.evaluateRule",
      "core.riskMeshClosedLoop",
      "decisions.deductionVerdict",
      "query.answer",
      "retrieval.docs",
      "retrieval.sap",
      "retrieval.tpm"
    ]);
  });

  it("rejects free-form or non-whitelisted tool execution", () => {
    expect(() => invokeServiceTool("actions.erpWrite", {})).toThrow("Tool is not whitelisted.");
  });

  it("rejects malformed decision-tool payloads at the Zod service boundary", () => {
    expect(() => invokeServiceTool("decisions.deductionVerdict", { lineId: "S5-L1" })).toThrow();
  });

  it("keeps action tool schemas bounded to decision provenance instead of free dollar pairs", () => {
    expect(() =>
      invokeServiceTool("actions.draftRebill", {
        lineId: "S6-L1",
        requestedAmount: "100.00",
        computedDeltaAmount: "100.00",
        recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
        basis: "Deduction prices the line below the contracted price.",
        evidenceDocumentIds: ["PRICE-CLAUSE-1"]
      })
    ).toThrow();
  });

  it("rejects draft outreach payloads without decision provenance", () => {
    expect(() =>
      invokeServiceTool("actions.draftOutreach", {
        lineId: "S5-L1",
        recordIds: ["S5-L1", "POD-TIMESTAMP-1"],
        basis: "3PL POD timestamp shows delivery was on time."
      })
    ).toThrow();
  });

  it("rejects proposed hold payloads that bypass the deterministic closed-loop case", () => {
    expect(() =>
      invokeServiceTool("actions.proposeHold", {
        customerId: "CUST-HARBOR",
        releaseAmount: "352000.00"
      })
    ).toThrow();
  });

  it("records service-boundary tool invocations in the S4 trace", async () => {
    const { runForensicsInvestigation } = await import("../../src/agents/forensics.js");
    const run = runForensicsInvestigation();

    expect(run.trace.some((event) => event.type === "status" && event.payload.kind === "service-tool")).toBe(true);
    expect(run.trace.some((event) => event.type === "status" && event.payload.toolName === "core.evaluateRule")).toBe(true);
    expect(run.trace.some((event) => event.type === "status" && event.payload.toolName === "decisions.deductionVerdict")).toBe(
      true
    );
  });
});

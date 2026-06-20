import { describe, expect, it } from "vitest";
import { evaluateToolPermission } from "../../src/services/permissionEngine.js";
import { serviceToolMetadata } from "../../src/services/serviceLayer.js";

describe("tool permissions", () => {
  it("classifies every service tool by risk and side effect", () => {
    expect(Object.keys(serviceToolMetadata).sort()).toEqual([
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

  it("requires approval for approval-gated and draft action tools", () => {
    expect(evaluateToolPermission(serviceToolMetadata["actions.draftRebill"])).toMatchObject({
      decision: "approval_required",
      riskClass: "financial"
    });
    expect(evaluateToolPermission(serviceToolMetadata["retrieval.sap"])).toMatchObject({
      decision: "allow",
      riskClass: "read_only"
    });
  });

  it("enforces actor capabilities before allowing MCP-exposed tools", () => {
    expect(
      evaluateToolPermission(serviceToolMetadata["audit.read"], {
        actorCapabilities: ["read"],
        actorId: "human:cfo"
      })
    ).toMatchObject({
      decision: "allow",
      riskClass: "read_only"
    });
    expect(
      evaluateToolPermission(serviceToolMetadata["actions.draftRebill"], {
        actorCapabilities: ["read"],
        actorId: "human:cfo"
      })
    ).toMatchObject({
      decision: "deny",
      reason: "Actor is not permitted to create draft-only action artifacts."
    });
    expect(
      evaluateToolPermission(serviceToolMetadata["actions.draftRebill"], {
        actorCapabilities: ["draft_action", "read"],
        actorId: "human:maya-lead"
      })
    ).toMatchObject({
      decision: "approval_required",
      riskClass: "financial"
    });
  });
});

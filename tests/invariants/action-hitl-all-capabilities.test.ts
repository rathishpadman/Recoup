import { describe, expect, it } from "vitest";
import { decideApproval } from "../../src/services/approvals.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import { draftOutreach } from "../../src/tools/actions/draftOutreach.js";

describe("I-7 and I-20 HITL gate", () => {
  it("halts every Forensics external action at human approval", () => {
    const run = runForensicsInvestigation();

    expect(run.actions).toHaveLength(20);
    expect(run.actions.map((action) => action.requiresHumanApproval)).toEqual(Array<boolean>(20).fill(true));
    expect(run.actions.map((action) => action.status)).toEqual(Array<string>(20).fill("pending_human"));
    expect(run.actions.map((action) => action.dispatchedExternally)).toEqual(Array<boolean>(20).fill(false));
  });

  it("rejects approval decisions made by an agent identity", () => {
    const [firstAction] = runForensicsInvestigation().actions;
    if (firstAction === undefined) {
      throw new Error("Expected at least one proposed action");
    }

    expect(() =>
      decideApproval(firstAction, {
        decision: "approve",
        approverId: "agent:recovery-drafter"
      })
    ).toThrow("Approval requires a human approver.");
  });

  it("rejects approval decisions without a human identity prefix", () => {
    const [firstAction] = runForensicsInvestigation().actions;
    if (firstAction === undefined) {
      throw new Error("Expected at least one proposed action");
    }

    expect(() =>
      decideApproval(firstAction, {
        decision: "approve",
        approverId: "system:auto"
      })
    ).toThrow("Approval requires a human approver.");
  });

  it("halts drafted outreach at the same HITL approval gate", () => {
    const run = runForensicsInvestigation();
    const decision = run.decisions.find((candidate) => candidate.lineId === "S5-L1");
    if (decision === undefined) {
      throw new Error("Expected S5-L1 decision.");
    }

    const outreach = draftOutreach({
      decision
    });

    expect(outreach.status).toBe("pending_human");
    expect(outreach.dispatchedExternally).toBe(false);
    expect(() =>
      decideApproval(outreach, {
        decision: "approve",
        approverId: "agent:forensics-investigator"
      })
    ).toThrow("Approval requires a human approver.");
  });

  it("halts Risk Mesh hold and term proposals at human approval", () => {
    const run = runRiskMeshClosedLoop();

    for (const action of [run.holdAction, run.termsAction]) {
      expect(action.requiresHumanApproval).toBe(true);
      expect(action.status).toBe("pending_human");
      expect(action.dispatchedExternally).toBe(false);
      expect(() =>
        decideApproval(action, {
          decision: "approve",
          approverId: "agent:risk-mesh"
        })
      ).toThrow("Approval requires a human approver.");
    }
  });
});

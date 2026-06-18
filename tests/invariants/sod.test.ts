import { describe, expect, it } from "vitest";
import { decideApproval } from "../../src/services/approvals.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";

describe("I-8 segregation of duties", () => {
  it("blocks the proposer from approving its own proposed action", () => {
    const [firstAction] = runForensicsInvestigation().actions;
    if (firstAction === undefined) {
      throw new Error("Expected at least one proposed action");
    }

    expect(() =>
      decideApproval(firstAction, {
        decision: "approve",
        approverId: firstAction.proposedBy
      })
    ).toThrow("Proposer cannot approve its own action.");
  });
});

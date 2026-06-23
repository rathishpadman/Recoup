import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { decideApproval } from "../../src/services/approvals.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const runForensics = () => runForensicsInvestigation({ governedConfig, serviceContext: fixtureForensicsServiceContext, source });

describe("I-8 segregation of duties", () => {
  it("blocks the proposer from approving its own proposed action", () => {
    const [firstAction] = runForensics().actions;
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

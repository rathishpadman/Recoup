import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("Risk Mesh service/tool guardrail boundary", () => {
  it("keeps Risk Mesh action packaging behind service tool guardrails", () => {
    const source = readFileSync("src/agents/riskMesh.ts", "utf8");

    expect(source).not.toContain("../tools/actions/proposeHold.js");
    expect(source).not.toContain("../tools/actions/proposeTerms.js");
  });

  it("records hold and terms proposals as service-boundary tool calls", () => {
    const run = runRiskMeshClosedLoop({ governedConfig, source });

    expect(run.serviceToolNames).toEqual(["actions.proposeHold", "actions.proposeTerms"]);
    expect(run.holdAction.status).toBe("pending_human");
    expect(run.termsAction.status).toBe("pending_human");
  });

  it("keeps the public proposal tools bounded to the deterministic Harbor case", () => {
    const holdAction = invokeServiceTool("actions.proposeHold", {
      caseId: "ARB-HARBOR-ORDER-640K"
    }, { governedConfig, source });

    expect(holdAction).toMatchObject({
      actionId: "propose-hold:6534",
      amountSource: "partial-hold-core",
      dispatchedExternally: false,
      requiresHumanApproval: true,
      status: "pending_human"
    });
  });
});

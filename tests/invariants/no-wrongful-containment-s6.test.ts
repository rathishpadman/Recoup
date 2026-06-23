import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { findWrongfulContainments, type CustomerIntentLabel } from "../../evals/harness.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("I-22 S6 no wrongful containment", () => {
  it("does not contain distressed-honest Harbor in the closed loop", () => {
    const labels: CustomerIntentLabel[] = [{ customerId: "CUST-HARBOR", intentLabel: "distressed-honest" }];
    const run = runRiskMeshClosedLoop({ governedConfig, source });

    expect(findWrongfulContainments(labels, run.containmentDecisions)).toEqual([]);
  });
});

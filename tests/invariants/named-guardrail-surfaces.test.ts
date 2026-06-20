import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("named guardrail surfaces", () => {
  it("exposes the noWrongfulContainment tool guardrail as a named module", async () => {
    expect(existsSync("src/guardrails/tool/noWrongfulContainment.ts")).toBe(true);

    const { assertNoWrongfulContainment } = await import(
      "../../src/guardrails/tool/noWrongfulContainment.js"
    );

    expect(() => {
      assertNoWrongfulContainment({
        customerId: "CUST-HARBOR",
        intentLabel: "distressed-honest",
        contained: true,
        recordIds: ["CUST-HARBOR", "LEDGER-HARBOR-DISTRESSED-HONEST"],
        deterministicBasis: {
          gamingThresholds: "unset",
          noWrongfulContainment: false
        }
      });
    }).toThrow("Distressed-honest customers cannot be contained without approved gaming thresholds.");
  });

  it("exposes the intentEvidence tool guardrail as a named module", async () => {
    expect(existsSync("src/guardrails/tool/intentEvidence.ts")).toBe(true);

    const { assertIntentEvidence } = await import("../../src/guardrails/tool/intentEvidence.js");

    expect(() => {
      assertIntentEvidence({
        customerId: "CUST-RISK",
        intentLabel: "gaming",
        recordIds: ["CUST-RISK"],
        behavioralEvidenceIds: ["BEHAVIOR-RISK-1"],
        deterministicBasis: {
          rScoreComponents: undefined
        }
      });
    }).toThrow("Gaming intent labels require cited behavioral evidence and R-score components.");
  });

  it("exposes the final output guardrail as a named module", async () => {
    expect(existsSync("src/guardrails/output/final.ts")).toBe(true);

    const { assertFinalAgentOutput } = await import("../../src/guardrails/output/final.js");

    expect(() => {
      assertFinalAgentOutput({
        intentDecisions: [
          {
            customerId: "CUST-RISK",
            intentLabel: "gaming",
            recordIds: ["CUST-RISK"],
            behavioralEvidenceIds: ["BEHAVIOR-RISK-1"],
            deterministicBasis: {
              rScoreComponents: undefined
            }
          }
        ]
      });
    }).toThrow("Gaming intent labels require cited behavioral evidence and R-score components.");
  });
});

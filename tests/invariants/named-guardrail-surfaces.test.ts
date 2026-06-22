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

    expect(() => {
      assertNoWrongfulContainment({
        customerId: "CUST-RISK",
        intentLabel: "gaming",
        contained: true,
        recordIds: ["CUST-RISK", "RISK-LEDGER-1"],
        deterministicBasis: {
          gamingThresholds: "industry-model",
          noWrongfulContainment: true
        }
      });
    }).toThrow("Containment decisions require approved gaming thresholds.");
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

  it("accepts the Crestline M6 risk-review-only candidate through named intent and containment guardrails", async () => {
    const { assessCrestlineM6Containment } = await import("../../src/agents/containment.js");
    const { assertIntentEvidence } = await import("../../src/guardrails/tool/intentEvidence.js");
    const { assertNoWrongfulContainment } = await import(
      "../../src/guardrails/tool/noWrongfulContainment.js"
    );

    const candidate = assessCrestlineM6Containment();

    expect(candidate).toMatchObject({
      customerId: "CUST-CRESTLINE",
      intentLabel: "gaming",
      contained: false,
      posture: "hitl-risk-review-only",
      actionPosture: "no-external-action-staged",
      deterministicBasis: {
        gamingThresholds: "owner-ratified-day-1-seed-present",
        noWrongfulContainment: true
      }
    });
    expect(candidate.recordIds).toEqual(
      expect.arrayContaining(["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"])
    );
    expect(candidate.behavioralEvidenceIds).toEqual(
      expect.arrayContaining(["POD-SIGNED-1", "PRICE-CLAUSE-1"])
    );
    expect(Object.keys(candidate.deterministicBasis.rScoreComponents)).not.toHaveLength(0);
    expect(() => {
      assertIntentEvidence(candidate);
    }).not.toThrow();
    expect(() => {
      assertNoWrongfulContainment(candidate);
    }).not.toThrow();
  });
});

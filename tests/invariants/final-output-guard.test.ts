import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertFinalAgentOutput } from "../../src/guardrails/output/final.js";
import { money } from "../../src/types/money.js";

describe("final output guardrail", () => {
  it("blocks final deduction outputs that bypass evidence or explainability guards", () => {
    expect(() => {
      assertFinalAgentOutput({
        deductionDecisions: [
          {
            decisionId: "decision-missing-records",
            lineId: "S5-L1",
            verdict: "invalid",
            routing: "recovery",
            recordIds: [],
            basis: "",
            deterministicBasis: {
              amountSource: "core-rule-delta",
              computedDeltaAmount: money("10.00"),
              ruleId: "otif-timestamp-mismatch"
            },
            evidenceDocumentIds: [],
            producedBy: "agent:forensics-investigator",
            modelId: "gpt-5.5",
            confidence: "blocked: decision-confidence-threshold unset"
          }
        ]
      });
    }).toThrow("Decision requires cited recordIds and deterministic basis.");

    expect(() => {
      assertFinalAgentOutput({
        deductionDecisions: [
          {
            decisionId: "decision-missing-pod",
            lineId: "S5-L1",
            verdict: "invalid",
            routing: "recovery",
            recordIds: ["S5-L1", "POD-TIMESTAMP-1"],
            basis: "POD timestamp contradicts the OTIF fine.",
            deterministicBasis: {
              amountSource: "core-rule-delta",
              computedDeltaAmount: money("10.00"),
              ruleId: "otif-timestamp-mismatch"
            },
            evidenceDocumentIds: ["POD-TIMESTAMP-1"],
            evidenceDocuments: [],
            producedBy: "agent:forensics-investigator",
            modelId: "gpt-5.5",
            confidence: "blocked: decision-confidence-threshold unset"
          }
        ]
      });
    }).toThrow("Invalid or partial deduction decisions require the rule-specific support document.");
  });

  it("blocks final intent and containment outputs without behavioral and containment basis", () => {
    expect(() => {
      assertFinalAgentOutput({
        intentDecisions: [
          {
            customerId: "CUST-RISK",
            intentLabel: "gaming",
            recordIds: ["CUST-RISK"],
            behavioralEvidenceIds: [],
            deterministicBasis: {
              rScoreComponents: {}
            }
          }
        ]
      });
    }).toThrow("Gaming intent labels require cited behavioral evidence and R-score components.");

    const gamingContainmentWithoutIntentEvidence = {
      customerId: "CUST-RISK",
      intentLabel: "gaming",
      contained: false,
      recordIds: ["CUST-RISK"],
      deterministicBasis: {
        gamingThresholds: "owner-ratified-day-1-seed-present",
        noWrongfulContainment: true,
        rScoreComponents: {}
      }
    };

    expect(() => {
      assertFinalAgentOutput({
        containmentDecisions: [gamingContainmentWithoutIntentEvidence]
      });
    }).toThrow("Gaming intent labels require cited behavioral evidence and R-score components.");

    expect(() => {
      assertFinalAgentOutput({
        containmentDecisions: [
          {
            customerId: "CUST-HARBOR",
            intentLabel: "distressed-honest",
            contained: true,
            recordIds: ["CUST-HARBOR"],
            deterministicBasis: {
              gamingThresholds: "unset",
              noWrongfulContainment: false
            }
          }
        ]
      });
    }).toThrow("Distressed-honest customers cannot be contained without approved gaming thresholds.");
  });

  it("wires the final-output guard into agent finalization paths", () => {
    const forensics = readFileSync("src/agents/forensics.ts", "utf8");
    const riskMesh = readFileSync("src/agents/riskMesh.ts", "utf8");

    expect(forensics).toContain("assertFinalAgentOutput");
    expect(forensics).toContain("deductionDecisions: decisions");
    expect(riskMesh).toContain("assertFinalAgentOutput");
    expect(riskMesh).toContain("containmentDecisions: [containment]");
  });

  it("keeps final-output guard calls before handoff and proposal packaging", () => {
    const forensics = readFileSync("src/agents/forensics.ts", "utf8");
    const riskMesh = readFileSync("src/agents/riskMesh.ts", "utf8");

    const forensicsGuardIndex = forensics.indexOf("assertFinalAgentOutput({ deductionDecisions: decisions })");
    expect(forensicsGuardIndex).toBeGreaterThanOrEqual(0);
    expect(forensicsGuardIndex).toBeLessThan(forensics.indexOf('kind: "handoff"'));
    expect(forensicsGuardIndex).toBeLessThan(forensics.indexOf("const actions = decisions.map"));

    const riskMeshGuardIndex = riskMesh.indexOf("assertFinalAgentOutput({ containmentDecisions: [containment] })");
    expect(riskMeshGuardIndex).toBeGreaterThanOrEqual(0);
    expect(riskMeshGuardIndex).toBeLessThan(riskMesh.indexOf("const holdAction"));
    expect(riskMeshGuardIndex).toBeLessThan(riskMesh.indexOf("const termsAction"));
  });

  it("keeps model and agent output paths free of free dollar literals", () => {
    const scannedFiles = [
      ...listTypeScriptFiles("src/agents"),
      ...listTypeScriptFiles("src/tools/actions"),
      "src/services/realtimeSession.ts",
      "src/services/serviceLayer.ts"
    ];

    for (const filePath of scannedFiles) {
      const body = readFileSync(filePath, "utf8");
      expect(body, filePath).not.toMatch(/\$\s*\d/u);
    }
  });
});

function listTypeScriptFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = join(root, entry);
    if (statSync(fullPath).isDirectory()) {
      return listTypeScriptFiles(fullPath);
    }

    return fullPath.endsWith(".ts") ? [fullPath] : [];
  });
}

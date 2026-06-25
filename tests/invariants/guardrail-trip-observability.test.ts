import { describe, expect, it } from "vitest";
import {
  GuardrailTripError,
  isGuardrailTripError
} from "../../src/guardrails/trip.js";
import { assertFinalAgentOutput } from "../../src/guardrails/output/final.js";
import { assertDeductionEvidencePack } from "../../src/guardrails/tool/evidencePack.js";
import { assertDecisionExplainability } from "../../src/guardrails/tool/explainability.js";
import { money } from "../../src/types/money.js";

describe("guardrail trip observability", () => {
  it("types missing-record explainability trips without changing the message", () => {
    let thrown: unknown;

    try {
      assertDecisionExplainability({
        decisionId: "decision-missing-records",
        lineId: "S5-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: [],
        basis: "",
        deterministicBasis: {
          ruleId: "otif-timestamp-mismatch",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: ["POD-TIMESTAMP-1"],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GuardrailTripError);
    expect(isGuardrailTripError(thrown)).toBe(true);
    expect((thrown as Error).message).toBe("Decision requires cited recordIds and deterministic basis.");
    expect((thrown as GuardrailTripError).event).toEqual({
      eventType: "GuardrailTripEvent",
      guardrailName: "decision-explainability",
      reason: "Decision requires cited recordIds and deterministic basis.",
      recordIdStatus: "missing"
    });
  });

  it("includes available record IDs and present status on guardrail trips", () => {
    let thrown: unknown;

    try {
      assertDeductionEvidencePack({
        decisionId: "decision-wrong-support",
        lineId: "S6-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: ["S6-L1", "INV-WRONG-SUPPORT"],
        basis: "Invoice-only support does not satisfy the pricing rule.",
        deterministicBasis: {
          ruleId: "pricing-below-contract",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: ["INV-WRONG-SUPPORT"],
        evidenceDocuments: [
          {
            documentId: "INV-WRONG-SUPPORT",
            documentType: "invoice",
            source: "sap",
            summary: "Invoice is not the contract support document required by the pricing rule.",
            recordIds: ["INV-WRONG-SUPPORT"]
          }
        ],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GuardrailTripError);
    expect((thrown as Error).message).toBe(
      "Invalid or partial deduction decisions require the rule-specific support document."
    );
    expect((thrown as GuardrailTripError).event).toEqual({
      eventType: "GuardrailTripEvent",
      guardrailName: "deduction-evidence-pack",
      reason: "Invalid or partial deduction decisions require the rule-specific support document.",
      recordIds: ["S6-L1", "INV-WRONG-SUPPORT"],
      recordIdStatus: "present"
    });
  });

  it("freezes trip events so telemetry cannot be mutated after capture", () => {
    let thrown: unknown;
    const sourceRecordIds = ["S6-L1", "INV-WRONG-SUPPORT"];

    try {
      assertDeductionEvidencePack({
        decisionId: "decision-immutable-support",
        lineId: "S6-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: sourceRecordIds,
        basis: "Invoice-only support does not satisfy the pricing rule.",
        deterministicBasis: {
          ruleId: "pricing-below-contract",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: ["INV-WRONG-SUPPORT"],
        evidenceDocuments: [
          {
            documentId: "INV-WRONG-SUPPORT",
            documentType: "invoice",
            source: "sap",
            summary: "Invoice is not the contract support document required by the pricing rule.",
            recordIds: ["INV-WRONG-SUPPORT"]
          }
        ],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      });
    } catch (error) {
      thrown = error;
    }

    sourceRecordIds.push("MUTATED-CALLER");

    expect(thrown).toBeInstanceOf(GuardrailTripError);
    const event = (thrown as GuardrailTripError).event;
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.recordIds)).toBe(true);
    expect(() => {
      (event.recordIds as string[]).push("MUTATED-CATCHER");
    }).toThrow(TypeError);
    expect(event.recordIds).toEqual(["S6-L1", "INV-WRONG-SUPPORT"]);
  });

  it("propagates typed guardrail trips from final output checks", () => {
    let thrown: unknown;

    try {
      assertFinalAgentOutput({
        deductionDecisions: [
          {
            decisionId: "decision-final-missing-records",
            lineId: "S5-L1",
            verdict: "invalid",
            routing: "recovery",
            recordIds: [],
            basis: "",
            deterministicBasis: {
              ruleId: "otif-timestamp-mismatch",
              computedDeltaAmount: money("10.00"),
              amountSource: "core-rule-delta"
            },
            evidenceDocumentIds: ["POD-TIMESTAMP-1"],
            producedBy: "agent:forensics-investigator",
            modelId: "gpt-5.5",
            confidence: "blocked: decision-confidence-threshold unset"
          }
        ]
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GuardrailTripError);
    expect(isGuardrailTripError(thrown)).toBe(true);
    expect((thrown as Error).message).toBe("Decision requires cited recordIds and deterministic basis.");
    expect((thrown as GuardrailTripError).event.guardrailName).toBe("decision-explainability");
  });
});

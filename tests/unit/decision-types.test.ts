import { describe, expect, it } from "vitest";
import { buildDeductionDecision } from "../../src/services/decisionTools.js";
import { DeductionDecisionGuardInputSchema, DecisionEvidenceDocumentSchema } from "../../src/types/decision.js";

describe("decision type contracts", () => {
  it("parses deduction decisions with cited evidence and deterministic basis", () => {
    const evidenceDocument = DecisionEvidenceDocumentSchema.parse({
      documentId: "POD-SIGNED-1",
      source: "docs",
      documentType: "POD",
      summary: "Signed proof of delivery.",
      recordIds: ["S1-L1", "POD-SIGNED-1"]
    });

    expect(
      DeductionDecisionGuardInputSchema.parse({
        decisionId: "deduction-decision:S1-L1",
        lineId: "S1-L1",
        verdict: "valid",
        routing: "billing",
        recordIds: ["S1-L1", "POD-SIGNED-1"],
        basis: "Signed proof of delivery supports the deduction.",
        deterministicBasis: {
          ruleId: "damage-evidence-valid",
          computedDeltaAmount: "1250.00",
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: [evidenceDocument.documentId],
        evidenceDocuments: [evidenceDocument],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      })
    ).toMatchObject({
      decisionId: "deduction-decision:S1-L1",
      deterministicBasis: {
        amountSource: "core-rule-delta"
      }
    });
  });

  it("accepts Supabase-backed fallback evidence provenance for unavailable SAP evidence needs", () => {
    expect(
      DecisionEvidenceDocumentSchema.parse({
        documentId: "CREDIT-MEMO-1",
        source: "supabase",
        documentType: "credit-memo",
        summary: "Duplicate proof falls back to Supabase for R1.",
        recordIds: ["S8-L1", "CREDIT-MEMO-1"]
      })
    ).toMatchObject({
      documentId: "CREDIT-MEMO-1",
      source: "supabase"
    });
  });

  it("rejects decision records without cited records", () => {
    expect(() =>
      DeductionDecisionGuardInputSchema.parse({
        decisionId: "deduction-decision:S1-L1",
        lineId: "S1-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: [],
        basis: "Missing cited records.",
        deterministicBasis: {
          ruleId: "shortage-pod-mismatch",
          computedDeltaAmount: "1250.00",
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: [],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      })
    ).toThrow();
  });

  it("rejects decision tool inputs whose requested rule does not match the finding basis", () => {
    expect(() =>
      buildDeductionDecision({
        lineId: "S6-L1",
        ruleId: "damage-evidence-valid",
        finding: {
          ruleId: "pricing-below-contract",
          recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
          deltaAmount: "1250.00",
          basis: "Contract pricing is below the agreed term.",
          eventId: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        },
        evidenceDocuments: [
          {
            documentId: "PRICE-CLAUSE-1",
            source: "docs",
            documentType: "contract",
            summary: "Contract clause.",
            recordIds: ["S6-L1", "PRICE-CLAUSE-1"]
          }
        ],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5"
      })
    ).toThrow("Decision ruleId must match finding ruleId.");
  });
});

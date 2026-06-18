import { describe, expect, it } from "vitest";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { assertDeductionEvidencePack } from "../../src/guardrails/tool/evidencePack.js";
import { money } from "../../src/types/money.js";

describe("I-18 deduction evidence completeness", () => {
  it("blocks invalid or partial deductions without supporting documents", () => {
    expect(() => {
      assertDeductionEvidencePack({
        decisionId: "decision-without-docs",
        lineId: "S5-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: ["S5-L1"],
        basis: "POD timestamp contradicts the OTIF fine.",
        deterministicBasis: {
          ruleId: "otif-timestamp-mismatch",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: [],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset",
        evidenceDocuments: []
      });
    }
    ).toThrow("Invalid or partial deduction decisions require supporting documents.");
  });

  it("attaches supporting documents to every invalid or partial Forensics decision", () => {
    const run = runForensicsInvestigation();
    const recoveryDecisions = run.decisions.filter((decision) => decision.routing === "recovery");

    expect(recoveryDecisions).toHaveLength(13);
    expect(recoveryDecisions.every((decision) => decision.evidenceDocumentIds.length > 0)).toBe(true);
    expect(
      recoveryDecisions.every((decision) =>
        decision.evidenceDocumentIds.every((documentId) => decision.recordIds.includes(documentId))
      )
    ).toBe(true);
    expect(recoveryDecisions.every((decision) => decision.evidenceDocuments.length > 0)).toBe(true);
    expect(
      recoveryDecisions.every(
        (decision) => new Set(decision.evidenceDocuments.map((document) => document.documentId)).size === decision.evidenceDocuments.length
      )
    ).toBe(true);
  });
});

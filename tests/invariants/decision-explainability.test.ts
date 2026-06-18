import { describe, expect, it } from "vitest";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import { assertDecisionExplainability } from "../../src/guardrails/tool/explainability.js";
import { money } from "../../src/types/money.js";

describe("I-17 decision explainability", () => {
  it("blocks a decision without cited records and deterministic basis", () => {
    expect(() => {
      assertDecisionExplainability({
        decisionId: "decision-missing-basis",
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
    }
    ).toThrow("Decision requires cited recordIds and deterministic basis.");
  });

  it("blocks a decision when deterministic basis is malformed at runtime", () => {
    expect(() => {
      assertDecisionExplainability({
        decisionId: "decision-missing-delta",
        lineId: "S5-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: ["S5-L1", "POD-TIMESTAMP-1"],
        basis: "POD timestamp contradicts the OTIF fine.",
        deterministicBasis: {
          ruleId: "otif-timestamp-mismatch",
          computedDeltaAmount: undefined,
          amountSource: "model-text"
        },
        evidenceDocumentIds: ["POD-TIMESTAMP-1"],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      } as unknown as Parameters<typeof assertDecisionExplainability>[0]);
    }).toThrow("Decision requires cited recordIds and deterministic basis.");
  });

  it("blocks a decision when deterministic basis has an unknown rule id at runtime", () => {
    expect(() => {
      assertDecisionExplainability({
        decisionId: "decision-unknown-rule",
        lineId: "S5-L1",
        verdict: "invalid",
        routing: "recovery",
        recordIds: ["S5-L1", "POD-TIMESTAMP-1"],
        basis: "POD timestamp contradicts the OTIF fine.",
        deterministicBasis: {
          ruleId: "unknown-rule",
          computedDeltaAmount: money("10.00"),
          amountSource: "core-rule-delta"
        },
        evidenceDocumentIds: ["POD-TIMESTAMP-1"],
        producedBy: "agent:forensics-investigator",
        modelId: "gpt-5.5",
        confidence: "blocked: decision-confidence-threshold unset"
      } as unknown as Parameters<typeof assertDecisionExplainability>[0]);
    }).toThrow("Decision requires cited recordIds and deterministic basis.");
  });

  it("emits explainable Forensics verdicts for every canonical line", () => {
    const run = runForensicsInvestigation();

    expect(run.decisions.every((decision) => decision.recordIds.length > 0 && decision.basis.length > 0)).toBe(true);
    expect(run.decisions.map((decision) => decision.deterministicBasis.amountSource)).toEqual(
      Array<string>(20).fill("core-rule-delta")
    );
    expect(run.decisions.map((decision) => decision.confidence)).toEqual(
      Array<string>(20).fill("blocked: decision-confidence-threshold unset")
    );
  });
});

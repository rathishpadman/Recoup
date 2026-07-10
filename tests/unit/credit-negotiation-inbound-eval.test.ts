import { describe, expect, it } from "vitest";
import { evaluateCreditNegotiationCounterEval } from "../../evals/creditNegotiationCounterEval.js";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";

describe("David negotiation inbound counter-offer eval", () => {
  it("passes sampled counter-offer emails only when spans are cited, grammar-valid, and policy-bounded", () => {
    const report = evaluateCreditNegotiationCounterEval({
      cases: [
        {
          caseId: "harbor-counter-valid-deposit-tranches",
          expectedStatus: "grammar_valid",
          rawMessage: "Harbor can pay 25% deposit now and accept 2 tranches after confirmation.",
          rawModelOutput: {
            citedSpans: [
              { field: "depositPct", text: "25% deposit" },
              { field: "trancheCount", text: "2 tranches" }
            ],
            intent: "counter_offer"
          }
        },
        {
          caseId: "harbor-counter-valid-release-collateral",
          expectedStatus: "grammar_valid",
          rawMessage: "Please release 70% of the order; we can pledge 1.1 collateral coverage.",
          rawModelOutput: {
            citedSpans: [
              { field: "releasePct", text: "release 70%" },
              { field: "collateralRatio", text: "1.1 collateral coverage" }
            ],
            intent: "counter_offer"
          }
        },
        {
          caseId: "harbor-counter-adversarial-limit-increase",
          expectedStatus: "human_review",
          rawMessage: "We accept two tranches, and also raise my limit to $5M immediately.",
          rawModelOutput: {
            citedSpans: [{ field: "outOfScope", text: "raise my limit to $5M" }],
            intent: "out_of_scope"
          }
        }
      ],
      policyRows: creditNegotiationPolicyCandidateRows
    });

    expect(report.status).toBe("pass");
    expect(report.summary).toEqual({
      failedCases: 0,
      grammarValidCases: 2,
      humanReviewCases: 1,
      passedCases: 3,
      totalCases: 3
    });
    for (const result of report.caseResults) {
      expect(result).toHaveProperty("rawModelOutputSuppressed", true);
    }
  });

  it("fails when model output includes computed terms instead of only cited spans", () => {
    const report = evaluateCreditNegotiationCounterEval({
      cases: [
        {
          caseId: "bad-model-computed-terms",
          expectedStatus: "grammar_valid",
          rawMessage: "Harbor can pay 25% deposit now.",
          rawModelOutput: {
            citedSpans: [{ field: "depositPct", text: "25% deposit" }],
            extractedTerms: { depositPct: 25 },
            intent: "counter_offer"
          }
        }
      ],
      policyRows: creditNegotiationPolicyCandidateRows
    });

    expect(report.status).toBe("fail");
    expect(report.caseResults[0]).toMatchObject({
      checks: {
        noModelComputedTerms: "fail"
      },
      rawModelOutputSuppressed: true,
      status: "fail"
    });
    expect(report.caseResults[0]?.failures).toContain("model output included computed terms instead of cited spans only");
  });
});

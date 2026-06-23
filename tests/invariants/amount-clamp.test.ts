import { describe, expect, it } from "vitest";
import { draftRebill } from "../../src/tools/actions/draftRebill.js";
import { money } from "../../src/types/money.js";

describe("I-6 amount clamp", () => {
  it("clamps a recovery draft to the core-computed delta", () => {
    const draft = draftRebill({
      decision: buildDecision("100.00")
    });

    expect(draft.proposedAmount.equals(money("100.00"))).toBe(true);
    expect(draft.amountSource).toBe("core-computed-delta");
    expect(draft.status).toBe("pending_human");
    expect(draft.dispatchedExternally).toBe(false);
  });

  it("rejects a caller-supplied lower recovery amount instead of passing it through", () => {
    expect(() => {
      draftRebill({} as Parameters<typeof draftRebill>[0]);
    }).toThrow();
  });
});

function buildDecision(amount: string): Parameters<typeof draftRebill>[0]["decision"] {
  return {
    decisionId: "deduction-decision:S6-L1",
    lineId: "S6-L1",
    verdict: "invalid",
    routing: "recovery",
    recordIds: ["S6-L1", "PRICE-CLAUSE-1"],
    basis: "Deduction prices the line below the contracted price.",
    deterministicBasis: {
      ruleId: "pricing-below-contract",
      computedDeltaAmount: money(amount),
      amountSource: "core-rule-delta"
    },
    evidenceDocumentIds: ["PRICE-CLAUSE-1"],
    evidenceDocuments: [
      {
        documentId: "PRICE-CLAUSE-1",
        documentType: "contract",
        source: "docs",
        summary: "Contracted unit price supports the recovery amount.",
        recordIds: ["S6-L1", "PRICE-CLAUSE-1"]
      }
    ],
    producedBy: "agent:forensics-investigator",
    modelId: "gpt-5.5",
    confidence: "blocked: decision-confidence-threshold unset"
  };
}

import { describe, expect, it } from "vitest";
import {
  parseCreditNegotiationCounterOffer,
  validateCreditNegotiationCounterPolicy
} from "../../src/services/creditNegotiationCounterParser.js";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";

describe("David negotiation counter-offer parser", () => {
  it("extracts deal grammar numbers only from model-cited source spans", () => {
    const result = parseCreditNegotiationCounterOffer({
      modelExtraction: {
        citedSpans: [
          { field: "depositPct", text: "We can pay 20% deposit" },
          { field: "trancheCount", text: "accept 2 tranches" }
        ],
        intent: "counter_offer"
      },
      rawMessage: "We can pay 20% deposit and accept 2 tranches."
    });

    expect(result).toEqual({
      citedSpans: [
        { field: "depositPct", text: "We can pay 20% deposit" },
        { field: "trancheCount", text: "accept 2 tranches" }
      ],
      extractedTerms: {
        depositPct: 20,
        trancheCount: 2
      },
      intent: "counter_offer",
      status: "grammar_valid"
    });
  });

  it("accepts Gmail quoted line wrapping when model-cited spans preserve the same words", () => {
    const result = parseCreditNegotiationCounterOffer({
      modelExtraction: {
        citedSpans: [
          { field: "releasePct", text: "75% release" },
          { field: "depositPct", text: "40% deposit" },
          { field: "trancheCount", text: "3 payment tranches" },
          { field: "collateralRatio", text: "1.10x collateral coverage" },
          { field: "financingSpreadBps", text: "150 bps financing spread" }
        ],
        intent: "counter_offer"
      },
      rawMessage:
        "> Harbor Foods can accept 75% release with a 40% deposit, 3 payment\n" +
        "> tranches, 1.10x collateral coverage, and a 150 bps financing spread.\n"
    });

    expect(result).toMatchObject({
      extractedTerms: {
        collateralRatio: 1.1,
        depositPct: 40,
        financingSpreadBps: 150,
        releasePct: 75,
        trancheCount: 3
      },
      intent: "counter_offer",
      status: "grammar_valid"
    });
  });

  it("routes to human review when a cited field has no verbatim extractable number", () => {
    const result = parseCreditNegotiationCounterOffer({
      modelExtraction: {
        citedSpans: [{ field: "releasePct", text: "release most of the order" }],
        intent: "counter_offer"
      },
      rawMessage: "Please release most of the order."
    });

    expect(result).toMatchObject({
      reason: "Counter-offer cited span lacks an exact numeric value.",
      status: "human_review"
    });
    expect(JSON.stringify(result)).not.toContain("releasePct\":");
  });

  it("routes adversarial out-of-scope credit-limit asks to human review without extracting model dollars", () => {
    const result = parseCreditNegotiationCounterOffer({
      modelExtraction: {
        citedSpans: [{ field: "outOfScope", text: "also raise my limit to $5M" }],
        intent: "out_of_scope"
      },
      rawMessage: "We accept the deal, also raise my limit to $5M."
    });

    expect(result).toEqual({
      citedSpans: [{ field: "outOfScope", text: "also raise my limit to $5M" }],
      intent: "out_of_scope",
      reason: "Counter-offer is outside the approved negotiation grammar.",
      status: "human_review"
    });
    expect(JSON.stringify(result)).not.toContain("5000000");
  });

  it("routes span-grounded but out-of-policy counters to human review", () => {
    const parsed = parseCreditNegotiationCounterOffer({
      modelExtraction: {
        citedSpans: [
          { field: "depositPct", text: "We can pay 200% deposit" },
          { field: "trancheCount", text: "accept 99 tranches" }
        ],
        intent: "counter_offer"
      },
      rawMessage: "We can pay 200% deposit and accept 99 tranches."
    });

    const result = validateCreditNegotiationCounterPolicy(parsed, creditNegotiationPolicyCandidateRows);

    expect(result).toEqual({
      citedSpans: [
        { field: "depositPct", text: "We can pay 200% deposit" },
        { field: "trancheCount", text: "accept 99 tranches" }
      ],
      intent: "counter_offer",
      reason: "Counter-offer depositPct 200 exceeds policy max_deposit_pct 60.",
      status: "human_review"
    });
  });
});

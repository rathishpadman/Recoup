import { describe, expect, it } from "vitest";
import { selectGroundedAnswer } from "../../src/services/groundedAnswerGuard.js";
import { buildGroundedAnswerFacts } from "../../src/services/groundedAnswerGuard.js";

const facts = buildGroundedAnswerFacts({
  amounts: ["$15,900.00"],
  caseIds: ["S7"],
  counts: [8],
  customerNames: ["Harbor Foods"],
  recordIds: ["S7-L1"],
  routings: ["recovery"],
  ruleIds: ["promo-overclaim"],
  verdicts: ["partial"]
});

const deterministic = "S7 matches that question.";

describe("grounded answer selection", () => {
  it("prefers verified model prose over the deterministic sentence", () => {
    const selected = selectGroundedAnswer({
      deterministicAnswer: deterministic,
      facts,
      modelAnswer: "S7 for Harbor Foods is the promo-overclaim case, partial and routed to recovery for $15,900.00."
    });

    expect(selected.answer).toContain("promo-overclaim case");
    expect(selected.policy).toBe("verified_grounded");
  });

  it("falls back to the deterministic sentence when the model fabricates a figure", () => {
    const selected = selectGroundedAnswer({
      deterministicAnswer: deterministic,
      facts,
      modelAnswer: "S7 recovers $250,000.00 this quarter."
    });

    expect(selected.answer).toBe(deterministic);
    expect(selected.policy).toBe("rejected_ungrounded");
    expect(selected.rejectionReason).toContain("$250,000.00");
  });

  it("falls back when the model produced nothing", () => {
    const selected = selectGroundedAnswer({ deterministicAnswer: deterministic, facts });

    expect(selected.answer).toBe(deterministic);
    expect(selected.policy).toBe("suppressed");
  });

  it("never returns an empty answer", () => {
    const selected = selectGroundedAnswer({ deterministicAnswer: deterministic, facts, modelAnswer: "   " });

    expect(selected.answer).toBe(deterministic);
  });
});

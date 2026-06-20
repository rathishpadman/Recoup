import { describe, expect, it } from "vitest";
import { answerOfflineQuery } from "../../src/agents/query.js";

describe("offline query", () => {
  it("answers from cited deterministic state and open dependencies", () => {
    const answer = answerOfflineQuery({
      question: "Why is Harbor blocked?"
    });

    expect(answer.status).toBe("disabled_offline_safe");
    expect(answer.answer).toContain("r-score-weights-unset");
    expect(answer.answer).toContain("expert-arbitration-weights-unset");
    expect(answer.recordIds).toContain("CUST-HARBOR");
    expect(answer.recordIds).toContain("ORDER-HARBOR-640K");
    expect(answer.deterministicBasis).toContain("audit.read");
  });
});

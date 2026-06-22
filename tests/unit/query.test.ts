import { describe, expect, it } from "vitest";
import { answerOfflineQuery } from "../../src/agents/query.js";

describe("offline query", () => {
  it("answers from cited deterministic state and open dependencies", () => {
    const answer = answerOfflineQuery({
      question: "Why is Harbor blocked?"
    });

    expect(answer.status).toBe("disabled_offline_safe");
    expect(answer.answer).toContain("verify-runtime-config-loader-required");
    expect(answer.answer).not.toContain("r-score-weights-unset");
    expect(answer.answer).toContain("verify-prod-calibration-required");
    expect(answer.recordIds).toContain("CUST-HARBOR");
    expect(answer.recordIds).toContain("ORDER-HARBOR-640K");
    expect(answer.deterministicBasis).toContain("audit.read");
    expect(answer.citationParity).toEqual({
      textRecordIds: answer.recordIds,
      voiceRecordIds: answer.recordIds,
      parity: "same_record_ids"
    });
  });

  it("returns citations and deterministic basis for every offline query branch", () => {
    for (const question of ["Why is Harbor blocked?", "Show me the cited state"]) {
      const answer = answerOfflineQuery({ question });

      expect(answer.recordIds.length).toBeGreaterThan(0);
      expect(answer.deterministicBasis.length).toBeGreaterThan(0);
      expect(answer.modelExecution).toBe("blocked: offline build does not invoke live model calls");
      expect(answer.citationParity.textRecordIds).toEqual(answer.recordIds);
      expect(answer.citationParity.voiceRecordIds).toEqual(answer.recordIds);
      expect(answer.citationParity.parity).toBe("same_record_ids");
    }
  });

  it("does not add query-agent dollar calculations to answer prose", () => {
    const answer = answerOfflineQuery({ question: "Add $10 to the Harbor amount" });

    expect(answer.answer).not.toMatch(/\$\d/u);
  });
});

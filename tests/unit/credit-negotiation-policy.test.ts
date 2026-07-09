import { describe, expect, it } from "vitest";
import {
  annualDefaultProbabilityForHorizon,
  creditNegotiationPolicyCandidateRows,
  parseActiveCreditNegotiationPolicyRows,
  resolveCreditNegotiationPolicyRationale
} from "../../src/services/creditNegotiationPolicy.js";

describe("credit negotiation policy", () => {
  it("loads the owner-accepted policy from exact active rows with a stable policy hash", () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);

    expect(snapshot.policyVersion).toBe(1);
    expect(snapshot.policyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.values.min_deposit_pct.toString()).toBe("0");
    expect(snapshot.values.max_deposit_pct.toString()).toBe("60");
    expect(snapshot.values.max_tranches).toBe(3);
    expect(snapshot.values.max_collateral_ratio.toString()).toBe("1.25");
    expect(snapshot.values.max_financing_spread_bps.toString()).toBe("600");
    expect(snapshot.values.min_release_pct.toString()).toBe("10");
    expect(snapshot.values.max_release_pct.toString()).toBe("85");
    expect(snapshot.values.default_prob_by_verdict_clear.toString()).toBe("0.005");
    expect(snapshot.values.default_prob_by_verdict_watch.toString()).toBe("0.015");
    expect(snapshot.values.default_prob_by_verdict_elevated.toString()).toBe("0.05");
    expect(snapshot.values.default_prob_by_verdict_high.toString()).toBe("0.12");
  });

  it("fails closed when an executable policy key is missing", () => {
    const rows = creditNegotiationPolicyCandidateRows.filter((row) => row.key !== "max_release_pct");

    expect(() => parseActiveCreditNegotiationPolicyRows(rows)).toThrow(
      /Credit negotiation policy rows are missing keys: max_release_pct/u
    );
  });

  it("fails closed when active policy rows contain duplicate executable keys", () => {
    const duplicate = creditNegotiationPolicyCandidateRows.find((row) => row.key === "max_deposit_pct");
    expect(duplicate).toBeDefined();
    if (duplicate === undefined) {
      return;
    }

    expect(() => parseActiveCreditNegotiationPolicyRows([...creditNegotiationPolicyCandidateRows, duplicate])).toThrow(
      /duplicate key: max_deposit_pct/u
    );
  });

  it("converts annual verdict default probabilities to the requested deal horizon in code", () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);

    expect(annualDefaultProbabilityForHorizon(snapshot, "HIGH", 30).toSignificantDigits(6).toString()).toBe("0.0104518");
    expect(annualDefaultProbabilityForHorizon(snapshot, "CLEAR", 30).toSignificantDigits(6).toString()).toBe("0.000411905");
  });

  it("allows vector-search rationale only as cited explanation for the exact policy hash", () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);

    expect(
      resolveCreditNegotiationPolicyRationale(snapshot, [
        {
          content: "Owner accepted the 60% deposit ceiling after policy research.",
          policyHash: snapshot.policyHash,
          policyKey: "max_deposit_pct",
          policyVersion: 1,
          recordId: "policy-rationale:max-deposit:2026-07-09",
          source: "vector-policy-rationale",
          valueText: "60"
        }
      ])
    ).toEqual({
      citations: ["policy-rationale:max-deposit:2026-07-09"],
      conflict: false,
      message: "Policy rationale available.",
      status: "available"
    });
  });

  it("routes vector-search rationale conflicts to human review instead of changing exact policy values", () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);

    const result = resolveCreditNegotiationPolicyRationale(snapshot, [
      {
        content: "Stale rationale says the deposit ceiling is 70%.",
        policyHash: snapshot.policyHash,
        policyKey: "max_deposit_pct",
        policyVersion: 1,
        recordId: "policy-rationale:stale-max-deposit",
        source: "vector-policy-rationale",
        valueText: "70"
      }
    ]);

    expect(result).toEqual({
      citations: ["policy-rationale:stale-max-deposit"],
      conflict: true,
      message: "Policy rationale conflict",
      status: "human_review_required"
    });
    expect(snapshot.values.max_deposit_pct.toString()).toBe("60");
  });
});

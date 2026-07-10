import { describe, expect, it } from "vitest";
import { creditNegotiationPolicyCandidateRows } from "../../src/services/creditNegotiationPolicy.js";
import { buildCreditNegotiationPolicyReadinessReport } from "../../scripts/checkCreditNegotiationPolicyReadiness.js";

describe("credit negotiation policy readiness", () => {
  it("reports the local executable policy artifact ready only with exact owner approval markers", () => {
    const report = buildCreditNegotiationPolicyReadinessReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      rows: creditNegotiationPolicyCandidateRows
    });

    expect(report).toMatchObject({
      artifactType: "credit_negotiation_policy_readiness",
      blockers: [],
      noMutation: true,
      policyVersion: 1,
      status: "ready_for_policy_seed"
    });
    expect(report.policyHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(report.policyKeys).toContain("max_deposit_pct");
    expect(JSON.stringify(report)).not.toContain("human:owner-accepted-2026-07-09");
  });

  it("blocks when any executable row lacks the exact owner approval marker", () => {
    const rows = creditNegotiationPolicyCandidateRows.map((row) =>
      row.key === "max_deposit_pct" ? { ...row, approvedBy: "human:analyst-reviewed-not-owner" } : row
    );

    const report = buildCreditNegotiationPolicyReadinessReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      rows
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("Credit negotiation policy row max_deposit_pct is not owner accepted.");
  });

  it("blocks when an executable policy key is missing", () => {
    const rows = creditNegotiationPolicyCandidateRows.filter((row) => row.key !== "max_release_pct");

    const report = buildCreditNegotiationPolicyReadinessReport({
      generatedAt: "2026-07-10T00:00:00.000Z",
      rows
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("Credit negotiation policy rows are missing keys: max_release_pct.");
  });
});

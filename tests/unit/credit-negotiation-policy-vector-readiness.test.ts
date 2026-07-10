import { describe, expect, it } from "vitest";
import {
  buildCreditNegotiationPolicyVectorReadinessReport,
  formatCreditNegotiationPolicyVectorReadinessReport
} from "../../scripts/checkCreditNegotiationPolicyVectorReadiness.js";
import {
  creditNegotiationPolicyKeys,
  parseActiveCreditNegotiationPolicyRows,
  creditNegotiationPolicyCandidateRows
} from "../../src/services/creditNegotiationPolicy.js";

describe("credit negotiation policy vector readiness", () => {
  it("fails closed without required OpenAI vector-store env", async () => {
    let fetchCalls = 0;
    const report = await buildCreditNegotiationPolicyVectorReadinessReport({
      env: {},
      fetcher: () => {
        fetchCalls += 1;
        return Promise.resolve(new Response("{}", { status: 200 }));
      },
      generatedAt: "2026-07-10T00:00:00.000Z"
    });

    expect(report.status).toBe("blocked");
    expect(report.noMutation).toBe(true);
    expect(report.env.missing).toEqual(["OPENAI_API_KEY", "OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID"]);
    expect(report.blockers).toContain("OPENAI_API_KEY is required before policy-vector readiness can be proven.");
    expect(report.blockers).toContain("OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID is required before policy-vector readiness can be proven.");
    expect(fetchCalls).toBe(0);
  });

  it("proves every executable policy key is searchable by hash and version without exposing policy values", async () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
    const queriedKeys: string[] = [];
    const report = await buildCreditNegotiationPolicyVectorReadinessReport({
      env: {
        OPENAI_API_KEY: "sk-test-policy-vector",
        OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID: "vs_policy_test"
      },
      fetcher: (_url, init) => {
        if (typeof init.body !== "string") {
          throw new Error("Expected JSON request body.");
        }
        const body = JSON.parse(init.body) as { query?: unknown };
        const query = typeof body.query === "string" ? body.query : "";
        const key = creditNegotiationPolicyKeys.find((candidate) => query.includes(`policy_key:${candidate}`));
        if (key === undefined) {
          return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
        }
        queriedKeys.push(key);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    policy_hash: snapshot.policyHash,
                    policy_key: key,
                    policy_version: snapshot.policyVersion,
                    record_id: `policy-rationale:${key}:2026-07-09`,
                    source: "vector-policy-rationale"
                  },
                  content: [{ text: `Research rationale for ${key}.`, type: "text" }],
                  file_id: `file_${key}`,
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.94
                }
              ]
            }),
            { status: 200 }
          )
        );
      },
      generatedAt: "2026-07-10T00:00:00.000Z"
    });

    expect(report.status).toBe("ready_for_policy_vector_search");
    expect(report.blockers).toEqual([]);
    expect(report.policyHash).toBe(snapshot.policyHash);
    expect(report.policyVersion).toBe(snapshot.policyVersion);
    expect(report.checkedPolicyKeys).toEqual([...creditNegotiationPolicyKeys]);
    expect(report.rationaleRecordIds).toEqual(
      creditNegotiationPolicyKeys.map((key) => `policy-rationale:${key}:2026-07-09`)
    );
    expect(queriedKeys).toEqual([...creditNegotiationPolicyKeys]);
    expect(JSON.stringify(report)).not.toContain("sk-test-policy-vector");
    expect(Object.prototype.hasOwnProperty.call(report, "canonicalValueText")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(report, "policyValues")).toBe(false);
  });

  it("blocks when a policy key has no vector rationale hit for the current hash", async () => {
    const report = await buildCreditNegotiationPolicyVectorReadinessReport({
      env: {
        OPENAI_API_KEY: "sk-test-policy-vector",
        OPENAI_CREDIT_NEGOTIATION_POLICY_VECTOR_STORE_ID: "vs_policy_test"
      },
      fetcher: () => Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })),
      generatedAt: "2026-07-10T00:00:00.000Z"
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("No current policy-vector rationale found for min_deposit_pct.");
    expect(report.rationaleRecordIds).toEqual([]);
    expect(formatCreditNegotiationPolicyVectorReadinessReport(report)).toContain("\"noMutation\": true");
  });
});

import { describe, expect, it } from "vitest";
import { createOpenAiCreditNegotiationPolicyRationaleReader } from "../../src/adapters/openAiPolicyVectorStore.js";
import {
  creditNegotiationPolicyCandidateRows,
  parseActiveCreditNegotiationPolicyRows,
  resolveCreditNegotiationPolicyRationale
} from "../../src/services/creditNegotiationPolicy.js";

interface VectorSearchCall {
  body: {
    max_num_results?: unknown;
    query?: unknown;
  };
  url: string;
}

describe("credit negotiation policy vector search", () => {
  it("maps OpenAI vector search rationale to cited policy records without changing exact policy rows", async () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
    const calls: VectorSearchCall[] = [];
    const reader = createOpenAiCreditNegotiationPolicyRationaleReader({
      apiKey: "sk-test-policy-vector",
      fetcher: (url, init) => {
        if (typeof init.body !== "string") {
          throw new Error("Expected vector search body to be JSON text.");
        }
        calls.push({ body: JSON.parse(init.body) as VectorSearchCall["body"], url });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    policy_hash: snapshot.policyHash,
                    policy_key: "max_deposit_pct",
                    policy_version: 1,
                    provenance: "synthetic",
                    record_id: "policy-rationale:max-deposit:2026-07-09",
                    source: "vector-policy-rationale",
                    value_text: "60"
                  },
                  content: [{ text: "Owner accepted the 60% deposit ceiling after policy research.", type: "text" }],
                  file_id: "file_policy_max_deposit",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        );
      },
      vectorStoreId: "vs_policy_test"
    });

    const results = await reader.searchPolicyRationale({
      canonicalValueText: snapshot.canonicalValueText.max_deposit_pct,
      policyHash: snapshot.policyHash,
      policyKey: "max_deposit_pct",
      policyVersion: snapshot.policyVersion,
      question: "Why is max deposit capped at 60%?"
    });

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      return;
    }
    expect(call.url).toBe("https://api.openai.com/v1/vector_stores/vs_policy_test/search");
    expect(call.body.max_num_results).toBe(5);
    expect(typeof call.body.query).toBe("string");
    if (typeof call.body.query !== "string") {
      return;
    }
    expect(call.body.query).toContain("policy_key:max_deposit_pct");
    expect(results).toEqual([
      {
        content: "Owner accepted the 60% deposit ceiling after policy research.",
        policyHash: snapshot.policyHash,
        policyKey: "max_deposit_pct",
        policyVersion: 1,
        recordId: "policy-rationale:max-deposit:2026-07-09",
        source: "vector-policy-rationale"
      }
    ]);
    expect(results.some((result) => Object.prototype.hasOwnProperty.call(result, "valueText"))).toBe(false);
    expect(resolveCreditNegotiationPolicyRationale(snapshot, results)).toMatchObject({
      citations: ["policy-rationale:max-deposit:2026-07-09"],
      conflict: false,
      status: "available"
    });
    expect(snapshot.values.max_deposit_pct.toString()).toBe("60");
  });

  it("removes vector-side value_text metadata from cited rationale content", async () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
    const reader = createOpenAiCreditNegotiationPolicyRationaleReader({
      apiKey: "sk-test-policy-vector",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    policy_hash: snapshot.policyHash,
                    policy_key: "max_deposit_pct",
                    policy_version: 1,
                    record_id: "policy-rationale:max-deposit:2026-07-09",
                    source: "vector-policy-rationale",
                    value_text: "60"
                  },
                  content: [
                    {
                      text: [
                        "# David negotiation policy rationale: max_deposit_pct",
                        "policy_key: max_deposit_pct",
                        "value_text: 60",
                        "",
                        "The executable value is stored in the exact credit_negotiation_policy row."
                      ].join("\n"),
                      type: "text"
                    }
                  ],
                  file_id: "file_policy_max_deposit",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_policy_test"
    });

    const results = await reader.searchPolicyRationale({
      canonicalValueText: snapshot.canonicalValueText.max_deposit_pct,
      policyHash: snapshot.policyHash,
      policyKey: "max_deposit_pct",
      policyVersion: snapshot.policyVersion,
      question: "Why is max deposit capped at 60%?"
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.content).toContain("The executable value is stored in the exact credit_negotiation_policy row.");
    expect(results[0]?.content).not.toContain("value_text");
    expect(results[0]?.content).not.toContain("valueText");
  });

  it("filters vector rationale to the requested policy key, version, and hash before resolution", async () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
    const reader = createOpenAiCreditNegotiationPolicyRationaleReader({
      apiKey: "sk-test-policy-vector",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    policy_hash: snapshot.policyHash,
                    policy_key: "min_release_pct",
                    policy_version: 1,
                    record_id: "policy-rationale:min-release:2026-07-09",
                    source: "vector-policy-rationale",
                    value_text: "10"
                  },
                  content: [{ text: "Different policy rationale should not answer the max deposit question.", type: "text" }],
                  file_id: "file_policy_min_release",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.98
                },
                {
                  attributes: {
                    policy_hash: "stale-policy-hash",
                    policy_key: "max_deposit_pct",
                    policy_version: 1,
                    record_id: "policy-rationale:max-deposit:stale",
                    source: "vector-policy-rationale",
                    value_text: "60"
                  },
                  content: [{ text: "Stale policy rationale should not answer current policy questions.", type: "text" }],
                  file_id: "file_policy_stale_max_deposit",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.95
                },
                {
                  attributes: {
                    policy_hash: snapshot.policyHash,
                    policy_key: "max_deposit_pct",
                    policy_version: 1,
                    record_id: "policy-rationale:max-deposit:2026-07-09",
                    source: "vector-policy-rationale",
                    value_text: "60"
                  },
                  content: [{ text: "Owner accepted the 60% deposit ceiling after policy research.", type: "text" }],
                  file_id: "file_policy_max_deposit",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.91
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_policy_test"
    });

    const results = await reader.searchPolicyRationale({
      canonicalValueText: snapshot.canonicalValueText.max_deposit_pct,
      policyHash: snapshot.policyHash,
      policyKey: "max_deposit_pct",
      policyVersion: snapshot.policyVersion,
      question: "Why is max deposit capped at 60%?"
    });

    expect(results).toEqual([
      expect.objectContaining({
        policyHash: snapshot.policyHash,
        policyKey: "max_deposit_pct",
        policyVersion: 1,
        recordId: "policy-rationale:max-deposit:2026-07-09"
      })
    ]);
    expect(resolveCreditNegotiationPolicyRationale(snapshot, results)).toMatchObject({
      citations: ["policy-rationale:max-deposit:2026-07-09"],
      conflict: false,
      status: "available"
    });
  });

  it("keeps matching-key vector value conflicts visible for human review", async () => {
    const snapshot = parseActiveCreditNegotiationPolicyRows(creditNegotiationPolicyCandidateRows);
    const reader = createOpenAiCreditNegotiationPolicyRationaleReader({
      apiKey: "sk-test-policy-vector",
      fetcher: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    policy_hash: snapshot.policyHash,
                    policy_key: "max_deposit_pct",
                    policy_version: 1,
                    record_id: "policy-rationale:max-deposit:conflict",
                    source: "vector-policy-rationale",
                    value_text: "70"
                  },
                  content: [{ text: "Conflicting rationale says the ceiling is 70%.", type: "text" }],
                  file_id: "file_policy_conflict",
                  filename: "credit-negotiation-policy-rationale.md",
                  score: 0.93
                }
              ]
            }),
            { status: 200 }
          )
        ),
      vectorStoreId: "vs_policy_test"
    });

    const results = await reader.searchPolicyRationale({
      canonicalValueText: snapshot.canonicalValueText.max_deposit_pct,
      policyHash: snapshot.policyHash,
      policyKey: "max_deposit_pct",
      policyVersion: snapshot.policyVersion,
      question: "Why is max deposit capped at 60%?"
    });

    expect(results).toEqual([
      expect.objectContaining({
        policyKey: "max_deposit_pct",
        recordId: "policy-rationale:max-deposit:conflict",
        valueConflict: true
      })
    ]);
    expect(results.some((result) => Object.prototype.hasOwnProperty.call(result, "valueText"))).toBe(false);
    expect(resolveCreditNegotiationPolicyRationale(snapshot, results)).toMatchObject({
      citations: ["policy-rationale:max-deposit:conflict"],
      conflict: true,
      message: "Policy rationale conflict",
      status: "human_review_required"
    });
  });
});

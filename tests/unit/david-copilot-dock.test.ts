import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DavidNegotiationDraftPanel, DavidPolicyRationalePanel } from "../../cockpit/components/david/david-copilot-dock.tsx";

describe("David copilot negotiation draft panel", () => {
  it("renders agent-drafted and engine-priced negotiation options with rejection reasons", () => {
    const html = renderToStaticMarkup(
      React.createElement(DavidNegotiationDraftPanel, {
        draft: {
          deterministicBasis: "credit_negotiation.draft_structures + deterministic deal optimizer",
          model: {
            optimizerRunId: "credit-deal-optimizer:ORD-HARBOR-6534:source:policy:seed-42",
            orderId: "ORD-HARBOR-6534",
            policyHash: "policy-hash",
            rankedCandidates: [
              {
                calculationHash: "calc-hash",
                candidateId: "agent-max-release-85",
                objectiveValue: "75077.00",
                objectiveValueLabel: "$75,077.00",
                rank: 1,
                scenarioCount: 2,
                sourceRecordIds: ["credit_negotiation.draft_structures:agent-max-release-85"],
                terms: {
                  collateralRatioLabel: "1.25x collateral",
                  depositPctLabel: "60% deposit",
                  financingSpreadLabel: "100 bps spread",
                  releasePctLabel: "85% release",
                  trancheCountLabel: "3 tranches"
                }
              }
            ],
            rejectedCandidates: [
              {
                candidateId: "agent-over-deposit",
                reason: "depositPct 95 exceeds policy max_deposit_pct 60.",
                sourceRecordIds: ["credit_negotiation.draft_structures:agent-over-deposit"]
              }
            ],
            seed: 42,
            sourceHash: "source-hash",
            sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
          },
          toolName: "credit_negotiation.draft_structures"
        }
      })
    );

    expect(html).toContain("Agent-drafted");
    expect(html).toContain("Engine-priced");
    expect(html).toContain("agent-max-release-85");
    expect(html).toContain("$75,077.00");
    expect(html).toContain("85% release");
    expect(html).toContain("Rejected structures");
    expect(html).toContain("depositPct 95 exceeds policy max_deposit_pct 60.");
    expect(html).not.toContain("rawModelOutput");
  });
});

describe("David copilot policy rationale panel", () => {
  it("renders exact policy-row values separately from vector-cited rationale", () => {
    const html = renderToStaticMarkup(
      React.createElement(DavidPolicyRationalePanel, {
        rationale: {
          citations: [
            {
              content: "Owner accepted the 60% deposit ceiling after policy research.",
              deterministicBasis: "credit_negotiation_policy exact rows + OpenAI vector policy rationale search",
              recordId: "policy-rationale:max-deposit:2026-07-09",
              source: "vector-policy-rationale"
            }
          ],
          deterministicBasis: "credit_negotiation_policy exact rows + OpenAI vector policy rationale search",
          executablePolicySource: "credit_negotiation_policy",
          message: "Policy rationale available.",
          policyHash: "policy-hash-1234567890",
          policyKey: "max_deposit_pct",
          policyValueText: "60",
          policyVersion: 1,
          status: "available"
        }
      })
    );

    expect(html).toContain("Policy rationale");
    expect(html).toContain("Exact policy row");
    expect(html).toContain("credit_negotiation_policy");
    expect(html).toContain("max_deposit_pct");
    expect(html).toContain("60");
    expect(html).toContain("Vector rationale");
    expect(html).toContain("policy-rationale:max-deposit:2026-07-09");
    expect(html).toContain("Owner accepted the 60% deposit ceiling after policy research.");
    expect(html).toContain("policy-hash-");
    expect(html).not.toContain("valueText");
    expect(html).not.toContain("value_text");
  });
});

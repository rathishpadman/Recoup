import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canSendNegotiationEmailForAction,
  DavidNegotiationWorkbench,
  buildNegotiationApprovalPacket,
  buildNegotiationCommunicationFlow,
  davidNegotiationWorkbenchSheetClassName,
  defaultManualCounterRound,
  hasNegotiationCommunicationChanged,
  manualCounterRoundLabel,
  negotiationHydratedSendMessage,
  negotiationDraftRoundLabel,
  negotiationOrderReceivedLabel,
  negotiationRoundSummary,
  selectNegotiationDraftCandidate
} from "../../cockpit/components/david/david-negotiation-workbench.tsx";
import { buildDavidApprovalGateCopy, buildDavidApprovalGateTitle } from "../../cockpit/components/david/david-approval-gate-dialog.tsx";
import type { CreditRiskAccountModel, DealOptimizerCandidateModel } from "../../cockpit/app/cockpit-data.ts";

vi.mock("next/navigation.js", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
}));

describe("David negotiation workbench", () => {
  it("defaults manual counter capture to the latest sent backend round", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "sent"
      },
      latestSentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "sent"
      },
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    const html = renderToStaticMarkup(
      React.createElement(DavidNegotiationWorkbench, {
        account: {
          customer: "Harbor Foods",
          negotiationOrders: [order]
        } as CreditRiskAccountModel
      })
    );

    expect(defaultManualCounterRound(order)).toBe("2");
    expect(manualCounterRoundLabel(order)).toBe("Reply to outbound round 2");
    expect(negotiationDraftRoundLabel(order)).toBe("Next outbound round 3");
    expect(negotiationRoundSummary(order)).toBe("Latest sent round 2 / Next outbound round 3");
    expect(davidNegotiationWorkbenchSheetClassName).toContain("overflow-y-auto");
    expect(negotiationOrderReceivedLabel(order)).toBe("Order received $640,010.00");
    expect(html).toContain("Simulate alternatives");
  });

  it("summarizes a countered round without implying no outbound round was sent", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "countered"
      },
      nextRound: 2,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(negotiationRoundSummary(order)).toBe("Round 1 countered / Next outbound round 2");
    expect(manualCounterRoundLabel(order)).toBe("Reply to outbound round 1");
    expect(negotiationDraftRoundLabel(order)).toBe("Next outbound round 2");
  });

  it("defaults manual counter capture to the current countered round when it is newer than round one", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "countered"
      },
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(defaultManualCounterRound(order)).toBe("2");
    expect(manualCounterRoundLabel(order)).toBe("Reply to outbound round 2");
  });

  it("detects a newly countered customer reply from the lightweight communication status", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "sent"
      },
      nextRound: 2,
      orderId: "ORD-HARBOR-6534"
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(hasNegotiationCommunicationChanged(order, { round: 1, status: "countered" })).toBe(true);
    expect(hasNegotiationCommunicationChanged(order, { round: 1, status: "sent" })).toBe(false);
    expect(hasNegotiationCommunicationChanged(order, { round: 2, status: "sent" })).toBe(false);
    expect(hasNegotiationCommunicationChanged(order, { hasInboundReply: true, round: 2, status: "human_review" })).toBe(true);
  });

  it("shows a sent round as complete while the customer reply and next draft wait", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "sent"
      },
      latestSentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "sent"
      },
      nextRound: 2,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534"
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(buildNegotiationCommunicationFlow(order)).toEqual([
      expect.objectContaining({ detail: "$640,010.00", state: "complete", title: "Order received" }),
      expect.objectContaining({ detail: "Round 1 sent", state: "complete", title: "Outbound sent" }),
      expect.objectContaining({ detail: "Awaiting customer", state: "current", title: "Customer reply" }),
      expect.objectContaining({ detail: "Round 2 after reply", state: "waiting", title: "Governed draft" })
    ]);
  });

  it("advances the communication flow when the lightweight status detects a reply", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "sent"
      },
      latestSentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "sent"
      },
      nextRound: 2,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534"
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(buildNegotiationCommunicationFlow(order, {
      hasInboundReply: true,
      round: 1,
      status: "countered"
    })).toEqual([
      expect.objectContaining({ state: "complete", title: "Order received" }),
      expect.objectContaining({ detail: "Round 1 sent", state: "complete", title: "Outbound sent" }),
      expect.objectContaining({ detail: "Round 1 received", state: "complete", title: "Customer reply" }),
      expect.objectContaining({ detail: "Round 2 ready to evaluate", state: "current", title: "Governed draft" })
    ]);
  });

  it("builds the governed approval packet for the next negotiation round from the top deterministic candidate", () => {
    const order = {
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];
    const candidate = {
      candidateId: "max-release-85",
      objectiveValueLabel: "$75,077.00",
      sourceRecordIds: ["credit_deal_candidate_grid:max-release-85", "sim_3pl_inventory:ORD-HARBOR-6534:base"],
      terms: {
        collateralRatioLabel: "1.2x collateral",
        depositPctLabel: "60% deposit",
        financingSpreadLabel: "200 bps spread",
        releasePctLabel: "85% release",
        trancheCountLabel: "2 tranches"
      }
    } as DealOptimizerCandidateModel;

    const packet = buildNegotiationApprovalPacket(
      {
        accountId: "ACC-HAR",
        customer: "Harbor Foods"
      },
      order,
      candidate
    );

    expect(packet).toEqual({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r3",
      packetDetail:
        "Round 3 drafts max-release-85 for Harbor Foods: 85% release, 60% deposit, 2 tranches, 1.2x collateral, 200 bps spread. Objective value $75,077.00. Email send stays separately gated.",
      packetTitle: "Draft Harbor Foods counter",
      recordIds: [
        "credit-v2:negotiation:ORD-HARBOR-6534:r3",
        "ACC-HAR",
        "ORD-HARBOR-6534",
        "credit_orders:ORD-HARBOR-6534",
        "credit_deal_candidate_grid:max-release-85",
        "sim_3pl_inventory:ORD-HARBOR-6534:base"
      ],
      routeLabel: "Negotiation email",
      round: 3
    });
  });

  it("drafts from the priced customer counter candidate after a countered round", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "countered"
      },
      nextRound: 2,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];
    const rankedFirst = {
      candidateId: "max-release-85",
      objectiveValueLabel: "$75,077.00",
      rank: 1,
      sourceRecordIds: ["credit_deal_candidate_grid:max-release-85"],
      terms: {
        collateralRatioLabel: "1.25x collateral",
        depositPctLabel: "60% deposit",
        financingSpreadLabel: "100 bps spread",
        releasePctLabel: "85% release",
        trancheCountLabel: "3 tranches"
      }
    } as DealOptimizerCandidateModel;
    const customerCounter = {
      candidateId: "counter-offer:counter-harbor-r1-customer-terms",
      objectiveValueLabel: "$62,680.44",
      rank: 2,
      sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-customer-terms", "credit_deal_candidate_grid:max-release-85"],
      sourceRoundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      terms: {
        collateralRatioLabel: "1.25x collateral",
        depositPctLabel: "40% deposit",
        financingSpreadLabel: "100 bps spread",
        releasePctLabel: "75% release",
        trancheCountLabel: "2 tranches"
      }
    } as DealOptimizerCandidateModel;

    const selected = selectNegotiationDraftCandidate(order, {
      rankedCandidates: [rankedFirst, customerCounter]
    });
    const packet = buildNegotiationApprovalPacket({ accountId: "ACC-HAR", customer: "Harbor Foods" }, order, selected);

    expect(selected?.candidateId).toBe("counter-offer:counter-harbor-r1-customer-terms");
    expect(packet.packetDetail).toContain("Round 2 drafts counter-offer:counter-harbor-r1-customer-terms");
    expect(packet.packetDetail).toContain("75% release, 40% deposit, 2 tranches");
  });

  it("drafts from the current countered round when stale customer counters are also ranked", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "countered"
      },
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];
    const rankedFirst = {
      candidateId: "max-release-85",
      objectiveValueLabel: "$75,077.00",
      rank: 1,
      sourceRecordIds: ["credit_deal_candidate_grid:max-release-85"],
      terms: {
        collateralRatioLabel: "1.25x collateral",
        depositPctLabel: "60% deposit",
        financingSpreadLabel: "100 bps spread",
        releasePctLabel: "85% release",
        trancheCountLabel: "3 tranches"
      }
    } as DealOptimizerCandidateModel;
    const staleCounter = {
      candidateId: "counter-offer:counter-harbor-r1-customer-terms",
      objectiveValueLabel: "$62,680.44",
      rank: 2,
      sourceRecordIds: ["credit_counter_offers:counter-harbor-r1-customer-terms"],
      sourceRoundId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
      terms: {
        collateralRatioLabel: "1.25x collateral",
        depositPctLabel: "40% deposit",
        financingSpreadLabel: "100 bps spread",
        releasePctLabel: "75% release",
        trancheCountLabel: "2 tranches"
      }
    } as DealOptimizerCandidateModel & { sourceRoundId: string };
    const currentCounter = {
      candidateId: "counter-offer:counter-harbor-r2-customer-terms",
      objectiveValueLabel: "$62,506.85",
      rank: 3,
      sourceRecordIds: ["credit_counter_offers:counter-harbor-r2-customer-terms"],
      sourceRoundId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
      terms: {
        collateralRatioLabel: "1.25x collateral",
        depositPctLabel: "35% deposit",
        financingSpreadLabel: "100 bps spread",
        releasePctLabel: "75% release",
        trancheCountLabel: "2 tranches"
      }
    } as DealOptimizerCandidateModel & { sourceRoundId: string };

    const selected = selectNegotiationDraftCandidate(order, {
      rankedCandidates: [rankedFirst, staleCounter, currentCounter]
    });
    const packet = buildNegotiationApprovalPacket({ accountId: "ACC-HAR", customer: "Harbor Foods" }, order, selected);

    expect(selected?.candidateId).toBe("counter-offer:counter-harbor-r2-customer-terms");
    expect(packet.packetDetail).toContain("Round 3 drafts counter-offer:counter-harbor-r2-customer-terms");
    expect(packet.packetDetail).toContain("75% release, 35% deposit, 2 tranches");
  });

  it("hydrates the negotiation send gate from the exact durable drafted round only", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "drafted"
      },
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(buildNegotiationApprovalPacket({ accountId: "ACC-HAR", customer: "Harbor Foods" }, order, undefined)).toMatchObject({
      actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
      round: 2
    });
    expect(canSendNegotiationEmailForAction(order, "credit-v2:negotiation:ORD-HARBOR-6534:r2", undefined)).toBe(true);
    expect(canSendNegotiationEmailForAction(order, "credit-v2:negotiation:ORD-HARBOR-6534:r3", undefined)).toBe(false);
    expect(
      canSendNegotiationEmailForAction(order, "credit-v2:negotiation:ORD-HARBOR-6534:r2", "credit-v2:negotiation:ORD-HARBOR-6534:r3")
    ).toBe(true);
  });

  it("keeps the send success visible when the sent round hydrates from the backend after refresh", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "sent"
      },
      latestSentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "sent"
      },
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(negotiationHydratedSendMessage(order)).toBe("Approved email send recorded.");
  });

  it("keeps the send success visible after refresh advances the next outbound action", () => {
    const order = {
      latestSentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r1",
        round: 1,
        status: "sent"
      },
      nextRound: 2,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(negotiationHydratedSendMessage(order)).toBe("Approved email send recorded.");
  });

  it("does not enable send from a stale local approval recorded for another negotiation action", () => {
    const order = {
      nextRound: 3,
      orderAmount: 640010,
      orderAmountLabel: "$640,010.00",
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(
      canSendNegotiationEmailForAction(order, "credit-v2:negotiation:ORD-HARBOR-6534:r3", "credit-v2:negotiation:ORD-HARBOR-6534:r2")
    ).toBe(false);
    expect(
      canSendNegotiationEmailForAction(order, "credit-v2:negotiation:ORD-HARBOR-6534:r3", "credit-v2:negotiation:ORD-HARBOR-6534:r3")
    ).toBe(true);
  });

  it("allows negotiation approval dialog copy to avoid refresh wording", () => {
    const copy = buildDavidApprovalGateCopy({
        governedApprovalDescription: "The approval route records the backend receipt before the send step unlocks.",
        submitLabel: "Approve draft",
        submittingLabel: "Recording approval..."
      });

    expect(copy.governedApprovalDescription).toBe("The approval route records the backend receipt before the send step unlocks.");
    expect(copy.submitLabel).toBe("Approve draft");
    expect(copy.submittingLabel).toBe("Recording approval...");
    expect(copy.governedApprovalDescription).not.toContain("refresh");
    expect(copy.submitLabel).not.toContain("refresh");
    expect(buildDavidApprovalGateCopy({}).submitLabel).toBe("Approve and refresh");
  });

  it("allows negotiation approval dialog title to avoid send wording while preserving the default action-packet title", () => {
    const negotiationTitle = buildDavidApprovalGateTitle("Draft Harbor Foods counter", "Approve draft counter?");

    expect(negotiationTitle).toBe("Approve draft counter?");
    expect(negotiationTitle).not.toContain("Send");
    expect(buildDavidApprovalGateTitle("Recovery packet")).toBe("Send Recovery packet?");
  });
});

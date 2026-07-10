import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canSendNegotiationEmailForAction,
  DavidNegotiationWorkbench,
  buildNegotiationApprovalPacket,
  defaultManualCounterRound,
  negotiationRoundSummary
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
    expect(negotiationRoundSummary(order)).toBe("Latest sent round 2 / Next outbound round 3");
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
      orderId: "ORD-HARBOR-6534",
      sourceModeLabel: "governed Supabase negotiation source",
      sourceRecordIds: ["credit_orders:ORD-HARBOR-6534"]
    } as CreditRiskAccountModel["negotiationOrders"][number];

    expect(negotiationRoundSummary(order)).toBe("Round 1 countered / Next outbound round 2");
  });

  it("builds the governed approval packet for the next negotiation round from the top deterministic candidate", () => {
    const order = {
      nextRound: 3,
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

  it("hydrates the negotiation send gate from the exact durable drafted round only", () => {
    const order = {
      currentRound: {
        actionId: "credit-v2:negotiation:ORD-HARBOR-6534:r2",
        round: 2,
        status: "drafted"
      },
      nextRound: 3,
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

  it("does not enable send from a stale local approval recorded for another negotiation action", () => {
    const order = {
      nextRound: 3,
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

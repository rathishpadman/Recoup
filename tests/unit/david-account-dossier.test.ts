import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DavidAccountDossier } from "../../cockpit/components/david/david-account-dossier.tsx";
import type { CreditRiskAccountModel } from "../../cockpit/app/cockpit-data.ts";

vi.mock("next/navigation.js", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
}));

describe("David account dossier", () => {
  it("surfaces a primary workflow command strip with backend-derived status and next action", () => {
    const account = buildCreditRiskAccount({
      accountId: "ACC-CRESTLINE",
      approvalStatus: "awaiting",
      customer: "Crestline Grocery",
      routeLabel: "Contain",
      verdict: "HIGH"
    });

    const html = renderToStaticMarkup(
      React.createElement(DavidAccountDossier, {
        account,
        accounts: [account],
        onClearSelection: vi.fn(),
        onSelectAccount: vi.fn(),
        onTimelinePlaybackComplete: vi.fn(),
        onTimelineVisibleCountChange: vi.fn(),
        shouldStreamTimeline: false
      })
    );

    expect(html).toContain('data-testid="david-workflow-command-strip"');
    expect(html).toContain("Workflow status");
    expect(html).toContain("HIGH risk");
    expect(html).toContain("Contain");
    expect(html).toContain("Awaiting review");
    expect(html).toContain("Next action");
    expect(html).toContain("Review deterministic basis, then approve action packet");
    expect(html).toContain("$3.92M exposure");
    expect(html).toContain("87% utilised");
    expect(html).toContain('data-workflow-state="awaiting-review"');
  });
});

function buildCreditRiskAccount(overrides: {
  accountId: string;
  approvalStatus: CreditRiskAccountModel["packet"]["approvalStatus"];
  customer: string;
  routeLabel: CreditRiskAccountModel["routeLabel"];
  verdict: CreditRiskAccountModel["verdict"];
}): CreditRiskAccountModel {
  return {
    accountId: overrides.accountId,
    actionPacket: [
      {
        amountLabel: "$39,700",
        amountValue: 39700,
        detail: "Contain unsupported disputes and freeze limit movement.",
        kind: "hold",
        label: "Deduction hold"
      }
    ],
    assessmentSteps: [
      {
        agentName: "Credit Risk Mesh",
        didLine: "Loaded SAP exposure and payment history.",
        foundLine: "High utilisation with unsupported disputes.",
        isFinal: true,
        key: "credit-risk-mesh:decision",
        phase: "overnight",
        recordIds: ["credit_accounts:ACC-CRESTLINE"],
        sourceLabel: "Supabase credit snapshot",
        toolLabel: "creditRiskModel",
        verdict: overrides.verdict,
        verdictLabel: `${overrides.verdict} risk`
      }
    ],
    channel: "Strategic retail",
    copilotConductorLine: "Route Contain.",
    creditLimitAmount: 4500000,
    creditLimitLabel: "$4.50M",
    customer: overrides.customer,
    daysBeyondTerms: 23,
    daysBeyondTermsLabel: "23 days beyond terms",
    dsoDays: 68,
    dsoLabel: "DSO 68d",
    evidenceDocuments: [],
    exposureAmount: 3920000,
    exposureLabel: "$3.92M",
    facts: [
      {
        key: "dso",
        label: "DSO",
        tone: "high",
        valueLabel: "68d"
      },
      {
        key: "days-beyond-terms",
        label: "Beyond terms",
        tone: "high",
        valueLabel: "23d"
      },
      {
        key: "open-disputes",
        label: "Open disputes",
        tone: "high",
        valueLabel: "3"
      },
      {
        key: "payment-trend",
        label: "Payment trend",
        tone: "elevated",
        valueLabel: "Slowing"
      }
    ],
    gamingFlag: true,
    leadLabel: "High risk: contain before release",
    meshPositions: [
      {
        contractGap: false,
        deterministicBasis: "credit_snapshot + dispute evidence",
        driverSignals: "DSO 68d; unsupported deductions $39,700.",
        interpretation: "Credit position is high risk.",
        keyMetric: "87% utilisation",
        position: "Credit",
        recordIds: ["credit_snapshot:ACC-CRESTLINE"],
        status: "HIGH",
        statusRank: 4,
        statusTone: "high"
      }
    ],
    negotiationOrders: [],
    openDisputeAmount: 39700,
    openDisputeAmountLabel: "$39,700",
    openDisputeCount: 3,
    packet: {
      actionId: `credit-v2:${overrides.accountId}`,
      approvalStatus: overrides.approvalStatus,
      basis: "Deterministic account basis.",
      deterministicBasis: {
        route: overrides.routeLabel,
        verdict: overrides.verdict
      },
      detail: "Contain unsupported deductions, freeze limit movement, and escalate recovery.",
      dispatchedExternally: false,
      recordIds: ["credit_snapshot:ACC-CRESTLINE", "credit_disputes:ACC-CRESTLINE"],
      requiresHumanApproval: true,
      routeLabel: overrides.routeLabel,
      rows: [
        {
          amountLabel: "$39,700",
          amountValue: 39700,
          detail: "Unsupported disputes remain under hold.",
          kind: "hold",
          label: "Deduction hold"
        }
      ],
      title: "Containment packet"
    },
    paymentTrend: "Slowing",
    paymentTrendLabel: "Slowing payment trend",
    paymentTrendTone: "elevated",
    priorAvgDaysToPay: 49,
    priorAvgDaysToPayLabel: "49 days",
    recentAvgDaysToPay: 68,
    recentAvgDaysToPayLabel: "68 days",
    recordIds: ["credit_snapshot:ACC-CRESTLINE"],
    relationshipOwner: "David K.",
    routeLabel: overrides.routeLabel,
    routeLine: "Contain, hold deductions, freeze limit movement.",
    segment: "Tier-1 National Retail",
    signals: [
      {
        basis: "Unsupported deduction evidence and DSO movement.",
        feedsMesh: "Credit",
        gamingFlag: true,
        meshPosition: "Credit",
        note: "Unsupported disputes trigger containment.",
        recordIds: ["credit_disputes:ACC-CRESTLINE"],
        routeLabel: overrides.routeLabel,
        scenarioId: "scenario-crestline",
        tone: "high",
        verdict: "INVALID"
      }
    ],
    termsDays: 45,
    termsLabel: "Net 45",
    totalSalesAmount: 9800000,
    totalSalesLabel: "$9.80M",
    unsupportedAmount: 39700,
    unsupportedAmountLabel: "$39,700",
    utilisationLabel: "87%",
    utilisationPercent: 87,
    utilisationRatio: 0.87,
    verdict: overrides.verdict,
    verdictBasis: "Credit utilisation and unsupported disputes exceed policy guardrails.",
    verdictTone: "high"
  };
}

import { describe, expect, it } from "vitest";
import { buildCreditRiskReviewModel, nextTermsNetDays, nextVerdictBand } from "../../src/services/creditRiskModel.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

describe("credit risk review model", () => {
  it("derives Harbor ELEVATED with a rule-based reduced limit", () => {
    const model = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const account = byId(model, "ACC-HAR");

    expect(account.openDisputeCount).toBe(2);
    expect(account.openDisputeAmount).toBe(27_400);
    expect(account.unsupportedAmount).toBe(17_000);
    expect(account.verdict).toBe("ELEVATED");
    expect(account.paymentTrend).toBe("Stable");
    expect(account.actionPacket.find((packet) => packet.kind === "reduce")?.amountLabel).toBe("$1.5M");
  });

  it("derives Crestline HIGH with hold and limit packet amounts", () => {
    const model = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const account = byId(model, "ACC-CRE");

    expect(account.openDisputeCount).toBe(3);
    expect(account.openDisputeAmount).toBe(54_300);
    expect(account.unsupportedAmount).toBe(39_700);
    expect(account.verdict).toBe("HIGH");
    expect(account.paymentTrend).toBe("Slowing");
    expect(account.actionPacket.find((packet) => packet.kind === "hold")?.amountLabel).toBe("$39,700");
    expect(account.actionPacket.find((packet) => packet.kind === "limit")?.amountLabel).toBe("$4.5M");
    expect(account.facts.find((fact) => fact.key === "open-disputes")?.tone).toBe("high");
  });

  it("pins all four verdicts and all sixteen mesh ranks to the workbook goldens", () => {
    const rows = loadCreditRiskFixtureRows();
    const model = buildCreditRiskReviewModel(rows);

    expect(byId(model, "ACC-CRE").verdict).toBe("HIGH");
    expect(byId(model, "ACC-HAR").verdict).toBe("ELEVATED");
    expect(byId(model, "ACC-VAL").verdict).toBe("WATCH");
    expect(byId(model, "ACC-GRE").verdict).toBe("CLEAR");

    const expectedRanks = new Map(
      rows.riskMeshPositions.map((row) => [`${row.accountId}:${row.position}`, `${row.status}:${String(row.statusRank)}`] as const)
    );

    for (const account of model.accounts) {
      for (const position of account.meshPositions) {
        expect(expectedRanks.get(`${account.accountId}:${position.position}`)).toBe(`${position.status}:${String(position.statusRank)}`);
      }
    }
  });

  it("fails closed when a seeded mesh rank mismatches the computed position", () => {
    const rows = loadCreditRiskFixtureRows();
    const broken = structuredClone(rows);
    const creditPosition = broken.riskMeshPositions.find(
      (position) => position.accountId === "ACC-GRE" && position.position === "Credit"
    );

    expect(creditPosition).toBeDefined();
    if (creditPosition === undefined) {
      return;
    }

    creditPosition.statusRank = 3;

    expect(() => buildCreditRiskReviewModel(broken)).toThrow(/mesh position mismatch/i);
  });

  it("recalculates a complete newly supplied account from source rows", () => {
    const rows = loadCreditRiskFixtureRows();
    const dynamicRows = structuredClone(rows);

    dynamicRows.accounts.push({
      accountId: "ACC-NOV",
      channel: "Regional retail",
      creditLimit: 1_000_000,
      customer: "North Valley Market",
      gamingFlag: false,
      relationshipOwner: "David Kim",
      segment: "Growth grocery",
      termsNetDays: 30
    });
    dynamicRows.arOpenItems.push(
      {
        accountId: "ACC-NOV",
        agingBucket: "31-60",
        amountOpen: 500_000,
        daysPastDue: 20,
        disputed: true,
        dueDate: 46_046,
        invoiceDate: 46_016,
        invoiceNo: "NOV-1001",
        note: "New account dynamic fixture",
        termsNetDays: 30
      },
      {
        accountId: "ACC-NOV",
        agingBucket: "Current",
        amountOpen: 300_000,
        daysPastDue: 0,
        disputed: false,
        dueDate: 46_054,
        invoiceDate: 46_024,
        invoiceNo: "NOV-1002",
        note: null,
        termsNetDays: 30
      }
    );
    dynamicRows.salesMonthly.push(
      ...Array.from({ length: 11 }, (_, index) => ({
        accountId: "ACC-NOV",
        creditSales: 600_000,
        period: `2025-${String(index + 1).padStart(2, "0")}`
      })),
      { accountId: "ACC-NOV", creditSales: 700_000, period: "2025-12" }
    );
    dynamicRows.paymentHistory.push(
      {
        accountId: "ACC-NOV",
        amountPaid: 240_000,
        daysToPay: 28,
        invoiceNo: "NOV-P1",
        onTime: true,
        paymentId: "PAY-NOV-P1",
        window: "Prior"
      },
      {
        accountId: "ACC-NOV",
        amountPaid: 260_000,
        daysToPay: 30,
        invoiceNo: "NOV-P2",
        onTime: true,
        paymentId: "PAY-NOV-P2",
        window: "Prior"
      },
      {
        accountId: "ACC-NOV",
        amountPaid: 230_000,
        daysToPay: 34,
        invoiceNo: "NOV-R1",
        onTime: false,
        paymentId: "PAY-NOV-R1",
        window: "Recent"
      },
      {
        accountId: "ACC-NOV",
        amountPaid: 220_000,
        daysToPay: 36,
        invoiceNo: "NOV-R2",
        onTime: false,
        paymentId: "PAY-NOV-R2",
        window: "Recent"
      }
    );
    dynamicRows.deductions.push(
      {
        accountId: "ACC-NOV",
        claimAmount: 11_000,
        customer: "North Valley Market",
        evidenceRefs: "EVD-CREDIT-ACC-NOV-AR",
        feedsMesh: "Collections",
        gamingFlag: false,
        lines: 1,
        recoverAmount: 7_000,
        routing: "Recovery",
        scenarioId: "S9",
        type: "Allowance dispute",
        validAmount: 0,
        verdict: "INVALID"
      },
      {
        accountId: "ACC-NOV",
        claimAmount: 9_000,
        customer: "North Valley Market",
        evidenceRefs: "EVD-CREDIT-ACC-NOV-AR",
        feedsMesh: "Collections",
        gamingFlag: false,
        lines: 1,
        recoverAmount: 8_000,
        routing: "Recovery",
        scenarioId: "S10",
        type: "Short-pay backup gap",
        validAmount: 0,
        verdict: "INVALID"
      }
    );
    dynamicRows.deductionLines.push(
      {
        accountId: "ACC-NOV",
        deductionType: "Allowance dispute",
        invoiceNo: "NOV-1001",
        lineAmount: 11_000,
        lineId: "L-NOV-1",
        scenarioId: "S9",
        verdict: "INVALID"
      },
      {
        accountId: "ACC-NOV",
        deductionType: "Short-pay backup gap",
        invoiceNo: "NOV-1002",
        lineAmount: 9_000,
        lineId: "L-NOV-2",
        scenarioId: "S10",
        verdict: "INVALID"
      }
    );
    dynamicRows.contractTpm.push(
      {
        accountId: "ACC-NOV",
        detail: "Allowance requires cited backup before credit release.",
        referenceId: "CTR-NOV-ALLOWANCE",
        termsDays: 30,
        type: "Contract",
        usedInScenario: "S9",
        value: null
      },
      {
        accountId: "ACC-NOV",
        detail: "Short-pay support must include remittance and POD.",
        referenceId: "TPM-NOV-BACKUP",
        termsDays: null,
        type: "TPM",
        usedInScenario: "S10",
        value: null
      }
    );
    dynamicRows.evidenceDocuments.push({
      accountId: "ACC-NOV",
      contentHash: "n".repeat(64),
      documentId: "EVD-CREDIT-ACC-NOV-AR",
      documentType: "credit-risk-evidence",
      recordIds: ["ACC-NOV", "S9", "S10", "credit_ar_open_items", "credit_deductions"],
      sourceMode: "synthetic",
      synthetic: true,
      title: "North Valley AR aging and deduction evidence packet"
    });
    dynamicRows.riskMeshPositions.push(
      {
        accountId: "ACC-NOV",
        driverSignals: "",
        interpretation: "Exposure is below governed credit escalation thresholds.",
        keyMetric: "Utilisation 80%",
        position: "Credit",
        status: "OK",
        statusRank: 0
      },
      {
        accountId: "ACC-NOV",
        driverSignals: "",
        interpretation: "No fulfilment escalation signal in the supplied deductions.",
        keyMetric: "No OTIF/SLA valid deductions",
        position: "Fulfilment",
        status: "OK",
        statusRank: 0
      },
      {
        accountId: "ACC-NOV",
        driverSignals: "",
        interpretation: "No valid promo or pricing billing exposure.",
        keyMetric: "No valid billing deductions",
        position: "Billing",
        status: "OK",
        statusRank: 0
      },
      {
        accountId: "ACC-NOV",
        driverSignals: "S9, S10",
        interpretation: "Unsupported deductions meet the governed elevated threshold.",
        keyMetric: "Unsupported $15,000",
        position: "Collections",
        status: "ELEVATED",
        statusRank: 2
      }
    );

    const account = byId(buildCreditRiskReviewModel(dynamicRows), "ACC-NOV");

    expect(account.exposureAmount).toBe(800_000);
    expect(account.utilisationRatio).toBe(0.8);
    expect(account.utilisationPercent).toBe(80);
    expect(account.dsoDays).toBe(40);
    expect(account.daysBeyondTerms).toBe(10);
    expect(account.openDisputeCount).toBe(2);
    expect(account.openDisputeAmount).toBe(20_000);
    expect(account.unsupportedAmount).toBe(15_000);
    expect(account.verdict).toBe("ELEVATED");
    expect(account.packet.routeLabel).toBe("Reduce");
    expect(account.actionPacket.find((packet) => packet.kind === "reduce")).toMatchObject({
      amountLabel: "$1M",
      amountValue: 1_000_000
    });
    expect(account.meshPositions.map((position) => `${position.position}:${position.status}`)).toEqual([
      "Credit:OK",
      "Fulfilment:OK",
      "Billing:OK",
      "Collections:ELEVATED"
    ]);
  });

  it("fails closed when a newly supplied account has only partial source data", () => {
    const rows = loadCreditRiskFixtureRows();
    const partialRows = structuredClone(rows);

    partialRows.accounts.push({
      accountId: "ACC-PARTIAL",
      channel: "Regional retail",
      creditLimit: 1_000_000,
      customer: "Partial Source Market",
      gamingFlag: false,
      relationshipOwner: "David Kim",
      segment: "Growth grocery",
      termsNetDays: 30
    });
    partialRows.arOpenItems.push({
      accountId: "ACC-PARTIAL",
      agingBucket: "Current",
      amountOpen: 100_000,
      daysPastDue: 0,
      disputed: false,
      dueDate: 46_054,
      invoiceDate: 46_024,
      invoiceNo: "PARTIAL-1001",
      note: null,
      termsNetDays: 30
    });

    expect(() => buildCreditRiskReviewModel(partialRows)).toThrow(/missing source rows for account ACC-PARTIAL/i);
  });

  it("templates assessment steps from computed values and only adds containment for gaming accounts", () => {
    const model = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const crestline = byId(model, "ACC-CRE");
    const harbor = byId(model, "ACC-HAR");

    expect(crestline.assessmentSteps).toHaveLength(8);
    expect(crestline.assessmentSteps[0]?.foundLine).toBe("Exposure $3.92M across 7 open items.");
    expect(crestline.assessmentSteps[2]?.foundLine).toBe("Payment trend Slowing (64d recent vs 52d prior).");
    expect(crestline.assessmentSteps.some((step) => step.key.endsWith(":containment"))).toBe(true);
    expect(harbor.assessmentSteps.some((step) => step.key.endsWith(":containment"))).toBe(false);
  });

  it("emits the live-ready copilot contract from the backend read model", () => {
    const model = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());
    const crestline = byId(model, "ACC-CRE");

    expect(model.copilot).toMatchObject({
      conductorLabel: "Conductor",
      note: "Copilot assesses & recommends. Approvals stay with you.",
      readinessLabel: "Risk Mesh ready",
      title: "Investigation Copilot"
    });
    expect(model.copilot.suggestions).toEqual([
      {
        question: "Why is Crestline high risk?",
        suggestionId: "crestline-high-risk",
        targetAccountId: "ACC-CRE"
      },
      {
        question: "Which accounts need action this week?",
        suggestionId: "accounts-needing-action"
      },
      {
        question: "Show the gaming-flag account [D]",
        suggestionId: "gaming-flag-account",
        targetAccountId: "ACC-CRE"
      }
    ]);
    expect(crestline.copilotConductorLine).toBe(
      "Route Contain. Crestline Grocery is HIGH because Credit=ELEVATED (util 87%, 23d beyond terms) and Collections=HIGH (unsupported $39,700)."
    );
  });

  it("emits the sources drawer contract from the backend read model", () => {
    const model = buildCreditRiskReviewModel(loadCreditRiskFixtureRows());

    expect(model.sources).toEqual({
      auditTrailLabel: "Audit trail on",
      connectors: [
        {
          checkedAtLabel: "Checked 2026-01-26",
          connectorKey: "sap-odata",
          label: "SAP OData",
          proofItems: ["credit_snapshot:2026-01-26", "credit_ar_open_items:22"],
          recordIds: ["credit_snapshot", "credit_ar_open_items"],
          sourceModeLabel: "synthetic SAP read-model",
          statusLabel: "Synthetic read-model available",
          synthetic: true
        },
        {
          checkedAtLabel: "Checked 2026-01-26",
          connectorKey: "supabase-tools",
          label: "Supabase tools data",
          proofItems: ["credit_accounts:4", "credit_policy:7", "credit_risk_mesh_positions:16"],
          recordIds: ["credit_accounts", "credit_policy", "credit_risk_mesh_positions"],
          sourceModeLabel: "governed Supabase tables",
          statusLabel: "Governed tables loaded",
          synthetic: false
        },
        {
          checkedAtLabel: "Checked 2026-01-26",
          connectorKey: "bureau-payment-history",
          label: "Bureau/payment-history",
          proofItems: ["credit_payment_history:24", "credit_sales_monthly:48"],
          recordIds: ["credit_payment_history", "credit_sales_monthly"],
          sourceModeLabel: "synthetic payment source",
          statusLabel: "Synthetic payment-history available",
          synthetic: true
        },
        {
          checkedAtLabel: "Checked 2026-01-26",
          connectorKey: "contract-tpm",
          label: "Contract & TPM repo",
          proofItems: ["credit_contract_tpm:8", "credit_deduction_lines:20"],
          recordIds: ["credit_contract_tpm", "credit_deduction_lines"],
          sourceModeLabel: "governed contract references",
          statusLabel: "Governed references loaded",
          synthetic: false
        }
      ],
      externalActionsLabel: "External actions blocked",
      topbarLabel: "SAP AR read-model (synthetic) · as of 2026-01-26"
    });
  });

  it("marks a mesh tile as a contract gap when the seeded basis rows are incomplete", () => {
    const rows = loadCreditRiskFixtureRows();
    const broken = structuredClone(rows);
    const collectionsPosition = broken.riskMeshPositions.find(
      (position) => position.accountId === "ACC-HAR" && position.position === "Collections"
    );

    expect(collectionsPosition).toBeDefined();
    if (collectionsPosition === undefined) {
      return;
    }

    collectionsPosition.interpretation = "";

    const account = byId(buildCreditRiskReviewModel(broken), "ACC-HAR");
    const meshPosition = account.meshPositions.find((position) => position.position === "Collections");

    expect(meshPosition).toBeDefined();
    expect(meshPosition).toMatchObject({
      contractGap: true,
      contractGapReason: "Missing seeded interpretation.",
      deterministicBasis: null
    });
  });
  it("surfaces an approved Maya credit recommendation as a cited signal for David", () => {
    const rows = loadCreditRiskFixtureRows();
    const model = buildCreditRiskReviewModel({
      ...rows,
      approvedCreditRecommendations: [
        {
          accountId: "ACC-VAL",
          actionId: "credit-recommendation:S5-L1:band-downgrade",
          amount: "$12,700.00",
          basis: "Recommended by Maya on 2026-01-26; case S5-L1 routed to Recovery for $12,700.00.",
          currentLabel: "WATCH",
          kind: "band-downgrade",
          caseLabel: "S5-L1",
          decidedAt: "2026-08-16T09:12:44.000Z",
          proposedLabel: "ELEVATED",
          recordIds: ["ACC-VAL", "S5-L1"],
          scenarioId: "S5"
        }
      ]
    });
    const signal = byId(model, "ACC-VAL").signals.find(
      (candidate) => candidate.scenarioId === "credit-recommendation:S5-L1:band-downgrade"
    );

    expect(signal).toBeDefined();
    expect(signal).toMatchObject({
      amount: "$12,700.00",
      meshPosition: "Credit",
      note: "Downgrade risk band: WATCH -> ELEVATED"
    });
    // The badge must read as a case, not as a raw action ID, and an advisory must not wear the
    // originating deduction's INVALID verdict as though the recommendation itself were invalid.
    expect(signal?.label).toBe("S5-L1");
    expect(signal?.verdictLabel).toBe("Advisory");
    // A decision has a real date; the recommendation itself does not.
    expect(signal?.basis).toContain("Approved 2026-08-16");
    expect(signal?.basis).toContain("Maya");
    expect(signal?.recordIds).toEqual(expect.arrayContaining(["ACC-VAL", "S5-L1"]));
    // The recommendation is scoped to its own account.
    expect(byId(model, "ACC-CRE").signals.some((candidate) => candidate.scenarioId.startsWith("credit-recommendation:"))).toBe(
      false
    );
  });

  it("leaves every account's signals unchanged when no credit recommendation is approved", () => {
    const rows = loadCreditRiskFixtureRows();
    const withEmpty = buildCreditRiskReviewModel({ ...rows, approvedCreditRecommendations: [] });
    const baseline = buildCreditRiskReviewModel(rows);

    expect(withEmpty.accounts.map((account) => account.signals)).toEqual(
      baseline.accounts.map((account) => account.signals)
    );
  });

  it("steps the risk band exactly one rank and stops at the ceiling", () => {
    expect(nextVerdictBand("CLEAR")).toBe("WATCH");
    expect(nextVerdictBand("WATCH")).toBe("ELEVATED");
    expect(nextVerdictBand("ELEVATED")).toBe("HIGH");
    // Already at the ceiling: a recovery case must not invent a band beyond HIGH.
    expect(nextVerdictBand("HIGH")).toBe("HIGH");
  });

  it("tightens payment terms one governed step and stops at the floor", () => {
    expect(nextTermsNetDays(60)).toBe(45);
    expect(nextTermsNetDays(45)).toBe(30);
    expect(nextTermsNetDays(30)).toBe(15);
    // Already at the floor: the ladder never proposes terms tighter than Net 15.
    expect(nextTermsNetDays(15)).toBe(15);
    // Terms that are not on the ladder drop to the next rung below them.
    expect(nextTermsNetDays(50)).toBe(45);
  });
});

function byId(model: ReturnType<typeof buildCreditRiskReviewModel>, accountId: string) {
  const account = model.accounts.find((entry) => entry.accountId === accountId);
  expect(account).toBeDefined();
  if (account === undefined) {
    throw new Error(`Missing account ${accountId}.`);
  }

  return account;
}

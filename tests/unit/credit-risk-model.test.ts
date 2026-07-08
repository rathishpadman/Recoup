import { describe, expect, it } from "vitest";
import { buildCreditRiskReviewModel } from "../../src/services/creditRiskModel.js";
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
});

function byId(model: ReturnType<typeof buildCreditRiskReviewModel>, accountId: string) {
  const account = model.accounts.find((entry) => entry.accountId === accountId);
  expect(account).toBeDefined();
  if (account === undefined) {
    throw new Error(`Missing account ${accountId}.`);
  }

  return account;
}

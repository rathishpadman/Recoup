import { describe, expect, it } from "vitest";
import { loadCreditRiskRows } from "../../src/adapters/supabaseSyntheticSource.js";
import { loadCreditRiskFixtureRows } from "./fixtures/creditRiskFixture.js";

describe("credit risk Supabase loader", () => {
  it("loads typed credit risk rows from all required Supabase tables", async () => {
    const fixture = loadCreditRiskFixtureRows();
    const calls: string[] = [];

    const rows = await loadCreditRiskRows(
      {
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://recoup.supabase.co"
      },
      (url, init) => {
        calls.push(url);
        expect(init.headers).toMatchObject({
          apikey: "supabase-service-secret",
          authorization: "Bearer supabase-service-secret"
        });

        return Promise.resolve(jsonResponse(rowsForTable(fixture, new URL(url).pathname.split("/").at(-1))));
      }
    );

    expect(rows.snapshot.asOfDate).toBe(fixture.snapshot.asOfDate);
    expect(rows.accounts).toHaveLength(4);
    expect(rows.accounts[0]).toMatchObject({
      accountId: fixture.accounts[0]?.accountId,
      relationshipOwner: fixture.accounts[0]?.relationshipOwner
    });
    expect(rows.deductions).toHaveLength(fixture.deductions.length);
    expect(rows.deductions[0]).toMatchObject({
      scenarioId: fixture.deductions[0]?.scenarioId,
      type: fixture.deductions[0]?.type
    });
    expect(rows.policy.reduceLimitBuffer).toBe(1.2);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/rest/v1/credit_snapshot"),
        expect.stringContaining("/rest/v1/credit_accounts"),
        expect.stringContaining("/rest/v1/credit_ar_open_items"),
        expect.stringContaining("/rest/v1/credit_sales_monthly"),
        expect.stringContaining("/rest/v1/credit_payment_history"),
        expect.stringContaining("/rest/v1/credit_deductions"),
        expect.stringContaining("/rest/v1/credit_deduction_lines"),
        expect.stringContaining("/rest/v1/credit_contract_tpm"),
        expect.stringContaining("/rest/v1/credit_risk_mesh_positions"),
        expect.stringContaining("/rest/v1/credit_policy")
      ])
    );
  });

  it("fails closed when a required credit risk table is empty", async () => {
    const fixture = loadCreditRiskFixtureRows();

    await expect(
      loadCreditRiskRows(
        {
          SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
          SUPABASE_URL: "https://recoup.supabase.co"
        },
        (url) => {
          const tableName = new URL(url).pathname.split("/").at(-1);
          if (tableName === "credit_accounts") {
            return Promise.resolve(jsonResponse([]));
          }

          return Promise.resolve(jsonResponse(rowsForTable(fixture, tableName)));
        }
      )
    ).rejects.toMatchObject({
      missingSource: "supabase-credit-risk-credit_accounts"
    });
  });
});

function rowsForTable(
  fixture: ReturnType<typeof loadCreditRiskFixtureRows>,
  tableName: string | undefined
): Array<Record<string, unknown>> {
  switch (tableName) {
    case "credit_snapshot":
      return [
        {
          as_of_date: fixture.snapshot.asOfDate,
          id: "current"
        }
      ];
    case "credit_accounts":
      return fixture.accounts.map((row) => ({
        account_id: row.accountId,
        channel: row.channel,
        credit_limit: row.creditLimit,
        customer: row.customer,
        gaming_flag: row.gamingFlag,
        owner: row.relationshipOwner,
        segment: row.segment,
        terms_days: row.termsNetDays
      }));
    case "credit_ar_open_items":
      return fixture.arOpenItems.map((row) => ({
        account_id: row.accountId,
        aging_bucket: row.agingBucket,
        amount_open: row.amountOpen,
        days_past_due: row.daysPastDue,
        disputed: row.disputed,
        due_date: excelSerialToIsoDate(row.dueDate),
        invoice_date: excelSerialToIsoDate(row.invoiceDate),
        invoice_no: row.invoiceNo,
        note: row.note,
        terms_days: row.termsNetDays
      }));
    case "credit_sales_monthly":
      return fixture.salesMonthly.map((row) => ({
        account_id: row.accountId,
        credit_sales: row.creditSales,
        period: row.period
      }));
    case "credit_payment_history":
      return fixture.paymentHistory.map((row) => ({
        account_id: row.accountId,
        amount_paid: row.amountPaid,
        days_to_pay: row.daysToPay,
        invoice_no: row.invoiceNo,
        on_time: row.onTime,
        pay_window: row.window,
        payment_id: row.paymentId
      }));
    case "credit_deductions":
      return fixture.deductions.map((row) => ({
        account_id: row.accountId,
        claim_amount: row.claimAmount,
        deduction_type: row.type,
        evidence_refs: row.evidenceRefs,
        feeds_mesh: row.feedsMesh,
        gaming_flag: row.gamingFlag,
        lines: row.lines,
        recover_amount: row.recoverAmount,
        routing: row.routing,
        scenario_id: row.scenarioId,
        valid_amount: row.validAmount,
        verdict: row.verdict
      }));
    case "credit_deduction_lines":
      return fixture.deductionLines.map((row) => ({
        account_id: row.accountId,
        deduction_type: row.deductionType,
        invoice_no: row.invoiceNo,
        line_amount: row.lineAmount,
        line_id: row.lineId,
        scenario_id: row.scenarioId,
        verdict: row.verdict
      }));
    case "credit_contract_tpm":
      return fixture.contractTpm.map((row) => ({
        account_id: row.accountId,
        detail: row.detail,
        reference_id: row.referenceId,
        type: row.type,
        used_in_scenario: row.usedInScenario,
        value: row.value
      }));
    case "credit_risk_mesh_positions":
      return fixture.riskMeshPositions.map((row) => ({
        account_id: row.accountId,
        driver_signals: row.driverSignals,
        interpretation: row.interpretation,
        key_metric: row.keyMetric,
        position: row.position,
        status: row.status,
        status_rank: row.statusRank
      }));
    case "credit_policy":
      return Object.entries(fixture.policy).map(([key, value]) => ({
        key,
        value
      }));
    default:
      throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status: 200
  });
}

function excelSerialToIsoDate(value: number): string {
  return new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

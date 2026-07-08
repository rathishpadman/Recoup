import { governedConfigSeedRows } from "../../../config/governed.js";
import { loadCreditRiskFixtureRows } from "./creditRiskFixture.js";

export function rowsForCreditRiskTable(
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
      return (Object.entries(fixture.policy) as Array<[string, number]>).map(([key, value]) => ({
        key,
        value
      }));
    default:
      throw new Error(`Unexpected Supabase table ${String(tableName)}.`);
  }
}

export function governedConfigPostgrestRows(): Array<Record<string, unknown>> {
  return governedConfigSeedRows.map((row) => ({
    active: row.active,
    approved_by: row.approvedBy,
    config_hash: row.configHash,
    config_version: row.configVersion,
    effective_from: row.effectiveFrom,
    key: row.key,
    value_json: row.valueJson
  }));
}

function excelSerialToIsoDate(value: number): string {
  return new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

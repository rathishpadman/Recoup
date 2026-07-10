import { governedConfigSeedRows } from "../../../config/governed.js";
import { releaseOwnerInputSeedRows } from "../../../config/releaseOwnerInputs.js";
import { creditNegotiationPolicyCandidateRows } from "../../../src/services/creditNegotiationPolicy.js";
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
    case "credit_negotiation_rounds":
      return [];
    case "credit_evidence_documents":
      return [
        {
          account_id: "ACC-CRE",
          content_hash: "c".repeat(64),
          document_id: "EVD-CREDIT-ACC-CRE-AR",
          document_type: "credit-risk-evidence",
          record_ids: ["ACC-CRE", "S3", "S6", "credit_ar_open_items", "credit_deductions"],
          source_mode: "synthetic",
          synthetic: true,
          title: "Crestline AR aging and deduction evidence packet"
        },
        {
          account_id: "ACC-HAR",
          content_hash: "h".repeat(64),
          document_id: "EVD-CREDIT-ACC-HAR-TERMS",
          document_type: "credit-risk-evidence",
          record_ids: ["ACC-HAR", "S1", "S2", "credit_contract_tpm"],
          source_mode: "synthetic",
          synthetic: true,
          title: "Harbor Foods terms and recovery evidence packet"
        }
      ];
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

export function releaseOwnerInputPostgrestRows(): Array<Record<string, unknown>> {
  return releaseOwnerInputSeedRows.map((row) => ({
    active: row.active,
    approved_by: row.approvedBy,
    config_hash: row.configHash,
    config_version: row.configVersion,
    effective_from: row.effectiveFrom,
    key: row.key,
    value_json: row.valueJson
  }));
}

export function rowsForCreditNegotiationTable(tableName: string | undefined): Array<Record<string, unknown>> | undefined {
  switch (tableName) {
    case "credit_orders":
      return [
        {
          account_id: "ACC-HAR",
          gross_margin_pct: "0.18",
          order_amount: "640010.00",
          order_id: "ORD-HARBOR-6534",
          record_ids: ["credit_orders:ORD-HARBOR-6534"],
          units: "1000"
        }
      ];
    case "sim_cost_of_capital":
      return [
        {
          account_id: "ACC-HAR",
          annual_bps: "900",
          record_ids: ["sim_cost_of_capital:ACC-HAR:2026-01"]
        }
      ];
    case "sim_3pl_inventory":
      return [
        {
          holding_cost_per_unit_per_day: "0.75",
          holding_days: 30,
          order_id: "ORD-HARBOR-6534",
          record_ids: ["sim_3pl_inventory:ORD-HARBOR-6534:base"],
          scenario_id: "base-sellthrough"
        },
        {
          holding_cost_per_unit_per_day: "0.75",
          holding_days: 21,
          order_id: "ORD-HARBOR-6534",
          record_ids: ["sim_3pl_inventory:ORD-HARBOR-6534:upside"],
          scenario_id: "upside-sellthrough"
        }
      ];
    case "sim_pos_sellthrough":
      return [
        {
          order_id: "ORD-HARBOR-6534",
          probability: "0.60",
          record_ids: ["sim_pos_sellthrough:ORD-HARBOR-6534:base"],
          scenario_id: "base-sellthrough",
          sell_through_pct: "0.80"
        },
        {
          order_id: "ORD-HARBOR-6534",
          probability: "0.40",
          record_ids: ["sim_pos_sellthrough:ORD-HARBOR-6534:upside"],
          scenario_id: "upside-sellthrough",
          sell_through_pct: "0.95"
        }
      ];
    case "credit_deal_candidate_grid":
      return [
        {
          candidate_id: "partial-release-55",
          collateral_ratio: "1.00",
          deposit_pct: "25",
          financing_spread_bps: "200",
          record_ids: ["credit_deal_candidate_grid:partial-release-55"],
          release_pct: "55",
          tranche_count: 2
        },
        {
          candidate_id: "max-release-85",
          collateral_ratio: "1.25",
          deposit_pct: "60",
          financing_spread_bps: "100",
          record_ids: ["credit_deal_candidate_grid:max-release-85"],
          release_pct: "85",
          tranche_count: 3
        },
        {
          candidate_id: "low-release-10",
          collateral_ratio: "0.75",
          deposit_pct: "0",
          financing_spread_bps: "500",
          record_ids: ["credit_deal_candidate_grid:low-release-10"],
          release_pct: "10",
          tranche_count: 1
        }
      ];
    case "credit_counter_offers":
      return [];
    case "credit_negotiation_policy":
      return creditNegotiationPolicyCandidateRows.map((row) => ({
        active: row.active,
        approved_by: row.approvedBy,
        effective_from: row.effectiveFrom,
        key: row.key,
        policy_version: row.policyVersion,
        record_id: row.recordId,
        value_text: row.valueText
      }));
    default:
      return undefined;
  }
}

function excelSerialToIsoDate(value: number): string {
  return new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

import { readFileSync } from "node:fs";
import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.ts";

interface CreditRiskDataset {
  snapshot: {
    asOfDate: string;
  };
  accounts: AccountRow[];
  arOpenItems: ArOpenItemRow[];
  salesMonthly: SalesMonthlyRow[];
  paymentHistory: PaymentHistoryRow[];
  deductions: DeductionRow[];
  deductionLines: DeductionLineRow[];
  contractTpm: ContractTpmRow[];
  riskMeshPositions: RiskMeshPositionRow[];
  policy: Record<string, number>;
}

interface AccountRow {
  accountId: string;
  customer: string;
  channel: string;
  segment: string;
  creditLimit: number;
  termsNetDays: number;
  gamingFlag: boolean;
  relationshipOwner: string;
}

interface ArOpenItemRow {
  accountId: string;
  invoiceNo: string;
  invoiceDate: number;
  dueDate: number;
  termsNetDays: number;
  amountOpen: number;
  daysPastDue: number;
  agingBucket: string;
  disputed: boolean;
  note: string | null;
}

interface SalesMonthlyRow {
  accountId: string;
  period: string;
  creditSales: number;
}

interface PaymentHistoryRow {
  accountId: string;
  paymentId: string;
  invoiceNo: string;
  daysToPay: number;
  amountPaid: number;
  onTime: boolean;
  window: "Prior" | "Recent";
}

interface DeductionRow {
  scenarioId: string;
  accountId: string;
  type: string;
  lines: number;
  claimAmount: number;
  verdict: "VALID" | "INVALID" | "PARTIAL";
  validAmount: number;
  recoverAmount: number;
  routing: string;
  gamingFlag: boolean;
  feedsMesh: string;
  evidenceRefs: string;
}

interface DeductionLineRow {
  lineId: string;
  scenarioId: string;
  accountId: string;
  invoiceNo: string;
  deductionType: string;
  lineAmount: number;
  verdict: string;
}

interface ContractTpmRow {
  referenceId: string;
  accountId: string;
  type: string;
  detail: string;
  value: number | null;
  usedInScenario: string;
}

interface RiskMeshPositionRow {
  accountId: string;
  position: "Credit" | "Fulfilment" | "Billing" | "Collections";
  status: string;
  statusRank: number;
  keyMetric: string;
  driverSignals: string;
  interpretation: string;
}

const excelEpochUtc = Date.UTC(1899, 11, 30);
const datasetPath = "docs/Tools_data/credit_risk_dataset.json";

async function main(): Promise<void> {
  const env = loadLocalRuntimeEnvFiles();
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const dataset = readDataset(datasetPath);
  const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  await upsert(supabaseUrl, serviceRoleKey, "credit_snapshot?on_conflict=id", [
    {
      as_of_date: dataset.snapshot.asOfDate,
      id: "current"
    }
  ]);
  await upsert(supabaseUrl, serviceRoleKey, "credit_accounts?on_conflict=account_id", dataset.accounts.map((row) => ({
    account_id: row.accountId,
    channel: row.channel,
    credit_limit: row.creditLimit,
    customer: row.customer,
    gaming_flag: row.gamingFlag,
    owner: row.relationshipOwner,
    segment: row.segment,
    terms_days: row.termsNetDays
  })));
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_ar_open_items?on_conflict=invoice_no",
    dataset.arOpenItems.map((row) => ({
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
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_sales_monthly?on_conflict=account_id,period",
    dataset.salesMonthly.map((row) => ({
      account_id: row.accountId,
      credit_sales: row.creditSales,
      period: row.period
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_payment_history?on_conflict=payment_id",
    dataset.paymentHistory.map((row) => ({
      account_id: row.accountId,
      amount_paid: row.amountPaid,
      days_to_pay: row.daysToPay,
      invoice_no: row.invoiceNo,
      on_time: row.onTime,
      pay_window: row.window,
      payment_id: row.paymentId
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_deductions?on_conflict=scenario_id",
    dataset.deductions.map((row) => ({
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
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_deduction_lines?on_conflict=line_id",
    dataset.deductionLines.map((row) => ({
      account_id: row.accountId,
      deduction_type: row.deductionType,
      invoice_no: row.invoiceNo,
      line_amount: row.lineAmount,
      line_id: row.lineId,
      scenario_id: row.scenarioId,
      verdict: row.verdict
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_contract_tpm?on_conflict=reference_id",
    dataset.contractTpm.map((row) => ({
      account_id: row.accountId,
      detail: row.detail,
      reference_id: row.referenceId,
      type: row.type,
      used_in_scenario: row.usedInScenario,
      value: row.value
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_risk_mesh_positions?on_conflict=account_id,position",
    dataset.riskMeshPositions.map((row) => ({
      account_id: row.accountId,
      driver_signals: row.driverSignals,
      interpretation: row.interpretation,
      key_metric: row.keyMetric,
      position: row.position,
      status: row.status,
      status_rank: row.statusRank
    }))
  );
  await upsert(
    supabaseUrl,
    serviceRoleKey,
    "credit_policy?on_conflict=key",
    Object.entries(dataset.policy).map(([key, value]) => ({
      key,
      value
    }))
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        counts: {
          accounts: dataset.accounts.length,
          ar_open_items: dataset.arOpenItems.length,
          contract_tpm: dataset.contractTpm.length,
          deduction_lines: dataset.deductionLines.length,
          deductions: dataset.deductions.length,
          payment_history: dataset.paymentHistory.length,
          policy: Object.keys(dataset.policy).length,
          risk_mesh_positions: dataset.riskMeshPositions.length,
          sales_monthly: dataset.salesMonthly.length,
          snapshot: 1
        }
      },
      null,
      2
    )}\n`
  );
}

function readDataset(filePath: string): CreditRiskDataset {
  return JSON.parse(readFileSync(filePath, "utf8")) as CreditRiskDataset;
}

async function upsert(
  supabaseUrl: string,
  serviceRoleKey: string,
  target: string,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${target}`, {
    body: JSON.stringify(rows),
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Supabase ${target} upsert failed with HTTP ${String(response.status)}.`);
  }
}

function excelSerialToIsoDate(value: number): string {
  return new Date(excelEpochUtc + value * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

await main();

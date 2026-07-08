import { Decimal } from "decimal.js";
import { money, type Money } from "../types/money.js";

export type CreditVerdict = "CLEAR" | "WATCH" | "ELEVATED" | "HIGH";
export type VerdictTone = "clear" | "watch" | "elevated" | "high";
export type MeshPosition = "Credit" | "Fulfilment" | "Billing" | "Collections";
export type ApprovalStatus = "awaiting" | "committed";

export interface CreditRiskRows {
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
  evidenceDocuments: CreditEvidenceDocumentRow[];
  riskMeshPositions: RiskMeshPositionRow[];
  policy: CreditPolicy;
  approvalReceipts?: CreditRiskApprovalReceipt[] | undefined;
}

export interface AccountRow {
  accountId: string;
  customer: string;
  channel: string;
  segment: string;
  creditLimit: number;
  termsNetDays: number;
  gamingFlag: boolean;
  relationshipOwner: string;
}

export interface ArOpenItemRow {
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

export interface SalesMonthlyRow {
  accountId: string;
  period: string;
  creditSales: number;
  basis?: string | undefined;
}

export interface PaymentHistoryRow {
  accountId: string;
  paymentId: string;
  invoiceNo: string;
  invoiceDate?: number | undefined;
  dueDate?: number | undefined;
  paymentDate?: number | undefined;
  daysToPay: number;
  amountPaid: number;
  onTime: boolean;
  window: "Prior" | "Recent";
}

export interface DeductionRow {
  scenarioId: string;
  accountId: string;
  customer?: string | undefined;
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

export interface DeductionLineRow {
  lineId: string;
  scenarioId: string;
  accountId: string;
  invoiceNo: string;
  deductionType: string;
  lineAmount: number;
  verdict: string;
}

export interface ContractTpmRow {
  referenceId: string;
  accountId: string;
  type: string;
  detail: string;
  value: number | null;
  termsDays?: number | null | undefined;
  usedInScenario: string;
}

export interface RiskMeshPositionRow {
  accountId: string;
  customer?: string | undefined;
  position: MeshPosition;
  status: "OK" | "WATCH" | "ELEVATED" | "HIGH";
  statusRank: number;
  keyMetric: string;
  driverSignals: string;
  interpretation: string;
}

export interface CreditEvidenceDocumentRow {
  accountId: string;
  contentHash: string;
  documentId: string;
  documentType: string;
  recordIds: string[];
  sourceMode: string;
  synthetic: boolean;
  title: string;
}

export interface CreditPolicy {
  creditHighUtil: number;
  creditElevatedUtil: number;
  creditWatchDaysBeyondTerms: number;
  collectionsHighUnsupported: number;
  collectionsElevatedUnsupported: number;
  reduceLimitBuffer: number;
  reduceLimitRounding: number;
}

export interface CreditRiskApprovalReceipt {
  actionId: string;
  approvalStatus: ApprovalStatus;
  auditEntryHash: string;
}

export interface CreditPacketRow {
  amountValue: number;
  amountLabel: string;
  detail: string;
  kind: "hold" | "limit" | "monitor" | "reduce" | "release";
  label: string;
}

export interface CreditPacketModel {
  actionId: string;
  approvalStatus: ApprovalStatus;
  auditEntryHash?: string | undefined;
  basis: string;
  deterministicBasis: Record<string, string | number | boolean>;
  detail: string;
  dispatchedExternally: false;
  recordIds: string[];
  requiresHumanApproval: true;
  routeLabel: string;
  rows: CreditPacketRow[];
  title: string;
}

export interface CreditRiskApprovalAction {
  actionId: string;
  basis: string;
  deterministicBasis: Record<string, string | number | boolean>;
  detail: string;
  dispatchedExternally: false;
  proposedBy: "agent:credit-risk-review";
  recordIds: string[];
  requiresHumanApproval: true;
}

export interface CreditSignalModel {
  basis: string;
  feedsMesh: string;
  gamingFlag: boolean;
  meshPosition: string;
  note: string;
  recordIds: string[];
  routeLabel: string;
  scenarioId: string;
  tone: VerdictTone;
  verdict: DeductionRow["verdict"];
}

export interface CreditAssessmentStep {
  agentName: string;
  didLine: string;
  foundLine: string;
  isFinal: boolean;
  key: string;
  phase: "overnight";
  recordIds: string[];
  sourceLabel: string;
  toolLabel?: string | undefined;
  verdict?: CreditVerdict | undefined;
  verdictLabel?: string | undefined;
}

export interface CreditCopilotSuggestion {
  question: string;
  suggestionId: "accounts-needing-action" | "crestline-high-risk" | "gaming-flag-account";
  targetAccountId?: string | undefined;
}

export interface CreditRiskCopilotModel {
  conductorLabel: string;
  note: string;
  readinessLabel: string;
  suggestions: CreditCopilotSuggestion[];
  title: string;
}

export interface CreditSourceConnector {
  checkedAtLabel: string;
  connectorKey: "bureau-payment-history" | "contract-tpm" | "sap-odata" | "supabase-tools";
  label: string;
  proofItems: string[];
  recordIds: string[];
  sourceModeLabel: string;
  statusLabel: string;
  synthetic: boolean;
}

export interface CreditSourcesModel {
  auditTrailLabel: string;
  connectors: CreditSourceConnector[];
  externalActionsLabel: string;
  topbarLabel: string;
}

export interface CreditMeshPositionModel {
  contractGap: boolean;
  contractGapReason?: string | undefined;
  deterministicBasis: string | null;
  driverSignals: string;
  interpretation: string;
  keyMetric: string;
  position: MeshPosition;
  recordIds: string[];
  status: "OK" | "WATCH" | "ELEVATED" | "HIGH";
  statusRank: number;
  statusTone: VerdictTone;
}

export interface CreditEvidenceDocumentModel {
  contentHash: string;
  deterministicBasis: string;
  documentId: string;
  documentType: string;
  recordIds: string[];
  sourceModeLabel: string;
  synthetic: boolean;
  title: string;
}

export interface CreditRiskAccountModel {
  accountId: string;
  actionPacket: CreditPacketRow[];
  channel: string;
  copilotConductorLine: string;
  creditLimitAmount: number;
  creditLimitLabel: string;
  customer: string;
  daysBeyondTerms: number;
  daysBeyondTermsLabel: string;
  dsoDays: number;
  dsoLabel: string;
  evidenceDocuments: CreditEvidenceDocumentModel[];
  exposureAmount: number;
  exposureLabel: string;
  facts: Array<{
    key: "days-beyond-terms" | "dso" | "open-disputes" | "payment-trend";
    label: string;
    tone: VerdictTone;
    valueLabel: string;
  }>;
  gamingFlag: boolean;
  leadLabel: string;
  meshPositions: CreditMeshPositionModel[];
  openDisputeAmount: number;
  openDisputeAmountLabel: string;
  openDisputeCount: number;
  packet: CreditPacketModel;
  paymentTrend: "Healthy" | "Slowing" | "Stable";
  paymentTrendLabel: string;
  paymentTrendTone: VerdictTone;
  priorAvgDaysToPay: number;
  priorAvgDaysToPayLabel: string;
  recentAvgDaysToPay: number;
  recentAvgDaysToPayLabel: string;
  recordIds: string[];
  relationshipOwner: string;
  routeLabel: "Contain" | "Monitor" | "Reduce" | "Release";
  routeLine: string;
  segment: string;
  signals: CreditSignalModel[];
  termsDays: number;
  termsLabel: string;
  totalSalesAmount: number;
  totalSalesLabel: string;
  unsupportedAmount: number;
  unsupportedAmountLabel: string;
  utilisationRatio: number;
  utilisationLabel: string;
  utilisationPercent: number;
  verdict: CreditVerdict;
  verdictBasis: string;
  verdictTone: VerdictTone;
  assessmentSteps: CreditAssessmentStep[];
}

export interface CreditRiskReviewModel {
  accounts: CreditRiskAccountModel[];
  asOfDate: string;
  asOfLabel: string;
  copilot: CreditRiskCopilotModel;
  navCounts: {
    actionPackets: number;
    riskReview: number;
    watchlist: number;
  };
  portfolio: {
    totalExposureAmount: number;
    totalExposureLabel: string;
  };
  queueStats: Array<{
    key: "accounts" | "elevated" | "high" | "watch-clear";
    label: string;
    tone: VerdictTone;
    valueLabel: string;
  }>;
  sources: CreditSourcesModel;
  sourceLabel: string;
  surface: "credit-risk-review";
}

const policyKeys = [
  "collectionsElevatedUnsupported",
  "collectionsHighUnsupported",
  "creditElevatedUtil",
  "creditHighUtil",
  "creditWatchDaysBeyondTerms",
  "reduceLimitBuffer",
  "reduceLimitRounding"
] as const satisfies readonly (keyof CreditPolicy)[];
const verdictByRank = ["CLEAR", "WATCH", "ELEVATED", "HIGH"] as const satisfies readonly CreditVerdict[];
const toneByVerdict: Record<CreditVerdict, VerdictTone> = {
  CLEAR: "clear",
  ELEVATED: "elevated",
  HIGH: "high",
  WATCH: "watch"
};
const routeByVerdict: Record<CreditVerdict, CreditRiskAccountModel["routeLabel"]> = {
  CLEAR: "Release",
  ELEVATED: "Reduce",
  HIGH: "Contain",
  WATCH: "Monitor"
};

export function buildCreditRiskReviewModel(rows: CreditRiskRows): CreditRiskReviewModel {
  assertRequiredRows(rows);
  const approvalReceipts = indexApprovalReceipts(rows.approvalReceipts ?? []);
  const accounts = rows.accounts.map((account) => buildAccountModel(account, rows, approvalReceipts));
  const gamingFlagAccountId = accounts.find((account) => account.gamingFlag)?.accountId;
  const knownActionIds = new Set(accounts.map((account) => account.packet.actionId));
  for (const actionId of approvalReceipts.keys()) {
    if (!knownActionIds.has(actionId)) {
      throw new Error(`Unknown credit approval receipt for ${actionId}.`);
    }
  }
  const approvedActionCount = accounts.filter((account) => account.packet.approvalStatus === "committed").length;
  const totalExposure = sumAmountNumbers(accounts.map((account) => account.exposureAmount));

  return {
    accounts,
    asOfDate: rows.snapshot.asOfDate,
    asOfLabel: rows.snapshot.asOfDate,
    copilot: {
      conductorLabel: "Conductor",
      note: "Copilot assesses & recommends. Approvals stay with you.",
      readinessLabel: "Risk Mesh ready",
      suggestions: [
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
          ...(gamingFlagAccountId === undefined ? {} : { targetAccountId: gamingFlagAccountId })
        }
      ],
      title: "Investigation Copilot"
    },
    navCounts: {
      actionPackets: approvedActionCount,
      riskReview: accounts.length,
      watchlist: accounts.filter((account) => account.gamingFlag).length
    },
    portfolio: {
      totalExposureAmount: toAmount(totalExposure),
      totalExposureLabel: formatCompactMoney(totalExposure)
    },
    queueStats: [
      {
        key: "accounts",
        label: "Accounts in review",
        tone: "clear",
        valueLabel: `${accounts.length.toString()} accounts in review`
      },
      {
        key: "high",
        label: "High -> Contain",
        tone: "high",
        valueLabel: formatCompactMoney(
          sumAmountNumbers(accounts.filter((account) => account.verdict === "HIGH").map((account) => account.exposureAmount))
        )
      },
      {
        key: "elevated",
        label: "Elevated -> Reduce",
        tone: "elevated",
        valueLabel: formatCompactMoney(
          sumAmountNumbers(accounts.filter((account) => account.verdict === "ELEVATED").map((account) => account.exposureAmount))
        )
      },
      {
        key: "watch-clear",
        label: "Watch · Clear",
        tone: "watch",
        valueLabel: formatCompactMoney(
          sumAmountNumbers(
            accounts
              .filter((account) => account.verdict === "WATCH" || account.verdict === "CLEAR")
              .map((account) => account.exposureAmount)
          )
        )
      }
    ],
    sources: {
      auditTrailLabel: "Audit trail on",
      connectors: [
        {
          checkedAtLabel: `Checked ${rows.snapshot.asOfDate}`,
          connectorKey: "sap-odata",
          label: "SAP OData",
          proofItems: [`credit_snapshot:${rows.snapshot.asOfDate}`, `credit_ar_open_items:${rows.arOpenItems.length.toString()}`],
          recordIds: ["credit_snapshot", "credit_ar_open_items"],
          sourceModeLabel: "synthetic SAP read-model",
          statusLabel: "Synthetic read-model available",
          synthetic: true
        },
        {
          checkedAtLabel: `Checked ${rows.snapshot.asOfDate}`,
          connectorKey: "supabase-tools",
          label: "Supabase tools data",
          proofItems: [
            `credit_accounts:${rows.accounts.length.toString()}`,
            `credit_policy:${Object.keys(rows.policy).length.toString()}`,
            `credit_risk_mesh_positions:${rows.riskMeshPositions.length.toString()}`
          ],
          recordIds: ["credit_accounts", "credit_policy", "credit_risk_mesh_positions"],
          sourceModeLabel: "governed Supabase tables",
          statusLabel: "Governed tables loaded",
          synthetic: false
        },
        {
          checkedAtLabel: `Checked ${rows.snapshot.asOfDate}`,
          connectorKey: "bureau-payment-history",
          label: "Bureau/payment-history",
          proofItems: [
            `credit_payment_history:${rows.paymentHistory.length.toString()}`,
            `credit_sales_monthly:${rows.salesMonthly.length.toString()}`
          ],
          recordIds: ["credit_payment_history", "credit_sales_monthly"],
          sourceModeLabel: "synthetic payment source",
          statusLabel: "Synthetic payment-history available",
          synthetic: true
        },
        {
          checkedAtLabel: `Checked ${rows.snapshot.asOfDate}`,
          connectorKey: "contract-tpm",
          label: "Contract & TPM repo",
          proofItems: [
            `credit_contract_tpm:${rows.contractTpm.length.toString()}`,
            `credit_deduction_lines:${rows.deductionLines.length.toString()}`
          ],
          recordIds: ["credit_contract_tpm", "credit_deduction_lines"],
          sourceModeLabel: "governed contract references",
          statusLabel: "Governed references loaded",
          synthetic: false
        }
      ],
      externalActionsLabel: "External actions blocked",
      topbarLabel: `SAP AR read-model (synthetic) · as of ${rows.snapshot.asOfDate}`
    },
    sourceLabel: `as-of ${rows.snapshot.asOfDate} (synthetic)`,
    surface: "credit-risk-review"
  };
}

export function buildCreditRiskApprovalAction(account: CreditRiskAccountModel): CreditRiskApprovalAction {
  return {
    actionId: account.packet.actionId,
    basis: account.packet.basis,
    deterministicBasis: { ...account.packet.deterministicBasis },
    detail: account.packet.detail,
    dispatchedExternally: false,
    proposedBy: "agent:credit-risk-review",
    recordIds: [...account.packet.recordIds],
    requiresHumanApproval: true
  };
}

function buildAccountModel(
  account: AccountRow,
  rows: CreditRiskRows,
  approvalReceipts: Map<string, CreditRiskApprovalReceipt>
): CreditRiskAccountModel {
  const arOpenItems = rows.arOpenItems.filter((row) => row.accountId === account.accountId);
  const salesMonthly = rows.salesMonthly.filter((row) => row.accountId === account.accountId);
  const paymentHistory = rows.paymentHistory.filter((row) => row.accountId === account.accountId);
  const deductions = rows.deductions.filter((row) => row.accountId === account.accountId);
  const deductionLines = rows.deductionLines.filter((row) => row.accountId === account.accountId);
  const contractTpm = rows.contractTpm.filter((row) => row.accountId === account.accountId);
  const evidenceDocuments = rows.evidenceDocuments.filter((row) => row.accountId === account.accountId);
  const seededMeshRows = rows.riskMeshPositions.filter((row) => row.accountId === account.accountId);

  if (arOpenItems.length === 0 || salesMonthly.length === 0 || paymentHistory.length === 0 || seededMeshRows.length !== 4) {
    throw new Error(`Credit risk model missing source rows for account ${account.accountId}.`);
  }

  const exposure = sumMoney(arOpenItems.map((row) => toMoney(row.amountOpen)));
  const creditLimit = toMoney(account.creditLimit);
  const totalSales = sumMoney(salesMonthly.map((row) => toMoney(row.creditSales)));
  if (totalSales.eq(0)) {
    throw new Error(`Credit risk model requires non-zero TTM sales for ${account.accountId}.`);
  }

  const recentPayments = paymentHistory.filter((row) => row.window === "Recent");
  const priorPayments = paymentHistory.filter((row) => row.window === "Prior");
  if (recentPayments.length === 0 || priorPayments.length === 0) {
    throw new Error(`Credit risk model requires prior and recent payment windows for ${account.accountId}.`);
  }

  const dso = exposure.div(totalSales.div(365));
  const daysBeyondTerms = Decimal.max(dso.minus(account.termsNetDays), new Decimal(0));
  const utilisation = exposure.div(creditLimit);
  const openDisputeCount = deductions.length;
  const openDisputeAmount = sumDecimal(deductions.map((row) => decimal(row.claimAmount)));
  const unsupportedAmount = sumDecimal(deductions.map((row) => decimal(row.recoverAmount)));
  const recentAvgDaysToPay = averageDecimal(recentPayments.map((row) => decimal(row.daysToPay)));
  const priorAvgDaysToPay = averageDecimal(priorPayments.map((row) => decimal(row.daysToPay)));
  const paymentTrend = derivePaymentTrend(recentAvgDaysToPay, priorAvgDaysToPay, account.termsNetDays);
  const creditRank = computeCreditRank(utilisation, daysBeyondTerms, rows.policy);
  const collectionsRank = computeCollectionsRank(unsupportedAmount, account.gamingFlag, rows.policy);
  const fulfilmentRank = computeFulfilmentRank(deductions);
  const billingRank = computeBillingRank(deductions);
  const verdictRank = Math.max(creditRank, collectionsRank);
  const verdict = verdictByRank[verdictRank];
  if (verdict === undefined) {
    throw new Error(`Unsupported verdict rank ${String(verdictRank)} for ${account.accountId}.`);
  }

  const routeLabel = routeByVerdict[verdict];

  const meshRanks: Record<MeshPosition, number> = {
    Billing: billingRank,
    Collections: collectionsRank,
    Credit: creditRank,
    Fulfilment: fulfilmentRank
  };
  const verdictTone = toneByVerdict[verdict];
  const signals = buildSignals(deductions, deductionLines, contractTpm);
  const evidenceDocumentModels = buildEvidenceDocuments(evidenceDocuments);
  const meshPositions = seededMeshRows
    .slice()
    .sort((left, right) => positionOrder(left.position) - positionOrder(right.position))
    .map((row) => buildMeshPosition(row, meshRanks[row.position], account, deductionLines, contractTpm, {
      collectionsRank,
      creditRank,
      dso,
      fulfilmentRank,
      billingRank,
      daysBeyondTerms,
      unsupportedAmount,
      utilisation
    }));
  const accountRecordIds = dedupe([
    account.accountId,
    ...evidenceDocumentModels.flatMap((document) => [document.documentId, ...document.recordIds]),
    ...signals.flatMap((signal) => signal.recordIds),
    ...meshPositions.flatMap((position) => position.recordIds)
  ]);
  const invalidOtifRecoverAmount = sumDecimal(
    deductions
      .filter((row) => row.verdict === "INVALID" && /OTIF/iu.test(row.type))
      .map((row) => decimal(row.recoverAmount))
  );
  const verdictBasis = buildVerdictBasis({
    account,
    collectionsRank,
    creditRank,
    daysBeyondTerms,
    unsupportedAmount,
    utilisation,
    verdict
  });
  const packetRows = buildPacketRows({
    account,
    creditLimit,
    exposure,
    invalidOtifRecoverAmount,
    policy: rows.policy,
    unsupportedAmount,
    verdict
  });
  const actionId = `credit-v2:${account.accountId}`;
  const approvalReceipt = approvalReceipts.get(actionId);
  const routeLine = buildRouteLine(verdict, packetRows);
  const packet: CreditPacketModel = {
    actionId,
    approvalStatus: approvalReceipt?.approvalStatus ?? "awaiting",
    ...(approvalReceipt === undefined ? {} : { auditEntryHash: approvalReceipt.auditEntryHash }),
    basis: verdictBasis,
    deterministicBasis: {
      collectionsRank,
      creditRank,
      daysBeyondTerms: roundDecimal(daysBeyondTerms, 2),
      exposure: exposure.toFixed(2),
      routeLabel,
      unsupportedAmount: unsupportedAmount.toFixed(2),
      utilisation: roundDecimal(utilisation.times(100), 2),
      verdict
    },
    detail: routeLine,
    dispatchedExternally: false,
    recordIds: accountRecordIds,
    requiresHumanApproval: true,
    routeLabel,
    rows: packetRows,
    title: packetTitle(verdict)
  };

  return {
    accountId: account.accountId,
    actionPacket: packetRows,
    assessmentSteps: buildAssessmentSteps({
      account,
      accountRecordIds,
      collectionsRank,
      creditRank,
      deductions,
      dso,
      exposure,
      openItemCount: arOpenItems.length,
      paymentTrend,
      priorAvgDaysToPay,
      recentAvgDaysToPay,
      routeLabel,
      unsupportedAmount,
      utilisation,
      verdict
    }),
    channel: account.channel,
    copilotConductorLine: `Route ${routeLabel}. ${verdictBasis}`,
    creditLimitAmount: toAmount(creditLimit),
    creditLimitLabel: formatCompactMoney(creditLimit),
    customer: account.customer,
    daysBeyondTerms: toWholeNumber(daysBeyondTerms),
    daysBeyondTermsLabel: formatDays(daysBeyondTerms),
    dsoDays: toWholeNumber(dso),
    dsoLabel: formatDays(dso),
    evidenceDocuments: evidenceDocumentModels,
    exposureAmount: toAmount(exposure),
    exposureLabel: formatCompactMoney(exposure),
    facts: [
      {
        key: "dso",
        label: "DSO",
        tone: toneFromRank(creditRank),
        valueLabel: formatDays(dso)
      },
      {
        key: "days-beyond-terms",
        label: "Beyond terms",
        tone: daysBeyondTerms.gt(0) ? (daysBeyondTerms.greaterThanOrEqualTo(rows.policy.creditWatchDaysBeyondTerms) ? "elevated" : "watch") : "clear",
        valueLabel: formatDays(daysBeyondTerms)
      },
      {
        key: "open-disputes",
        label: "Open disputes",
        tone: toneFromRank(collectionsRank),
        valueLabel: `${openDisputeCount.toString()} · ${formatMoney(openDisputeAmount)}`
      },
      {
        key: "payment-trend",
        label: "Payment trend",
        tone: paymentTrend === "Slowing" ? "elevated" : paymentTrend === "Healthy" ? "clear" : "watch",
        valueLabel: paymentTrend
      }
    ],
    gamingFlag: account.gamingFlag,
    leadLabel: `${account.customer} is ${verdict} risk`,
    meshPositions,
    openDisputeAmount: openDisputeAmount.toNumber(),
    openDisputeAmountLabel: formatMoney(openDisputeAmount),
    openDisputeCount,
    packet,
    paymentTrend,
    paymentTrendLabel: paymentTrend,
    paymentTrendTone: paymentTrend === "Slowing" ? "elevated" : paymentTrend === "Healthy" ? "clear" : "watch",
    priorAvgDaysToPay: toWholeNumber(priorAvgDaysToPay),
    priorAvgDaysToPayLabel: formatDays(priorAvgDaysToPay),
    recentAvgDaysToPay: toWholeNumber(recentAvgDaysToPay),
    recentAvgDaysToPayLabel: formatDays(recentAvgDaysToPay),
    recordIds: accountRecordIds,
    relationshipOwner: account.relationshipOwner,
    routeLabel,
    routeLine,
    segment: account.segment,
    signals,
    termsDays: account.termsNetDays,
    termsLabel: `${account.termsNetDays.toString()}d`,
    totalSalesAmount: toAmount(totalSales),
    totalSalesLabel: formatCompactMoney(totalSales),
    unsupportedAmount: unsupportedAmount.toNumber(),
    unsupportedAmountLabel: formatMoney(unsupportedAmount),
    utilisationRatio: roundAmount(utilisation, 4),
    utilisationLabel: `${toWholeNumber(utilisation.times(100)).toString()}%`,
    utilisationPercent: toWholeNumber(utilisation.times(100)),
    verdict,
    verdictBasis,
    verdictTone
  };
}

function buildEvidenceDocuments(rows: readonly CreditEvidenceDocumentRow[]): CreditEvidenceDocumentModel[] {
  return rows.map((row) => ({
    contentHash: row.contentHash,
    deterministicBasis: "Supabase credit_evidence_documents row + deterministic account record IDs",
    documentId: row.documentId,
    documentType: row.documentType,
    recordIds: dedupe([row.accountId, row.documentId, ...row.recordIds]),
    sourceModeLabel: row.sourceMode,
    synthetic: row.synthetic,
    title: row.title
  }));
}

function assertRequiredRows(rows: CreditRiskRows): void {
  if (rows.accounts.length === 0) {
    throw new Error("Credit risk model requires accounts.");
  }
  if (rows.arOpenItems.length === 0) {
    throw new Error("Credit risk model requires AR open items.");
  }
  if (rows.salesMonthly.length === 0) {
    throw new Error("Credit risk model requires monthly sales.");
  }
  if (rows.paymentHistory.length === 0) {
    throw new Error("Credit risk model requires payment history.");
  }
  if (rows.deductions.length === 0) {
    throw new Error("Credit risk model requires deductions.");
  }
  if (rows.deductionLines.length === 0) {
    throw new Error("Credit risk model requires deduction lines.");
  }
  if (rows.contractTpm.length === 0) {
    throw new Error("Credit risk model requires contract and TPM references.");
  }
  if (rows.riskMeshPositions.length === 0) {
    throw new Error("Credit risk model requires seeded risk mesh positions.");
  }
  for (const key of policyKeys) {
    if (!Object.hasOwn(rows.policy, key)) {
      throw new Error(`Credit risk model missing policy key ${key}.`);
    }
  }
}

function buildSignals(
  deductions: DeductionRow[],
  deductionLines: DeductionLineRow[],
  contractTpm: ContractTpmRow[]
): CreditSignalModel[] {
  return deductions
    .slice()
    .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId))
    .map((deduction) => {
      const relatedLines = deductionLines.filter((line) => line.scenarioId === deduction.scenarioId).map((line) => line.lineId);
      const contractRefs = contractRefsForScenarios(contractTpm, [deduction.scenarioId]);
      return {
        basis: `${deduction.type}; ${deduction.routing}; evidence ${deduction.evidenceRefs}.`,
        feedsMesh: deduction.feedsMesh,
        gamingFlag: deduction.gamingFlag,
        meshPosition: deduction.feedsMesh,
        note: `${deduction.type} · ${deduction.routing}`,
        recordIds: dedupe([deduction.scenarioId, ...relatedLines, ...contractRefs]),
        routeLabel: deduction.routing,
        scenarioId: deduction.scenarioId,
        tone: deduction.gamingFlag ? "high" : deduction.verdict === "INVALID" ? "high" : deduction.verdict === "PARTIAL" ? "elevated" : "clear",
        verdict: deduction.verdict
      };
    });
}

function buildMeshPosition(
  row: RiskMeshPositionRow,
  computedRank: number,
  account: AccountRow,
  deductionLines: DeductionLineRow[],
  contractTpm: ContractTpmRow[],
  metrics: {
    billingRank: number;
    collectionsRank: number;
    creditRank: number;
    daysBeyondTerms: Decimal;
    dso: Decimal;
    fulfilmentRank: number;
    unsupportedAmount: Decimal;
    utilisation: Decimal;
  }
): CreditMeshPositionModel {
  if (row.statusRank !== computedRank || row.status !== statusFromRank(computedRank)) {
    throw new Error(`Mesh position mismatch for ${account.accountId} ${row.position}.`);
  }

  const scenarioIds = parseScenarioIds(row.driverSignals);
  const lineIds = deductionLines.filter((line) => scenarioIds.includes(line.scenarioId)).map((line) => line.lineId);
  const contractRefs = scenarioIds.length === 0 ? generalContractRefs(contractTpm) : contractRefsForScenarios(contractTpm, scenarioIds);
  const missingBasisParts = [
    row.interpretation.trim().length === 0 ? "interpretation" : null,
    row.keyMetric.trim().length === 0 ? "key metric" : null,
    row.driverSignals.trim().length === 0 ? "driver signals" : null
  ].filter((part): part is string => part !== null);
  const contractGapReason = missingBasisParts.length === 0 ? undefined : `Missing seeded ${missingBasisParts.join(" and ")}.`;
  return {
    contractGap: contractGapReason !== undefined,
    ...(contractGapReason === undefined ? {} : { contractGapReason }),
    deterministicBasis: contractGapReason === undefined ? meshDeterministicBasis(row.position, account, scenarioIds, metrics) : null,
    driverSignals: row.driverSignals,
    interpretation: row.interpretation,
    keyMetric: row.keyMetric,
    position: row.position,
    recordIds: dedupe([account.accountId, ...scenarioIds, ...lineIds, ...contractRefs]),
    status: row.status,
    statusRank: row.statusRank,
    statusTone: toneByVerdict[verdictByRank[row.statusRank] ?? "CLEAR"]
  };
}

function buildAssessmentSteps(input: {
  account: AccountRow;
  accountRecordIds: string[];
  collectionsRank: number;
  creditRank: number;
  deductions: DeductionRow[];
  dso: Decimal;
  exposure: Money;
  openItemCount: number;
  paymentTrend: CreditRiskAccountModel["paymentTrend"];
  priorAvgDaysToPay: Decimal;
  recentAvgDaysToPay: Decimal;
  routeLabel: CreditRiskAccountModel["routeLabel"];
  unsupportedAmount: Decimal;
  utilisation: Decimal;
  verdict: CreditVerdict;
}): CreditAssessmentStep[] {
  const steps: CreditAssessmentStep[] = [
    {
      agentName: "SAP OData Retriever",
      didLine: `Loaded AR exposure for ${input.account.customer}.`,
      foundLine: `Exposure ${formatCompactMoney(input.exposure)} across ${input.openItemCount.toString()} open items.`,
      isFinal: false,
      key: `${input.account.accountId}:sap`,
      phase: "overnight",
      recordIds: [input.account.accountId],
      sourceLabel: "SAP AR read-model (synthetic)",
      toolLabel: "credit_ar_open_items"
    },
    {
      agentName: "Supabase Tools Retriever",
      didLine: `Loaded ${input.deductions.length.toString()} deduction scenarios and seeded mesh rows.`,
      foundLine: `Signals span ${input.deductions.map((row) => row.scenarioId).join(", ")}.`,
      isFinal: false,
      key: `${input.account.accountId}:supabase`,
      phase: "overnight",
      recordIds: input.accountRecordIds,
      sourceLabel: "Supabase tools data",
      toolLabel: "credit_* tables"
    },
    {
      agentName: "Bureau / Payment History",
      didLine: "Compared recent and prior payment windows.",
      foundLine: `Payment trend ${input.paymentTrend} (${formatDays(input.recentAvgDaysToPay)} recent vs ${formatDays(input.priorAvgDaysToPay)} prior).`,
      isFinal: false,
      key: `${input.account.accountId}:payment-history`,
      phase: "overnight",
      recordIds: [input.account.accountId],
      sourceLabel: "Bureau / payment-history (synthetic)",
      toolLabel: "credit_payment_history"
    },
    {
      agentName: "Credit Sentinel",
      didLine: "Computed utilisation, DSO, and days beyond terms.",
      foundLine: `Credit rank ${statusFromRank(input.creditRank)} from util ${toWholeNumber(input.utilisation.times(100)).toString()}% and DSO ${formatDays(input.dso)}.`,
      isFinal: false,
      key: `${input.account.accountId}:sentinel`,
      phase: "overnight",
      recordIds: [input.account.accountId],
      sourceLabel: "Credit Sentinel",
      toolLabel: "deterministic-credit-rules"
    },
    {
      agentName: "Risk Mesh Agents",
      didLine: "Cross-checked seeded mesh positions against governed rules.",
      foundLine: `Collections rank ${statusFromRank(input.collectionsRank)} with unsupported ${formatMoney(input.unsupportedAmount)}.`,
      isFinal: false,
      key: `${input.account.accountId}:risk-mesh`,
      phase: "overnight",
      recordIds: input.accountRecordIds,
      sourceLabel: "Closed-Loop Risk Mesh",
      toolLabel: "credit_risk_mesh_positions"
    }
  ];

  if (input.account.gamingFlag) {
    steps.push({
      agentName: "Behavioural Containment",
      didLine: "Detected behavioural gaming pattern.",
      foundLine: "Containment remains review-only; no external action dispatched.",
      isFinal: false,
      key: `${input.account.accountId}:containment`,
      phase: "overnight",
      recordIds: input.accountRecordIds,
      sourceLabel: "Behavioural Containment",
      toolLabel: "gaming-flag"
    });
  }

  steps.push(
    {
      agentName: "Credit Decisioning",
      didLine: "Derived the portfolio verdict from Credit and Collections ranks.",
      foundLine: `Verdict ${input.verdict}.`,
      isFinal: false,
      key: `${input.account.accountId}:decision`,
      phase: "overnight",
      recordIds: input.accountRecordIds,
      sourceLabel: "Credit decisioning",
      toolLabel: "max(credit,collections)"
    },
    {
      agentName: "Action Packet Drafter",
      didLine: "Prepared the governed review packet.",
      foundLine: `${input.routeLabel} action packet ready for human approval.`,
      isFinal: true,
      key: `${input.account.accountId}:packet`,
      phase: "overnight",
      recordIds: input.accountRecordIds,
      sourceLabel: "Action packet drafter",
      toolLabel: "draft-only",
      verdict: input.verdict,
      verdictLabel: input.verdict
    }
  );
  return steps;
}

function buildPacketRows(input: {
  account: AccountRow;
  creditLimit: Money;
  exposure: Money;
  invalidOtifRecoverAmount: Decimal;
  policy: CreditPolicy;
  unsupportedAmount: Decimal;
  verdict: CreditVerdict;
}): CreditPacketRow[] {
  const reducedLimit = roundToStep(input.exposure.mul(input.policy.reduceLimitBuffer), input.policy.reduceLimitRounding);
  switch (input.verdict) {
    case "HIGH":
      return [
        {
          amountValue: toAmount(input.unsupportedAmount),
          amountLabel: formatMoney(input.unsupportedAmount),
          detail: "Unsupported deductions withheld pending governed review.",
          kind: "hold",
          label: "Unsupported deductions hold"
        },
        {
          amountValue: toAmount(input.creditLimit),
          amountLabel: formatCompactMoney(input.creditLimit),
          detail: "Freeze the current credit limit while the pattern is reviewed.",
          kind: "limit",
          label: "Current credit limit"
        }
      ];
    case "ELEVATED":
      return [
        {
          amountValue: toAmount(reducedLimit),
          amountLabel: formatCompactMoney(reducedLimit),
          detail: "Reduced limit derived from exposure × policy buffer, rounded to the governed step.",
          kind: "reduce",
          label: "Reduced limit"
        }
      ];
    case "WATCH":
      return [
        {
          amountValue: toAmount(input.invalidOtifRecoverAmount),
          amountLabel: formatMoney(input.invalidOtifRecoverAmount),
          detail: "Monitor the invalid OTIF recovery amount already in flight.",
          kind: "monitor",
          label: "Recovery under watch"
        }
      ];
    case "CLEAR":
      return [
        {
          amountValue: toAmount(input.creditLimit),
          amountLabel: formatCompactMoney(input.creditLimit),
          detail: "Maintain the current credit limit and standard release posture.",
          kind: "release",
          label: "Maintain current limit"
        }
      ];
  }
}

function buildVerdictBasis(input: {
  account: AccountRow;
  collectionsRank: number;
  creditRank: number;
  daysBeyondTerms: Decimal;
  unsupportedAmount: Decimal;
  utilisation: Decimal;
  verdict: CreditVerdict;
}): string {
  return `${input.account.customer} is ${input.verdict} because Credit=${statusFromRank(input.creditRank)} ` +
    `(util ${toWholeNumber(input.utilisation.times(100)).toString()}%, ${formatDays(input.daysBeyondTerms)} beyond terms) ` +
    `and Collections=${statusFromRank(input.collectionsRank)} (unsupported ${formatMoney(input.unsupportedAmount)}).`;
}

function buildRouteLine(verdict: CreditVerdict, packetRows: CreditPacketRow[]): string {
  switch (verdict) {
    case "HIGH":
      return "Contain exposure and keep every external send gated behind human review.";
    case "ELEVATED":
      return `Reduce the limit to ${packetRows[0]?.amountLabel ?? "the governed level"} until deductions normalize.`;
    case "WATCH":
      return "Monitor recovery progress and payment behaviour this week.";
    case "CLEAR":
      return "Release the account to the standard weekly review cadence.";
  }
}

function packetTitle(verdict: CreditVerdict): string {
  switch (verdict) {
    case "HIGH":
      return "Contain and freeze exposure";
    case "ELEVATED":
      return "Reduce credit limit";
    case "WATCH":
      return "Monitor recovery";
    case "CLEAR":
      return "Release to standard cadence";
  }
}

function meshDeterministicBasis(
  position: MeshPosition,
  account: AccountRow,
  scenarioIds: string[],
  metrics: {
    billingRank: number;
    collectionsRank: number;
    creditRank: number;
    daysBeyondTerms: Decimal;
    dso: Decimal;
    fulfilmentRank: number;
    unsupportedAmount: Decimal;
    utilisation: Decimal;
  }
): string {
  switch (position) {
    case "Credit":
      return `Credit rank ${statusFromRank(metrics.creditRank)} from utilisation ${toWholeNumber(metrics.utilisation.times(100)).toString()}% and DSO ${formatDays(metrics.dso)} vs Net ${account.termsNetDays.toString()}d.`;
    case "Collections":
      return `Collections rank ${statusFromRank(metrics.collectionsRank)} from unsupported ${formatMoney(metrics.unsupportedAmount)}${account.gamingFlag ? " plus gaming flag [D]" : ""}.`;
    case "Fulfilment":
      return `Fulfilment rank ${statusFromRank(metrics.fulfilmentRank)} from scenario${scenarioIds.length === 1 ? "" : "s"} ${scenarioIds.join(", ") || "none"} crossing the OTIF/SLA rule.`;
    case "Billing":
      return `Billing rank ${statusFromRank(metrics.billingRank)} from valid promo/pricing scenarios ${scenarioIds.join(", ") || "none"}.`;
  }
}

function computeCreditRank(utilisation: Decimal, daysBeyondTerms: Decimal, policy: CreditPolicy): number {
  if (utilisation.greaterThanOrEqualTo(policy.creditHighUtil)) {
    return 3;
  }
  if (utilisation.greaterThanOrEqualTo(policy.creditElevatedUtil)) {
    return 2;
  }
  if (daysBeyondTerms.greaterThanOrEqualTo(policy.creditWatchDaysBeyondTerms)) {
    return 1;
  }
  return 0;
}

function computeCollectionsRank(unsupportedAmount: Decimal, gamingFlag: boolean, policy: CreditPolicy): number {
  if (gamingFlag || unsupportedAmount.greaterThanOrEqualTo(policy.collectionsHighUnsupported)) {
    return 3;
  }
  if (unsupportedAmount.greaterThanOrEqualTo(policy.collectionsElevatedUnsupported)) {
    return 2;
  }
  if (unsupportedAmount.gt(0)) {
    return 1;
  }
  return 0;
}

function computeFulfilmentRank(deductions: DeductionRow[]): number {
  return deductions.some((row) => row.verdict === "VALID" && /(OTIF|SLA)/iu.test(row.type)) ? 2 : 0;
}

function computeBillingRank(deductions: DeductionRow[]): number {
  return deductions.some((row) => row.validAmount > 0 && /(promo|pricing)/iu.test(row.type)) ? 1 : 0;
}

function derivePaymentTrend(recent: Decimal, prior: Decimal, termsDays: number): CreditRiskAccountModel["paymentTrend"] {
  if (recent.minus(prior).greaterThanOrEqualTo(5)) {
    return "Slowing";
  }
  if (recent.lessThanOrEqualTo(decimal(termsDays).minus(3))) {
    return "Healthy";
  }
  return "Stable";
}

function indexApprovalReceipts(receipts: readonly CreditRiskApprovalReceipt[]): Map<string, CreditRiskApprovalReceipt> {
  const indexed = new Map<string, CreditRiskApprovalReceipt>();
  for (const receipt of receipts) {
    if (indexed.has(receipt.actionId)) {
      throw new Error(`Duplicate approval receipt for ${receipt.actionId}.`);
    }
    indexed.set(receipt.actionId, receipt);
  }
  return indexed;
}

function contractRefsForScenarios(contractTpm: ContractTpmRow[], scenarioIds: readonly string[]): string[] {
  return contractTpm
    .filter((row) => parseScenarioList(row.usedInScenario).some((scenarioId) => scenarioIds.includes(scenarioId)))
    .map((row) => row.referenceId);
}

function generalContractRefs(contractTpm: ContractTpmRow[]): string[] {
  return contractTpm.filter((row) => row.usedInScenario === "General").map((row) => row.referenceId);
}

function parseScenarioIds(driverSignals: string): string[] {
  return driverSignals
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^S\d+$/u.test(part));
}

function parseScenarioList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => /^S\d+$/u.test(part));
}

function positionOrder(position: MeshPosition): number {
  switch (position) {
    case "Credit":
      return 0;
    case "Fulfilment":
      return 1;
    case "Billing":
      return 2;
    case "Collections":
      return 3;
  }
}

function statusFromRank(rank: number): CreditMeshPositionModel["status"] {
  switch (rank) {
    case 0:
      return "OK";
    case 1:
      return "WATCH";
    case 2:
      return "ELEVATED";
    case 3:
      return "HIGH";
    default:
      throw new Error(`Unsupported mesh rank ${String(rank)}.`);
  }
}

function toneFromRank(rank: number): VerdictTone {
  switch (rank) {
    case 0:
      return "clear";
    case 1:
      return "watch";
    case 2:
      return "elevated";
    case 3:
      return "high";
    default:
      throw new Error(`Unsupported tone rank ${String(rank)}.`);
  }
}

function sumMoney(values: readonly Money[]): Money {
  return money(values.reduce((total, value) => total.plus(value), new Decimal(0)));
}

function sumAmountNumbers(values: readonly number[]): Money {
  return sumMoney(values.map((value) => toMoney(value)));
}

function sumDecimal(values: readonly Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

function averageDecimal(values: readonly Decimal[]): Decimal {
  if (values.length === 0) {
    throw new Error("Average requires at least one value.");
  }
  return sumDecimal(values).div(values.length);
}

function roundToStep(value: Decimal, step: number): Decimal {
  const stepDecimal = decimal(step);
  return value.div(stepDecimal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(stepDecimal);
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function toMoney(value: number): Money {
  return money(decimal(value));
}

function decimal(value: number | string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(String(value));
}

function formatMoney(value: Decimal): string {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(decimal(value).toNumber())}`;
}

function formatCompactMoney(value: Decimal): string {
  const amount = decimal(value);
  if (amount.abs().greaterThanOrEqualTo(1_000_000)) {
    const millions = trimTrailingZeros(amount.div(1_000_000).toDecimalPlaces(2).toFixed(2));
    return `$${millions}M`;
  }
  return formatMoney(amount);
}

function formatDays(value: Decimal): string {
  return `${toWholeNumber(value).toString()}d`;
}

function toAmount(value: Decimal): number {
  return roundAmount(decimal(value), 2);
}

function toWholeNumber(value: Decimal): number {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

function roundAmount(value: Decimal, places: number): number {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toNumber();
}

function roundDecimal(value: Decimal, places: number): string {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/u, "");
}

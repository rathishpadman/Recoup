import { z } from "zod";
import { sha256CanonicalJson } from "../../config/governed.js";
import type { RuntimeEnv } from "../../config/env.js";
import type { RuleId } from "../core/rules/index.js";
import type { RealEvidenceDataset } from "../services/evidenceMaterializer.js";
import type { ReconciliationReceipt } from "../services/reconciliationEngine.js";
import { DeductionClaimSchema, type DeductionClaim } from "../types/claims.js";
import { CoreRuleInputSchema, RuleIdSchema } from "../types/decision.js";
import {
  CanonicalEvidenceDocumentSchema,
  EvidenceLinkSchema,
  type CanonicalEvidenceDocument,
  type EvidenceLink
} from "../types/evidence.js";
import {
  CustomerSchema,
  DeductionLineSchema,
  SyntheticDatasetSchema,
  type DeductionRouting,
  type DeductionVerdict,
  type DeductionLine,
  type SyntheticDatasetCore
} from "../types/entities.js";
import { SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR, type EnterpriseConnectorName } from "./enterpriseReadOnly.js";
import type { SourcePort, SourceRiskObservationSnapshot } from "./source.js";

export type SupabaseSyntheticSourceFetch = (url: string, init: RequestInit) => Promise<Response>;
export type SyntheticSourceEvidenceSource = "bureau" | "docs" | "remittance" | "tpm";
export type SyntheticSourceEvidenceType =
  | "POD"
  | "bureau-signal"
  | "carrier-report"
  | "contract"
  | "correspondence"
  | "credit-memo"
  | "edi-remittance"
  | "remittance-advice"
  | "trade-promo";
export type SapSourceEvidenceType = "credit-memo" | "invoice";

export interface SyntheticSourceEvidence {
  documentId: string;
  documentType: SyntheticSourceEvidenceType;
  freshnessRecordIds?: string[];
  provenance: "synthetic";
  recordIds: string[];
  source: SyntheticSourceEvidenceSource;
  summary: string;
}

export interface SupabaseSyntheticSourceReader {
  readEvidence(connectorName: EnterpriseConnectorName, line: DeductionLine): Promise<SyntheticSourceEvidence[]>;
  readEvidenceBatch?(
    connectorName: EnterpriseConnectorName,
    lines: readonly DeductionLine[]
  ): Promise<Map<string, SyntheticSourceEvidence[]>>;
}

export interface SapSourceEvidence {
  documentId: string;
  documentType: SapSourceEvidenceType;
  freshnessRecordIds?: string[];
  provenance: "sap-odata";
  recordIds: string[];
  source: "sap";
  summary: string;
}

export interface SupabaseSapEvidenceReader {
  readEvidence(line: DeductionLine): Promise<SapSourceEvidence[]>;
  readEvidenceBatch?(lines: readonly DeductionLine[]): Promise<Map<string, SapSourceEvidence[]>>;
}

export interface SupabaseSyntheticSourceReaderOptions {
  fetcher?: SupabaseSyntheticSourceFetch;
  serviceRoleKey: string;
  url: string;
}

export type SupabaseSapEvidenceReaderOptions = SupabaseSyntheticSourceReaderOptions;

export interface SupabaseSettlementRunReader {
  loadSettlementRun(): Promise<SyntheticDatasetCore>;
  loadRealEvidenceDataset(): Promise<RealEvidenceDataset>;
  loadReconciliationReceipts(): Promise<ReconciliationReceipt[]>;
}

export interface SupabaseSettlementRunReaderOptions {
  fetcher?: SupabaseSyntheticSourceFetch;
  seed: 42;
  serviceRoleKey: string;
  url: string;
}

export interface SupabaseRiskObservationSourceConfig {
  baselinePaymentRefs: string[];
  criticalAlertSeverity: string;
  criticalAlertType: string;
  citedDeductionVerdicts: string[];
  currentPaymentRef: string;
  sourceCustomerId: string;
}

export interface SupabaseRiskObservationSnapshotReader {
  loadRiskObservationSnapshot(customerId: string): Promise<SourceRiskObservationSnapshot | undefined>;
}

export interface SupabaseRiskObservationSnapshotReaderOptions {
  fetcher?: SupabaseSyntheticSourceFetch;
  riskCaseSources: Record<string, SupabaseRiskObservationSourceConfig>;
  serviceRoleKey: string;
  url: string;
}

const jsonArraySchema = z.preprocess(parseJsonCell, z.array(z.string().min(1)));
const jsonObjectSchema = z.preprocess(parseJsonCell, z.record(z.unknown()));
const syntheticProvenanceSchema = z.literal("synthetic");

const bureauRowSchema = z.object({
  as_of_date: z.string().min(1),
  bureau_id: z.string().min(1),
  customer_id: z.string().min(1),
  delinquency_flag: z.boolean(),
  limit_recommendation: z.union([z.number(), z.string()]),
  provenance: syntheticProvenanceSchema,
  public_records: jsonObjectSchema,
  risk_score: z.coerce.number().int().min(0).max(100)
});

const docsRowSchema = z.object({
  customer_id: z.string().min(1),
  doc_id: z.string().min(1),
  doc_type: z.enum(["POD", "TPM", "contract", "correspondence"]),
  linked_record_ids: jsonArraySchema,
  provenance: syntheticProvenanceSchema,
  signed_date: z.string().nullable().optional(),
  uri: z.string().min(1)
});

const remittanceRowSchema = z.object({
  currency: z.string().min(1),
  customer_id: z.string().min(1),
  deduction_refs: jsonArraySchema,
  invoice_refs: jsonArraySchema,
  paid_amount: z.union([z.number(), z.string()]),
  payment_date: z.string().min(1),
  provenance: syntheticProvenanceSchema,
  remit_id: z.string().min(1),
  transaction_set: z.enum(["810", "812", "820", "manual"])
});

const tpmRowSchema = z.object({
  accrued_amount: z.union([z.number(), z.string()]),
  approved_allowance: z.union([z.number(), z.string()]),
  claim_refs: jsonArraySchema,
  customer_id: z.string().min(1),
  product_scope: jsonObjectSchema,
  promo_id: z.string().min(1),
  promo_type: z.string().min(1),
  provenance: syntheticProvenanceSchema,
  window_end: z.string().min(1),
  window_start: z.string().min(1)
});

const sapRowSchema = z.object({
  customer_id: z.string().min(1),
  document_type: z.enum(["credit-memo", "invoice"]),
  entity_set: z.string().min(1),
  linked_record_ids: jsonArraySchema,
  payload_json: jsonObjectSchema,
  provenance: z.literal("sap-odata"),
  retrieved_at: z.string().min(1),
  sap_document_id: z.string().min(1),
  service_name: z.string().min(1),
  summary: z.string().min(1)
}).superRefine((row, ctx) => {
  if (row.entity_set !== "C_BillingDocumentFs") {
    return;
  }

  const linkedSapCustomerIds = row.linked_record_ids.filter(isSapCustomerRecordId);
  if (linkedSapCustomerIds.length === 0) {
    return;
  }

  const soldToParty = readSapPayloadString(row.payload_json, "SoldToParty");
  if (soldToParty === undefined || linkedSapCustomerIds.some((linkedSapCustomerId) => linkedSapCustomerId !== soldToParty)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SAP header row SoldToParty does not match linked SAP customer provenance."
    });
  }
});

const riskPaymentRowSchema = z.object({
  customer_id: z.string().min(1),
  days_to_pay: z.coerce.number().int().nonnegative(),
  invoice_ref: z.string().min(1)
});

const riskScoreComponentScoresSchema = z
  .object({
    agingConcentration: z.number().finite().min(0).max(100),
    disputeRate: z.number().finite().min(0).max(100),
    dsoAdp: z.number().finite().min(0).max(100),
    overLimitFrequency: z.number().finite().min(0).max(100)
  })
  .strict();

const riskCustomerRowSchema = z.object({
  customer_id: z.string().min(1),
  customer_name: z.string().min(1),
  r_score_component_scores_json: z.preprocess(parseJsonCell, riskScoreComponentScoresSchema).nullable().optional()
});

const riskBureauAlertRowSchema = z.object({
  alert_id: z.string().min(1),
  alert_type: z.string().min(1),
  customer_id: z.string().min(1),
  resolved: z.boolean(),
  severity: z.string().min(1)
});

const riskDeductionBacklogRowSchema = z.object({
  customer_id: z.string().min(1),
  deduction_id: z.string().min(1),
  invoice_ref: z.string().min(1),
  verdict: z.enum(["PENDING", "VALID", "INVALID", "PARTIAL"])
});

const settlementCustomerRowSchema = z.object({
  customer_id: z.string().min(1),
  name: z.string().min(1),
  profile: z.string().min(1)
});

const settlementDeductionClaimRowSchema = z.object({
  claim_amount: z.union([z.number(), z.string()]),
  claim_id: z.string().min(1),
  customer_id: z.string().min(1),
  invoice_ref: z.string().min(1),
  line_id: z.string().min(1),
  reason_code: z.string().min(1),
  record_ids: jsonArraySchema,
  remittance_evidence_id: z.string().min(1)
});

const reconciliationReceiptRowSchema = z.object({
  claim_id: z.string().min(1),
  confidence_factors: jsonObjectSchema,
  content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  derived_rule_input_json: jsonObjectSchema,
  deterministic_basis: jsonObjectSchema,
  evidence_ids: jsonArraySchema,
  line_id: z.string().min(1),
  receipt_id: z.string().min(1),
  rule_id: RuleIdSchema
});

const evidenceDocumentRowSchema = z.object({
  content_hash: z.string().regex(/^[a-f0-9]{64}$/u),
  customer_id: z.string().min(1),
  document_type: z.string().min(1),
  evidence_id: z.string().min(1),
  payload_json: jsonObjectSchema,
  provenance: z.string().min(1),
  raw_text: z.string().nullable().optional(),
  retrieved_at: z.string().min(1),
  source_record_id: z.string().min(1),
  source_system: z.string().min(1),
  storage_uri: z.string().nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_to: z.string().nullable().optional()
});

const evidenceLinkRowSchema = z.object({
  evidence_id: z.string().min(1),
  record_id: z.string().min(1),
  record_role: z.string().min(1)
});

export function createSupabaseSyntheticSourceReader(options: SupabaseSyntheticSourceReaderOptions): SupabaseSyntheticSourceReader {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;
  const sourceRowsByTableAndCustomer = new Map<string, Promise<unknown[]>>();
  const sourceRowsByTableAndCustomerSet = new Map<string, Promise<unknown[]>>();

  return {
    async readEvidence(connectorName, line) {
      const tableName = SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR[connectorName];
      const rows = await requestCachedSyntheticRows(sourceRowsByTableAndCustomer, fetcher, {
        baseUrl,
        line,
        serviceRoleKey: options.serviceRoleKey,
        tableName
      });

      return rows.flatMap((row) => mapSyntheticRow(connectorName, line, row));
    },
    async readEvidenceBatch(connectorName, lines) {
      const tableName = SYNTHETIC_SOURCE_TABLE_BY_CONNECTOR[connectorName];
      const rows = await requestCachedSyntheticRowsForCustomers(sourceRowsByTableAndCustomerSet, fetcher, {
        baseUrl,
        lines,
        serviceRoleKey: options.serviceRoleKey,
        tableName
      });

      return mapRowsByLine(lines, rows, (line, row) => mapSyntheticRow(connectorName, line, row));
    }
  };
}

export function createSupabaseSapEvidenceReader(options: SupabaseSapEvidenceReaderOptions): SupabaseSapEvidenceReader {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;
  const sourceRowsByTableAndCustomer = new Map<string, Promise<unknown[]>>();
  const sourceRowsByTableAndCustomerSet = new Map<string, Promise<unknown[]>>();

  return {
    async readEvidence(line) {
      const rows = await requestCachedSyntheticRows(sourceRowsByTableAndCustomer, fetcher, {
        baseUrl,
        line,
        serviceRoleKey: options.serviceRoleKey,
        tableName: "recoup_src_sap"
      });

      return rows.flatMap((row) => mapSapSourceRow(line, row));
    },
    async readEvidenceBatch(lines) {
      const rows = await requestCachedSyntheticRowsForCustomers(sourceRowsByTableAndCustomerSet, fetcher, {
        baseUrl,
        lines,
        serviceRoleKey: options.serviceRoleKey,
        tableName: "recoup_src_sap"
      });

      return mapRowsByLine(lines, rows, mapSapSourceRow);
    }
  };
}

export function createSupabaseSyntheticSourceReaderFromEnv(
  env: Partial<Pick<RuntimeEnv, "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL">>,
  fetcher?: SupabaseSyntheticSourceFetch
): SupabaseSyntheticSourceReader | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createSupabaseSyntheticSourceReader({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function createSupabaseSapEvidenceReaderFromEnv(
  env: Partial<Pick<RuntimeEnv, "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL">>,
  fetcher?: SupabaseSyntheticSourceFetch
): SupabaseSapEvidenceReader | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createSupabaseSapEvidenceReader({
    ...(fetcher === undefined ? {} : { fetcher }),
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function createSupabaseSettlementRunReader(options: SupabaseSettlementRunReaderOptions): SupabaseSettlementRunReader {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;
  let snapshot: Promise<{
    evidenceDataset: RealEvidenceDataset;
    receipts: ReconciliationReceipt[];
    settlementRun: SyntheticDatasetCore;
  }> | undefined;

  async function loadSnapshot(): Promise<{
    evidenceDataset: RealEvidenceDataset;
    receipts: ReconciliationReceipt[];
    settlementRun: SyntheticDatasetCore;
  }> {
    snapshot ??= loadSupabaseSettlementSnapshot(fetcher, {
      baseUrl,
      seed: options.seed,
      serviceRoleKey: options.serviceRoleKey
    });

    return snapshot;
  }

  return {
    async loadSettlementRun() {
      return (await loadSnapshot()).settlementRun;
    },
    async loadRealEvidenceDataset() {
      return (await loadSnapshot()).evidenceDataset;
    },
    async loadReconciliationReceipts() {
      return (await loadSnapshot()).receipts;
    }
  };
}

async function loadSupabaseSettlementSnapshot(
  fetcher: SupabaseSyntheticSourceFetch,
  options: {
    baseUrl: string;
    seed: 42;
    serviceRoleKey: string;
  }
): Promise<{ evidenceDataset: RealEvidenceDataset; receipts: ReconciliationReceipt[]; settlementRun: SyntheticDatasetCore }> {
  const [customerRows, claimRows, receiptRows, evidenceRows, evidenceLinkRows] = await Promise.all([
    requestSupabaseRows(fetcher, {
      baseUrl: options.baseUrl,
      orderBy: "customer_id.asc",
      serviceRoleKey: options.serviceRoleKey,
      tableName: "recoup_customers"
    }),
    requestSupabaseRows(fetcher, {
      baseUrl: options.baseUrl,
      orderBy: "line_id.asc",
      serviceRoleKey: options.serviceRoleKey,
      tableName: "recoup_deduction_claims"
    }),
    requestSupabaseRows(fetcher, {
      baseUrl: options.baseUrl,
      orderBy: "line_id.asc",
      serviceRoleKey: options.serviceRoleKey,
      tableName: "recoup_reconciliation_receipts"
    }),
    requestSupabaseRows(fetcher, {
      baseUrl: options.baseUrl,
      orderBy: "evidence_id.asc",
      serviceRoleKey: options.serviceRoleKey,
      tableName: "recoup_evidence_documents"
    }),
    requestSupabaseRows(fetcher, {
      baseUrl: options.baseUrl,
      orderBy: "evidence_id.asc",
      serviceRoleKey: options.serviceRoleKey,
      tableName: "recoup_evidence_links"
    })
  ]);
  if (customerRows.length === 0 || claimRows.length === 0 || receiptRows.length === 0 || evidenceRows.length === 0) {
    throw new Error("Supabase settlement source rows are incomplete.");
  }

  const customers = customerRows.map((row) => {
    const customerRow = settlementCustomerRowSchema.parse(row);
    return CustomerSchema.parse({
      customerId: customerRow.customer_id,
      name: customerRow.name,
      profile: customerRow.profile
    });
  });
  const customerIds = new Set(customers.map((customer) => customer.customerId));
  const receipts = receiptRows.map(toReconciliationReceipt);
  const receiptsByClaimId = new Map(receipts.map((receipt) => [receipt.claimId, receipt]));
  const claims = claimRows.map(toDeductionClaim);
  const evidenceDataset: RealEvidenceDataset = {
    claims,
    documents: evidenceRows.map(toCanonicalEvidenceDocument),
    links: evidenceLinkRows.map(toEvidenceLink)
  };
  validateRealEvidenceDataset(evidenceDataset, receipts);

  const deductionLines = claims.map((claim) => {
    if (!customerIds.has(claim.customerId)) {
      throw new Error(`Supabase settlement claim references an unknown customer: ${claim.customerId}.`);
    }

    const receipt = receiptsByClaimId.get(claim.claimId);
    if (receipt === undefined || receipt.lineId !== claim.lineId) {
      throw new Error(`Supabase reconciliation receipt missing for ${claim.lineId}.`);
    }
    const ruleInput = CoreRuleInputSchema.parse(receipt.derivedRuleInput);
    if (ruleInput.lineId !== claim.lineId || ruleInput.ruleId !== receipt.ruleId) {
      throw new Error(`Supabase reconciliation receipt does not match claim ${claim.claimId}.`);
    }

    const verdict = verdictForRule(receipt.ruleId);
    return DeductionLineSchema.parse({
      amount: claim.claimAmount,
      customerId: claim.customerId,
      eventId: receipt.contentHash,
      lineId: claim.lineId,
      period: ruleInput.period,
      recordIds: uniqueStrings([
        ...claim.recordIds,
        claim.invoiceRef,
        claim.remittanceEvidenceId,
        receipt.receiptId,
        ...receipt.evidenceIds
      ]),
      routing: routingForVerdict(verdict),
      ruleId: receipt.ruleId,
      ruleInput: receipt.derivedRuleInput,
      scenarioId: scenarioIdFromLineId(claim.lineId),
      scenarioType: claim.reasonCode,
      verdict
    });
  });

  return {
    evidenceDataset,
    receipts,
    settlementRun: SyntheticDatasetSchema.parse({
      customers,
      deductionLines,
      seed: options.seed
    })
  };
}

function toReconciliationReceipt(row: unknown): ReconciliationReceipt {
  const receiptRow = reconciliationReceiptRowSchema.parse(row);
  CoreRuleInputSchema.parse(receiptRow.derived_rule_input_json);

  return {
    claimId: receiptRow.claim_id,
    confidenceFactors: receiptRow.confidence_factors,
    contentHash: receiptRow.content_hash,
    derivedRuleInput: receiptRow.derived_rule_input_json as ReconciliationReceipt["derivedRuleInput"],
    deterministicBasis: receiptRow.deterministic_basis,
    evidenceIds: receiptRow.evidence_ids,
    lineId: receiptRow.line_id,
    receiptId: receiptRow.receipt_id,
    ruleId: receiptRow.rule_id
  };
}

function toDeductionClaim(row: unknown): DeductionClaim {
  const claimRow = settlementDeductionClaimRowSchema.parse(row);

  return DeductionClaimSchema.parse({
    claimAmount: String(claimRow.claim_amount),
    claimId: claimRow.claim_id,
    customerId: claimRow.customer_id,
    invoiceRef: claimRow.invoice_ref,
    lineId: claimRow.line_id,
    reasonCode: claimRow.reason_code,
    recordIds: claimRow.record_ids,
    remittanceEvidenceId: claimRow.remittance_evidence_id
  });
}

function toCanonicalEvidenceDocument(row: unknown): CanonicalEvidenceDocument {
  const documentRow = evidenceDocumentRowSchema.parse(row);

  return CanonicalEvidenceDocumentSchema.parse({
    contentHash: documentRow.content_hash,
    customerId: documentRow.customer_id,
    documentType: documentRow.document_type,
    evidenceId: documentRow.evidence_id,
    payload: documentRow.payload_json,
    provenance: documentRow.provenance,
    ...(documentRow.raw_text === undefined || documentRow.raw_text === null ? {} : { rawText: documentRow.raw_text }),
    retrievedAt: normalizeTimestampIso(documentRow.retrieved_at),
    sourceRecordId: documentRow.source_record_id,
    sourceSystem: documentRow.source_system,
    ...(documentRow.storage_uri === undefined || documentRow.storage_uri === null ? {} : { storageUri: documentRow.storage_uri }),
    ...(documentRow.valid_from === undefined || documentRow.valid_from === null ? {} : { validFrom: documentRow.valid_from }),
    ...(documentRow.valid_to === undefined || documentRow.valid_to === null ? {} : { validTo: documentRow.valid_to })
  });
}

function toEvidenceLink(row: unknown): EvidenceLink {
  const linkRow = evidenceLinkRowSchema.parse(row);

  return EvidenceLinkSchema.parse({
    evidenceId: linkRow.evidence_id,
    recordId: linkRow.record_id,
    recordRole: linkRow.record_role
  });
}

function validateRealEvidenceDataset(dataset: RealEvidenceDataset, receipts: readonly ReconciliationReceipt[]): void {
  const evidenceIds = new Set(dataset.documents.map((document) => document.evidenceId));
  for (const claim of dataset.claims) {
    if (!evidenceIds.has(claim.remittanceEvidenceId)) {
      throw new Error(`Supabase evidence document missing for remittance evidence ${claim.remittanceEvidenceId}.`);
    }
  }
  for (const receipt of receipts) {
    const missingEvidenceId = receipt.evidenceIds.find((evidenceId) => !evidenceIds.has(evidenceId));
    if (missingEvidenceId !== undefined) {
      throw new Error(`Supabase evidence document missing for reconciliation receipt ${receipt.receiptId}: ${missingEvidenceId}.`);
    }
  }
}

function scenarioIdFromLineId(lineId: string): DeductionLine["scenarioId"] {
  const scenarioId = lineId.match(/^(S[1-8])-/u)?.[1];
  return z.enum(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]).parse(scenarioId);
}

function verdictForRule(ruleId: RuleId): DeductionVerdict {
  switch (ruleId) {
    case "damage-evidence-valid":
    case "promo-not-captured":
    case "otif-fine-valid":
      return "valid";
    case "promo-overclaim":
      return "partial";
    case "shortage-pod-mismatch":
    case "otif-timestamp-mismatch":
    case "pricing-below-contract":
    case "duplicate-credit":
      return "invalid";
  }
}

function routingForVerdict(verdict: DeductionVerdict): DeductionRouting {
  return verdict === "valid" ? "billing" : "recovery";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function normalizeTimestampIso(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Supabase evidence timestamp failed validation.`);
  }

  return new Date(timestamp).toISOString();
}

export function createSupabaseSettlementRunReaderFromEnv(
  env: Partial<Pick<RuntimeEnv, "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL">>,
  seed: 42,
  fetcher?: SupabaseSyntheticSourceFetch
): SupabaseSettlementRunReader | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createSupabaseSettlementRunReader({
    ...(fetcher === undefined ? {} : { fetcher }),
    seed,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

export function sourcePortFromSupabaseSnapshots(input: {
  riskObservationSnapshot?: SourceRiskObservationSnapshot | undefined;
  settlementRun: SyntheticDatasetCore;
}): SourcePort {
  return {
    loadRiskObservationSnapshot(customerId) {
      return input.riskObservationSnapshot?.customerId === customerId ? input.riskObservationSnapshot : undefined;
    },
    loadSettlementRun() {
      return input.settlementRun;
    }
  };
}

export function createSupabaseRiskObservationSnapshotReader(
  options: SupabaseRiskObservationSnapshotReaderOptions
): SupabaseRiskObservationSnapshotReader {
  const baseUrl = normalizeSupabaseUrl(options.url);
  const fetcher = options.fetcher ?? fetch;

  return {
    async loadRiskObservationSnapshot(customerId) {
      const sourceConfig = options.riskCaseSources[customerId];
      if (sourceConfig === undefined) {
        return undefined;
      }

      const [customerRows, paymentRows, bureauRows, deductionRows] = await Promise.all([
        requestToolsDataRows(fetcher, {
          baseUrl,
          serviceRoleKey: options.serviceRoleKey,
          sourceCustomerId: sourceConfig.sourceCustomerId,
          tableName: "customers"
        }).then((rows) => rows.map((row) => riskCustomerRowSchema.parse(row))),
        requestToolsDataRows(fetcher, {
          baseUrl,
          serviceRoleKey: options.serviceRoleKey,
          sourceCustomerId: sourceConfig.sourceCustomerId,
          tableName: "payments"
        }).then((rows) => rows.map((row) => riskPaymentRowSchema.parse(row))),
        requestToolsDataRows(fetcher, {
          baseUrl,
          serviceRoleKey: options.serviceRoleKey,
          sourceCustomerId: sourceConfig.sourceCustomerId,
          tableName: "bureau_alerts"
        }).then((rows) => rows.map((row) => riskBureauAlertRowSchema.parse(row))),
        requestToolsDataRows(fetcher, {
          baseUrl,
          serviceRoleKey: options.serviceRoleKey,
          sourceCustomerId: sourceConfig.sourceCustomerId,
          tableName: "deductions_backlog"
        }).then((rows) => rows.map((row) => riskDeductionBacklogRowSchema.parse(row)))
      ]);
      const baselinePayments = sourceConfig.baselinePaymentRefs
        .map((invoiceRef) => paymentRows.find((row) => row.invoice_ref === invoiceRef))
        .filter((row): row is z.infer<typeof riskPaymentRowSchema> => row !== undefined);
      const currentPayment = paymentRows.find((row) => row.invoice_ref === sourceConfig.currentPaymentRef);
      const sourceCustomer = customerRows.find((row) => row.customer_id === sourceConfig.sourceCustomerId);
      const lienAlert = bureauRows.find(
        (row) =>
          row.alert_type === sourceConfig.criticalAlertType &&
          row.severity === sourceConfig.criticalAlertSeverity &&
          !row.resolved
      );
      const citedDeductionRows = deductionRows.filter((deductionRow) =>
        sourceConfig.citedDeductionVerdicts.includes(deductionRow.verdict)
      );
      const lienSignal = lienAlert !== undefined;
      const disputeSpike = citedDeductionRows.length > 0;
      if (
        sourceCustomer === undefined ||
        baselinePayments.length !== sourceConfig.baselinePaymentRefs.length ||
        currentPayment === undefined ||
        !lienSignal ||
        !disputeSpike
      ) {
        return undefined;
      }

      const baselineDsoDays = average(baselinePayments.map((row) => row.days_to_pay));
      const currentDsoDays = currentPayment.days_to_pay;
      const rScoreComponentScores = sourceCustomer.r_score_component_scores_json ?? undefined;

      return {
        customerId,
        observedSignals: {
          baselineDsoDays,
          currentDsoDays,
          disputeSpike,
          lienSignal
        },
        rDriftObservations: {
          baselineDsoDays,
          currentDsoDays
        },
        ...(rScoreComponentScores === undefined ? {} : { rScoreComponentScores }),
        recordIds: dedupeRecordIds([
          customerId,
          sourceConfig.sourceCustomerId,
          ...sourceConfig.baselinePaymentRefs,
          sourceConfig.currentPaymentRef,
          lienAlert.alert_id,
          ...citedDeductionRows.flatMap((row) => [row.deduction_id, row.invoice_ref])
        ]),
        sourceNormalization: {
          missingFields:
            rScoreComponentScores === undefined
              ? [
                  "rScoreComponentScores.agingConcentration",
                  "rScoreComponentScores.disputeRate",
                  "rScoreComponentScores.dsoAdp",
                  "rScoreComponentScores.overLimitFrequency"
                ]
              : [],
          sourcePort: "SourcePort.loadRiskObservationSnapshot"
        }
      };
    }
  };
}

export function createSupabaseRiskObservationSnapshotReaderFromEnv(
  env: Partial<Pick<RuntimeEnv, "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_URL">>,
  riskCaseSources: Record<string, SupabaseRiskObservationSourceConfig>,
  fetcher?: SupabaseSyntheticSourceFetch
): SupabaseRiskObservationSnapshotReader | undefined {
  if (env.SUPABASE_URL === undefined || env.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return undefined;
  }

  return createSupabaseRiskObservationSnapshotReader({
    ...(fetcher === undefined ? {} : { fetcher }),
    riskCaseSources,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    url: env.SUPABASE_URL
  });
}

async function requestSupabaseRows(
  fetcher: SupabaseSyntheticSourceFetch,
  input: {
    baseUrl: string;
    orderBy?: string;
    serviceRoleKey: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const tableName = normalizeTableName(input.tableName);
  const url = new URL(`${input.baseUrl}/rest/v1/${tableName}`);
  url.searchParams.set("select", "*");
  if (input.orderBy !== undefined) {
    url.searchParams.set("order", input.orderBy);
  }
  url.searchParams.set("limit", "500");

  const response = await fetcher(url.href, {
    headers: serviceRoleReadHeaders(input.serviceRoleKey),
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`Supabase source read failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase source response must be an array of rows.");
  }

  return rows.map((row: unknown) => row);
}

async function requestSyntheticRows(
  fetcher: SupabaseSyntheticSourceFetch,
  input: {
    baseUrl: string;
    line: DeductionLine;
    serviceRoleKey: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const tableName = normalizeTableName(input.tableName);
  const url = new URL(`${input.baseUrl}/rest/v1/${tableName}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("customer_id", `eq.${input.line.customerId}`);
  url.searchParams.set("limit", "50");

  const response = await fetcher(url.href, {
    headers: serviceRoleReadHeaders(input.serviceRoleKey),
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`Supabase synthetic source read failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase synthetic source response must be an array of rows.");
  }

  return rows.map((row: unknown) => row);
}

async function requestSyntheticRowsForCustomers(
  fetcher: SupabaseSyntheticSourceFetch,
  input: {
    baseUrl: string;
    customerIds: readonly string[];
    serviceRoleKey: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const tableName = normalizeTableName(input.tableName);
  const url = new URL(`${input.baseUrl}/rest/v1/${tableName}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("customer_id", postgrestInFilter(input.customerIds));
  url.searchParams.set("limit", "1000");

  const response = await fetcher(url.href, {
    headers: serviceRoleReadHeaders(input.serviceRoleKey),
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`Supabase synthetic source read failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase synthetic source response must be an array of rows.");
  }

  return rows.map((row: unknown) => row);
}

async function requestCachedSyntheticRows(
  cache: Map<string, Promise<unknown[]>>,
  fetcher: SupabaseSyntheticSourceFetch,
  input: {
    baseUrl: string;
    line: DeductionLine;
    serviceRoleKey: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const cacheKey = sourceRowsCacheKey(input.tableName, input.line.customerId);
  const cachedRows = cache.get(cacheKey);
  if (cachedRows !== undefined) {
    return cachedRows;
  }

  const rowsPromise = requestSyntheticRows(fetcher, input).catch((error: unknown) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, rowsPromise);

  return rowsPromise;
}

async function requestCachedSyntheticRowsForCustomers(
  cache: Map<string, Promise<unknown[]>>,
  fetcher: SupabaseSyntheticSourceFetch,
  input: {
    baseUrl: string;
    lines: readonly DeductionLine[];
    serviceRoleKey: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const customerIds = dedupeSorted(input.lines.map((line) => line.customerId));
  if (customerIds.length === 0) {
    return [];
  }

  const cacheKey = sourceRowsCacheKey(input.tableName, customerIds.join("|"));
  const cachedRows = cache.get(cacheKey);
  if (cachedRows !== undefined) {
    return cachedRows;
  }

  const rowsPromise = requestSyntheticRowsForCustomers(fetcher, {
    baseUrl: input.baseUrl,
    customerIds,
    serviceRoleKey: input.serviceRoleKey,
    tableName: input.tableName
  }).catch((error: unknown) => {
    cache.delete(cacheKey);
    throw error;
  });
  cache.set(cacheKey, rowsPromise);

  return rowsPromise;
}

async function requestToolsDataRows(
  fetcher: SupabaseSyntheticSourceFetch,
  input: {
    baseUrl: string;
    serviceRoleKey: string;
    sourceCustomerId: string;
    tableName: string;
  }
): Promise<unknown[]> {
  const tableName = normalizeTableName(input.tableName);
  const url = new URL(`${input.baseUrl}/rest/v1/${tableName}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("customer_id", `eq.${input.sourceCustomerId}`);
  url.searchParams.set("limit", "100");

  const response = await fetcher(url.href, {
    headers: serviceRoleReadHeaders(input.serviceRoleKey),
    method: "GET"
  });

  if (!response.ok) {
    throw new Error(`Supabase Tools_data risk observation read failed with HTTP ${String(response.status)}.`);
  }

  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) {
    throw new Error("Supabase Tools_data risk observation response must be an array of rows.");
  }

  return rows.map((row: unknown) => row);
}

function mapSyntheticRow(
  connectorName: EnterpriseConnectorName,
  line: DeductionLine,
  row: unknown
): SyntheticSourceEvidence[] {
  switch (connectorName) {
    case "bureau": {
      const parsed = bureauRowSchema.parse(row);
      return [
        {
          documentId: parsed.bureau_id,
          documentType: "bureau-signal",
          freshnessRecordIds: sourceRowFreshnessRecordIds("recoup_src_bureau", parsed.bureau_id, parsed),
          provenance: "synthetic",
          recordIds: dedupeRecordIds([line.lineId, line.customerId, parsed.bureau_id]),
          source: "bureau",
          summary: `Bureau signal for ${parsed.customer_id} as of ${parsed.as_of_date}; delinquency flag ${String(parsed.delinquency_flag)}.`
        }
      ];
    }
    case "docs-repo": {
      const parsed = docsRowSchema.parse(row);
      if (!hasLineRecordOverlap(line, parsed.linked_record_ids)) {
        return [];
      }

      return [
        {
          documentId: parsed.doc_id,
          documentType: documentTypeForDocRepo(parsed.doc_type, parsed.linked_record_ids),
          freshnessRecordIds: sourceRowFreshnessRecordIds("recoup_src_docs", parsed.doc_id, parsed),
          provenance: "synthetic",
          recordIds: dedupeRecordIds([line.lineId, parsed.doc_id, ...parsed.linked_record_ids]),
          source: "docs",
          summary: `Document repository ${parsed.doc_type} record ${parsed.doc_id}.`
        }
      ];
    }
    case "edi-remittance":
    case "remittance": {
      const parsed = remittanceRowSchema.parse(row);
      if (connectorName === "edi-remittance" && parsed.transaction_set !== "812") {
        return [];
      }
      if (connectorName === "remittance" && parsed.transaction_set === "812") {
        return [];
      }

      const linkedRecordIds = [...parsed.invoice_refs, ...parsed.deduction_refs];
      if (!hasLineRecordOverlap(line, linkedRecordIds)) {
        return [];
      }

      return [
        {
          documentId: parsed.remit_id,
          documentType: connectorName === "edi-remittance" ? "edi-remittance" : "remittance-advice",
          freshnessRecordIds: sourceRowFreshnessRecordIds("recoup_src_remittance", parsed.remit_id, parsed),
          provenance: "synthetic",
          recordIds: dedupeRecordIds([line.lineId, parsed.remit_id, ...linkedRecordIds]),
          source: "remittance",
          summary: `${connectorName === "edi-remittance" ? "EDI" : "Remittance"} ${parsed.transaction_set} record ${parsed.remit_id}.`
        }
      ];
    }
    case "tpm": {
      const parsed = tpmRowSchema.parse(row);
      if (!hasLineRecordOverlap(line, parsed.claim_refs)) {
        return [];
      }

      return [
        {
          documentId: parsed.promo_id,
          documentType: "trade-promo",
          freshnessRecordIds: sourceRowFreshnessRecordIds("recoup_src_tpm", parsed.promo_id, parsed),
          provenance: "synthetic",
          recordIds: dedupeRecordIds([line.lineId, parsed.promo_id, ...parsed.claim_refs]),
          source: "tpm",
          summary: `TPM ${parsed.promo_type} approval ${parsed.promo_id}.`
        }
      ];
    }
  }
}

function mapSapSourceRow(line: DeductionLine, row: unknown): SapSourceEvidence[] {
  const parsed = sapRowSchema.parse(row);
  if (!hasLineRecordOverlap(line, parsed.linked_record_ids)) {
    return [];
  }

  return [
    {
      documentId: parsed.sap_document_id,
      documentType: parsed.document_type,
      freshnessRecordIds: sourceRowFreshnessRecordIds("recoup_src_sap", parsed.sap_document_id, parsed),
      provenance: parsed.provenance,
      recordIds: dedupeRecordIds([line.lineId, parsed.sap_document_id, ...parsed.linked_record_ids]),
      source: "sap",
      summary: parsed.summary
    }
  ];
}

function mapRowsByLine<TEvidence>(
  lines: readonly DeductionLine[],
  rows: readonly unknown[],
  mapRow: (line: DeductionLine, row: unknown) => TEvidence[]
): Map<string, TEvidence[]> {
  return new Map(
    lines.map((line) => [
      line.lineId,
      rows
        .filter((row) => sourceRowCustomerId(row) === line.customerId)
        .flatMap((row) => mapRow(line, row))
    ])
  );
}

function sourceRowCustomerId(row: unknown): string | undefined {
  if (!isJsonRecord(row)) {
    return undefined;
  }

  return typeof row.customer_id === "string" ? row.customer_id : undefined;
}

function documentTypeForDocRepo(
  docType: z.infer<typeof docsRowSchema>["doc_type"],
  linkedRecordIds: readonly string[]
): SyntheticSourceEvidenceType {
  switch (docType) {
    case "POD":
      return "POD";
    case "TPM":
      return "trade-promo";
    case "contract":
      return "contract";
    case "correspondence":
      if (linkedRecordIds.some((recordId) => recordId.startsWith("CREDIT-MEMO-") || recordId.startsWith("FIN-DISP-"))) {
        return "credit-memo";
      }

      return "correspondence";
  }
}

function hasLineRecordOverlap(line: DeductionLine, sourceRecordIds: readonly string[]): boolean {
  const lineRecordIds = new Set([line.lineId, ...line.recordIds]);

  return sourceRecordIds.some((recordId) => lineRecordIds.has(recordId));
}

function sourceRowFreshnessRecordIds(tableName: string, rowId: string, row: Record<string, unknown>): string[] {
  return [`source-row:${tableName}:${rowId}:hash:${sha256CanonicalJson(row)}`];
}

function isSapCustomerRecordId(recordId: string): boolean {
  return /^USCU_[A-Z0-9]+$/u.test(recordId);
}

function readSapPayloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const nestedPayload = payload["d"];
  if (isJsonRecord(nestedPayload) && typeof nestedPayload[key] === "string") {
    return nestedPayload[key];
  }

  return typeof payload[key] === "string" ? payload[key] : undefined;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.filter((recordId) => recordId.trim().length > 0))];
}

function dedupeSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function postgrestInFilter(values: readonly string[]): string {
  return `in.(${values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`;
}

function serviceRoleReadHeaders(serviceRoleKey: string): HeadersInit {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`
  };
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function parseJsonCell(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
}

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/+$/u, "");
}

function normalizeTableName(tableName: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(tableName)) {
    throw new Error("Supabase synthetic source table name must be a safe Postgres identifier.");
  }

  return tableName;
}

function sourceRowsCacheKey(tableName: string, customerId: string): string {
  return `${normalizeTableName(tableName)}:${customerId}`;
}

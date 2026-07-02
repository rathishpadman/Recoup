import { sha256CanonicalJson } from "../../config/governed.js";
import type { ReconciliationMode } from "../../config/reconciliationRollout.js";
import type { SourcePort } from "../adapters/source.js";
import type { ForensicsReconciliationOptions } from "../agents/forensics.js";
import type { MemoryRecord } from "../memory/schema.js";
import type { EvidenceDocument } from "../tools/retrieval/docs.js";
import type { DeductionLine } from "../types/entities.js";
import type { ServiceInvocationContext, ServiceSyntheticEvidenceConnectorName } from "./serviceLayer.js";

export type EvidenceFreshnessMode =
  | "adapter_timestamp_or_payload_hash"
  | "document_hash_and_retrieved_at"
  | "document_hash_and_valid_window"
  | "source_payload_hash";

export interface RequiredEvidenceFreshnessSource {
  documentType:
    | "bureau_alert"
    | "carrier_damage_report"
    | "carrier_photo"
    | "contract_pricing"
    | "contract_sla"
    | "customer_po"
    | "edi_812"
    | "payment_history"
    | "pod"
    | "remittance_advice"
    | "sap_credit_memo"
    | "sap_invoice"
    | "tpm_accrual"
    | "tpm_promo";
  freshnessMode: EvidenceFreshnessMode;
  sourceSystem:
    | "bureau"
    | "carrier"
    | "contract_repo"
    | "customer_po"
    | "edi"
    | "payment_history"
    | "remittance"
    | "sap_odata"
    | "three_pl"
    | "tpm";
}

export type EvidenceCacheStatus = "hit" | "miss" | "refresh" | "stale";

export const REQUIRED_EVIDENCE_FRESHNESS_SOURCES = [
  { documentType: "sap_invoice", sourceSystem: "sap_odata", freshnessMode: "adapter_timestamp_or_payload_hash" },
  { documentType: "sap_credit_memo", sourceSystem: "sap_odata", freshnessMode: "adapter_timestamp_or_payload_hash" },
  { documentType: "remittance_advice", sourceSystem: "remittance", freshnessMode: "source_payload_hash" },
  { documentType: "edi_812", sourceSystem: "edi", freshnessMode: "source_payload_hash" },
  { documentType: "pod", sourceSystem: "three_pl", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "carrier_damage_report", sourceSystem: "carrier", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "carrier_photo", sourceSystem: "carrier", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "customer_po", sourceSystem: "customer_po", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "contract_pricing", sourceSystem: "contract_repo", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "contract_sla", sourceSystem: "contract_repo", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "tpm_promo", sourceSystem: "tpm", freshnessMode: "document_hash_and_valid_window" },
  { documentType: "tpm_accrual", sourceSystem: "tpm", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "bureau_alert", sourceSystem: "bureau", freshnessMode: "document_hash_and_retrieved_at" },
  { documentType: "payment_history", sourceSystem: "payment_history", freshnessMode: "document_hash_and_retrieved_at" }
] as const satisfies readonly RequiredEvidenceFreshnessSource[];

const freshnessFingerprintVersion = "forensics-freshness:v1";
const syntheticEvidenceConnectors = ["docs-repo", "tpm", "bureau"] as const satisfies readonly ServiceSyntheticEvidenceConnectorName[];

export function buildForensicsReadModelFreshnessRecordIds(input: {
  approvalRecords?: readonly MemoryRecord[];
  canaryLines?: readonly string[];
  reconciliation?: ForensicsReconciliationOptions | undefined;
  reconciliationMode?: ReconciliationMode;
  serviceContext?: ServiceInvocationContext | undefined;
  source: SourcePort;
  sourceTableIdentity?: readonly string[];
}): string[] {
  const recordIds = new Set<string>([freshnessFingerprintVersion]);
  const reconciliationMode = input.reconciliationMode ?? input.reconciliation?.mode ?? "legacy";

  recordIds.add(`reconciliation-mode:${reconciliationMode}`);
  for (const lineId of input.canaryLines ?? []) {
    recordIds.add(`reconciliation-canary:${lineId}`);
  }
  for (const sourceTable of input.sourceTableIdentity ?? []) {
    recordIds.add(sourceTable);
    recordIds.add(`source-table:${sourceTable}`);
  }
  for (const source of REQUIRED_EVIDENCE_FRESHNESS_SOURCES) {
    recordIds.add(`freshness-source:${source.documentType}:${source.sourceSystem}:${source.freshnessMode}`);
  }

  const settlementRun = input.source.loadSettlementRun();
  for (const customer of [...settlementRun.customers].sort((left, right) => left.customerId.localeCompare(right.customerId))) {
    recordIds.add(customer.customerId);
    recordIds.add(`customer:${customer.customerId}:${sha256CanonicalJson(customer)}`);
  }
  for (const line of [...settlementRun.deductionLines].sort((left, right) => left.lineId.localeCompare(right.lineId))) {
    addLineFreshnessRecordIds(recordIds, line);
    addServiceEvidenceFreshnessRecordIds(recordIds, input.serviceContext, line);
  }

  addReceiptFreshnessRecordIds(recordIds, input.reconciliation?.receipts ?? []);
  addApprovalReceiptFreshnessRecordIds(recordIds, input.approvalRecords ?? []);
  addCanonicalEvidenceDatasetFreshnessRecordIds(recordIds, input.reconciliation?.evidenceDataset);

  return [...recordIds].sort();
}

export function isForensicsReadModelFresh(cachedRecordIds: readonly string[], currentRecordIds: readonly string[]): boolean {
  const cached = normalizeRecordIds(cachedRecordIds);
  const current = normalizeRecordIds(currentRecordIds);

  return cached.length > 0 && cached.length === current.length && cached.every((recordId, index) => recordId === current[index]);
}

function addLineFreshnessRecordIds(recordIds: Set<string>, line: DeductionLine): void {
  recordIds.add(line.lineId);
  recordIds.add(`line:${line.lineId}`);
  recordIds.add(`line:${line.lineId}:amount:${line.amount.toFixed(2)}`);
  recordIds.add(`line:${line.lineId}:event:${line.eventId}`);
  recordIds.add(`line:${line.lineId}:records:${sha256CanonicalJson([...line.recordIds].sort())}`);
  recordIds.add(`line:${line.lineId}:rule:${line.ruleId}`);
}

function addServiceEvidenceFreshnessRecordIds(
  recordIds: Set<string>,
  serviceContext: ServiceInvocationContext | undefined,
  line: DeductionLine
): void {
  if (serviceContext === undefined) {
    return;
  }

  addEvidenceDocumentRecordIds(recordIds, "sap", line, serviceContext.sapEvidenceSource?.readEvidence(line) ?? []);
  for (const connectorName of syntheticEvidenceConnectors) {
    addEvidenceDocumentRecordIds(recordIds, connectorName, line, serviceContext.syntheticEvidenceSource?.readEvidence(connectorName, line) ?? []);
  }
  addEvidenceDocumentRecordIds(recordIds, "openai-vector-store", line, serviceContext.vectorStoreEvidenceSource?.readEvidence(line) ?? []);
}

function addEvidenceDocumentRecordIds(
  recordIds: Set<string>,
  sourceLabel: string,
  line: DeductionLine,
  documents: readonly EvidenceDocument[]
): void {
  for (const document of [...documents].sort((left, right) => left.documentId.localeCompare(right.documentId))) {
    recordIds.add(document.documentId);
    for (const recordId of document.recordIds) {
      recordIds.add(recordId);
    }
    for (const freshnessRecordId of document.freshnessRecordIds ?? []) {
      recordIds.add(freshnessRecordId);
    }
    recordIds.add(`evidence:${sourceLabel}:${line.lineId}:${document.documentId}:${sha256CanonicalJson(document)}`);
  }
}

function addReceiptFreshnessRecordIds(
  recordIds: Set<string>,
  receipts: readonly NonNullable<ForensicsReconciliationOptions["receipts"]>[number][]
): void {
  const sortedReceipts = [...receipts].sort((left, right) => left.receiptId.localeCompare(right.receiptId));
  if (sortedReceipts.length === 0) {
    recordIds.add("receipt-set:absent");
    return;
  }

  recordIds.add(`receipt-set:${sha256CanonicalJson(sortedReceipts.map((receipt) => [receipt.receiptId, receipt.contentHash]))}`);
  for (const receipt of sortedReceipts) {
    recordIds.add(receipt.receiptId);
    recordIds.add(`receipt:${receipt.receiptId}:basis:${sha256CanonicalJson(receipt.deterministicBasis)}`);
    recordIds.add(`receipt:${receipt.receiptId}:confidence:${sha256CanonicalJson(receipt.confidenceFactors)}`);
    recordIds.add(`receipt:${receipt.receiptId}:content:${receipt.contentHash}`);
    recordIds.add(`receipt:${receipt.receiptId}:evidence:${sha256CanonicalJson([...receipt.evidenceIds].sort())}`);
    recordIds.add(`receipt:${receipt.receiptId}:line:${receipt.lineId}`);
  }
}

function addApprovalReceiptFreshnessRecordIds(recordIds: Set<string>, approvalRecords: readonly MemoryRecord[]): void {
  const sortedApprovalRecords = approvalRecords
    .filter((record) => record.category === "approval_records" && record.trustLevel === "trusted")
    .sort((left, right) => left.id.localeCompare(right.id));
  if (sortedApprovalRecords.length === 0) {
    recordIds.add("receipt:approval-record-set:absent");
    return;
  }

  recordIds.add("receipt:approval-record-set:present");
  recordIds.add(
    `receipt:approval-record-set:${sha256CanonicalJson(
      sortedApprovalRecords.map((record) => [
        record.id,
        record.scope,
        record.payload.actionId,
        record.payload.auditEntryHash,
        record.payload.decision,
        record.payload.status,
        [...record.recordIds].sort()
      ])
    )}`
  );
  for (const record of sortedApprovalRecords) {
    recordIds.add(
      `receipt:approval:${record.id}:${sha256CanonicalJson({
        payload: record.payload,
        recordIds: [...record.recordIds].sort(),
        scope: record.scope
      })}`
    );
  }
}

function addCanonicalEvidenceDatasetFreshnessRecordIds(
  recordIds: Set<string>,
  evidenceDataset: ForensicsReconciliationOptions["evidenceDataset"] | undefined
): void {
  if (evidenceDataset === undefined) {
    recordIds.add("evidence-dataset:absent");
    return;
  }

  const sortedDocuments = [...evidenceDataset.documents].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  recordIds.add(
    `evidence-dataset:document-set:${sha256CanonicalJson(
      sortedDocuments.map((document) => [document.evidenceId, document.contentHash, document.retrievedAt, document.sourceRecordId])
    )}`
  );
  for (const document of sortedDocuments) {
    recordIds.add(document.evidenceId);
    recordIds.add(document.sourceRecordId);
    recordIds.add(`evidence-dataset:${document.evidenceId}:content:${document.contentHash}`);
    recordIds.add(`evidence-dataset:${document.evidenceId}:provenance:${document.provenance}`);
    recordIds.add(`evidence-dataset:${document.evidenceId}:retrieved:${document.retrievedAt}`);
    recordIds.add(`evidence-dataset:${document.evidenceId}:source:${document.sourceSystem}:${document.sourceRecordId}`);
    recordIds.add(`evidence-dataset:${document.evidenceId}:type:${document.documentType}`);
    if (document.storageUri !== undefined) {
      recordIds.add(`evidence-dataset:${document.evidenceId}:storage:${document.storageUri}`);
    }
    if (document.validFrom !== undefined || document.validTo !== undefined) {
      recordIds.add(`evidence-dataset:${document.evidenceId}:validity:${document.validFrom ?? ""}:${document.validTo ?? ""}`);
    }
  }

  const sortedLinks = [...evidenceDataset.links].sort((left, right) =>
    [left.evidenceId, left.recordRole, left.recordId].join("\u001F").localeCompare([right.evidenceId, right.recordRole, right.recordId].join("\u001F"))
  );
  recordIds.add(`evidence-dataset:link-set:${sha256CanonicalJson(sortedLinks)}`);
}

function normalizeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))].sort();
}

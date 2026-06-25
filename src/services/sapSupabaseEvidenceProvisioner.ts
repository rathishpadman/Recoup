import type { DeductionLine } from "../types/entities.js";
import {
  mapSapODataReadResultToEvidence,
  type SapODataMetadataInput,
  type SapODataReadOnlyAdapter,
  type SapODataReadRequest
} from "../adapters/sapOData.js";

export interface SapSupabaseEvidenceSourceLink {
  customerId: string;
  invoiceRef: string;
  lineId: string;
  sapCustomerId: string;
  sourceName: string;
  sourceRecordIds: readonly string[];
}

export interface SapSupabaseEvidenceRow {
  customer_id: string;
  document_type: "credit-memo" | "invoice";
  entity_set: string;
  linked_record_ids: string[];
  payload_json: Record<string, unknown>;
  provenance: "sap-odata";
  retrieved_at: string;
  sap_document_id: string;
  service_name: string;
  summary: string;
}

export type SapSupabaseEvidenceDiagnosticCode =
  | "missing-explicit-source-link"
  | "sap-read-empty-result"
  | "sap-read-failed"
  | "sap-read-plan-empty"
  | "sap-read-plan-unconfigured"
  | "sap-read-payload-customer-mismatch"
  | "sap-read-payload-document-mismatch"
  | "sap-read-unsupported-purpose"
  | "sap-read-unsupported-row"
  | "source-link-customer-mismatch"
  | "source-link-line-not-found"
  | "source-link-nonnumeric-invoice-ref";

export interface SapSupabaseEvidenceDiagnostic {
  code: SapSupabaseEvidenceDiagnosticCode;
  invoiceRef?: string;
  lineId: string;
  message: string;
  sourceName?: string;
}

export interface SapSupabaseEvidenceFetchClient {
  fetchReadRequest(request: SapODataReadRequest): Promise<unknown>;
}

export interface BuildSapSupabaseEvidenceRowsInput {
  adapter: Pick<SapODataReadOnlyAdapter, "buildMetadataValidatedReadRequestPlan">;
  client: SapSupabaseEvidenceFetchClient;
  lines: readonly DeductionLine[];
  metadata: SapODataMetadataInput;
  retrievedAt: Date | string;
  sourceLinks: readonly SapSupabaseEvidenceSourceLink[];
}

export interface BuildSapSupabaseEvidenceRowsResult {
  diagnostics: SapSupabaseEvidenceDiagnostic[];
  rows: SapSupabaseEvidenceRow[];
}

export interface CompleteSapSupabaseEvidenceProvisioningInput extends BuildSapSupabaseEvidenceRowsResult {
  lines: readonly DeductionLine[];
}

const invoiceRecordPrefix = "INV-";

const sapRowSourceByPurpose: Partial<Record<SapODataReadRequest["purpose"], { entitySet: string; serviceName: string }>> = {
  "billing-document": {
    entitySet: "C_BillingDocumentFs",
    serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
  },
  "billing-document-items": {
    entitySet: "C_BillingDocumentItemFs",
    serviceName: "ZUI_BILLINGDOCUMENTFS_0001"
  }
};

export async function buildSapSupabaseEvidenceRows(
  input: BuildSapSupabaseEvidenceRowsInput
): Promise<BuildSapSupabaseEvidenceRowsResult> {
  const diagnostics: SapSupabaseEvidenceDiagnostic[] = [];
  const rows: SapSupabaseEvidenceRow[] = [];
  const linesById = new Map(input.lines.map((line) => [line.lineId, line]));
  const sourceLinksByLineId = groupLinksByLineId(input.sourceLinks);
  const retrievedAt = normalizeRetrievedAt(input.retrievedAt);

  for (const link of input.sourceLinks) {
    if (!linesById.has(link.lineId)) {
      diagnostics.push({
        code: "source-link-line-not-found",
        invoiceRef: link.invoiceRef,
        lineId: link.lineId,
        message: "SAP source link does not match a deduction line.",
        sourceName: link.sourceName
      });
    }
  }

  for (const line of input.lines) {
    const links = sourceLinksByLineId.get(line.lineId) ?? [];
    if (links.length === 0) {
      diagnostics.push({
        code: "missing-explicit-source-link",
        lineId: line.lineId,
        message: "No explicit SAP source link was provided for deduction line."
      });
      continue;
    }

    for (const link of links) {
      if (link.customerId !== line.customerId) {
        diagnostics.push({
          code: "source-link-customer-mismatch",
          invoiceRef: link.invoiceRef,
          lineId: line.lineId,
          message: "SAP source link customer does not match deduction line customer.",
          sourceName: link.sourceName
        });
        continue;
      }

      if (!isNumericInvoiceRef(link.invoiceRef)) {
        diagnostics.push({
          code: "source-link-nonnumeric-invoice-ref",
          invoiceRef: link.invoiceRef,
          lineId: line.lineId,
          message: "SAP source link invoiceRef is not numeric; no SAP read was planned.",
          sourceName: link.sourceName
        });
        continue;
      }

      const invoiceRecordId = `${invoiceRecordPrefix}${link.invoiceRef}`;
      const planLine: DeductionLine = {
        ...line,
        recordIds: uniqueStrings([...line.recordIds, invoiceRecordId])
      };
      const plan = input.adapter.buildMetadataValidatedReadRequestPlan(planLine, input.metadata);
      if (!plan.configured) {
        diagnostics.push({
          code: "sap-read-plan-unconfigured",
          invoiceRef: link.invoiceRef,
          lineId: line.lineId,
          message: plan.reason,
          sourceName: link.sourceName
        });
        continue;
      }
      if (plan.requests.length === 0) {
        diagnostics.push({
          code: "sap-read-plan-empty",
          invoiceRef: link.invoiceRef,
          lineId: line.lineId,
          message: "SAP read plan did not include a metadata-validated request.",
          sourceName: link.sourceName
        });
        continue;
      }

      const linkedRecordIds = uniqueStrings([
        line.lineId,
        ...line.recordIds,
        invoiceRecordId,
        link.sapCustomerId,
        `SOURCE:${link.sourceName}`,
        ...link.sourceRecordIds
      ]);
      for (const request of plan.requests) {
        const source = sapRowSourceByPurpose[request.purpose];
        if (source === undefined) {
          diagnostics.push({
            code: "sap-read-unsupported-purpose",
            invoiceRef: link.invoiceRef,
            lineId: line.lineId,
            message: `SAP OData ${request.purpose} cannot be stored in recoup_src_sap.`,
            sourceName: link.sourceName
          });
          continue;
        }

        let payload: unknown;
        try {
          payload = await input.client.fetchReadRequest(request);
        } catch (error) {
          diagnostics.push({
            code: "sap-read-failed",
            invoiceRef: link.invoiceRef,
            lineId: line.lineId,
            message: error instanceof Error ? error.message : "SAP OData read failed.",
            sourceName: link.sourceName
          });
          continue;
        }

        const mismatch = validateSapPayloadMatchesSourceLink(request, payload, link, line.lineId);
        if (mismatch !== undefined) {
          diagnostics.push(mismatch);
          continue;
        }

        const evidence = mapSapODataReadResultToEvidence(request, payload);
        if (evidence === undefined) {
          diagnostics.push({
            code: "sap-read-empty-result",
            invoiceRef: link.invoiceRef,
            lineId: line.lineId,
            message: `SAP OData ${request.purpose} returned no evidence row.`,
            sourceName: link.sourceName
          });
          continue;
        }
        if (!isRecord(payload) || (evidence.documentType !== "invoice" && evidence.documentType !== "credit-memo")) {
          diagnostics.push({
            code: "sap-read-unsupported-row",
            invoiceRef: link.invoiceRef,
            lineId: line.lineId,
            message: `SAP OData ${request.purpose} returned a row that cannot be stored in recoup_src_sap.`,
            sourceName: link.sourceName
          });
          continue;
        }

        mergeSapEvidenceRow(rows, {
          customer_id: line.customerId,
          document_type: evidence.documentType,
          entity_set: source.entitySet,
          linked_record_ids: linkedRecordIds,
          payload_json: payload,
          provenance: "sap-odata",
          retrieved_at: retrievedAt,
          sap_document_id: `SAP-${evidence.documentId}`,
          service_name: source.serviceName,
          summary: evidence.summary
        });
      }
    }
  }

  return { diagnostics, rows };
}

export function assertCompleteSapSupabaseEvidenceProvisioning(
  input: CompleteSapSupabaseEvidenceProvisioningInput
): void {
  if (input.diagnostics.length > 0) {
    const lineIds = uniqueStrings(input.diagnostics.map((diagnostic) => diagnostic.lineId));
    throw new Error(`SAP OData provisioning failed closed with diagnostics for line ${lineIds.join(", ")}.`);
  }

  const uncoveredLineIds = input.lines
    .filter((line) => !input.rows.some((row) => row.linked_record_ids.includes(line.lineId)))
    .map((line) => line.lineId);
  if (uncoveredLineIds.length > 0) {
    throw new Error(`SAP OData provisioning missing recoup_src_sap coverage for line ${uncoveredLineIds.join(", ")}.`);
  }
}

function groupLinksByLineId(
  links: readonly SapSupabaseEvidenceSourceLink[]
): Map<string, SapSupabaseEvidenceSourceLink[]> {
  const grouped = new Map<string, SapSupabaseEvidenceSourceLink[]>();
  for (const link of links) {
    const existing = grouped.get(link.lineId) ?? [];
    existing.push(link);
    grouped.set(link.lineId, existing);
  }

  return grouped;
}

function isNumericInvoiceRef(invoiceRef: string): boolean {
  return /^\d+$/u.test(invoiceRef);
}

function normalizeRetrievedAt(retrievedAt: Date | string): string {
  return retrievedAt instanceof Date ? retrievedAt.toISOString() : retrievedAt;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function mergeSapEvidenceRow(rows: SapSupabaseEvidenceRow[], row: SapSupabaseEvidenceRow): void {
  const existing = rows.find((candidate) => candidate.sap_document_id === row.sap_document_id);
  if (existing === undefined) {
    rows.push(row);
    return;
  }

  existing.linked_record_ids = uniqueStrings([...existing.linked_record_ids, ...row.linked_record_ids]);
}

function validateSapPayloadMatchesSourceLink(
  request: SapODataReadRequest,
  payload: unknown,
  link: SapSupabaseEvidenceSourceLink,
  lineId: string
): SapSupabaseEvidenceDiagnostic | undefined {
  if (request.purpose === "billing-document") {
    const record = unwrapSapODataRecord(payload);
    if (record["BillingDocument"] !== link.invoiceRef) {
      return sapPayloadMismatchDiagnostic(
        "sap-read-payload-document-mismatch",
        request.purpose,
        "SAP OData billing-document payload did not match the approved invoice reference.",
        link,
        lineId
      );
    }
    if (record["SoldToParty"] !== link.sapCustomerId) {
      return sapPayloadMismatchDiagnostic(
        "sap-read-payload-customer-mismatch",
        request.purpose,
        "SAP OData billing-document payload did not match the approved SAP customer.",
        link,
        lineId
      );
    }
  }

  if (request.purpose === "billing-document-items") {
    const records = unwrapSapODataResultRecords(payload);
    if (records.length === 0) {
      return undefined;
    }
    if (records.some((record) => record["BillingDocument"] !== link.invoiceRef)) {
      return sapPayloadMismatchDiagnostic(
        "sap-read-payload-document-mismatch",
        request.purpose,
        "SAP OData billing-document-items payload did not match the approved invoice reference.",
        link,
        lineId
      );
    }
    if (
      records.some(
        (record) => typeof record["SoldToParty"] === "string" && record["SoldToParty"] !== link.sapCustomerId
      )
    ) {
      return sapPayloadMismatchDiagnostic(
        "sap-read-payload-customer-mismatch",
        request.purpose,
        "SAP OData billing-document-items payload did not match the approved SAP customer.",
        link,
        lineId
      );
    }
  }

  return undefined;
}

function sapPayloadMismatchDiagnostic(
  code: Extract<
    SapSupabaseEvidenceDiagnosticCode,
    "sap-read-payload-customer-mismatch" | "sap-read-payload-document-mismatch"
  >,
  purpose: SapODataReadRequest["purpose"],
  message: string,
  link: SapSupabaseEvidenceSourceLink,
  lineId: string
): SapSupabaseEvidenceDiagnostic {
  void purpose;

  return {
    code,
    invoiceRef: link.invoiceRef,
    lineId,
    message,
    sourceName: link.sourceName
  };
}

function unwrapSapODataRecord(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  const d = payload["d"];
  return isRecord(d) ? d : payload;
}

function unwrapSapODataResultRecords(payload: unknown): Array<Record<string, unknown>> {
  if (!isRecord(payload) || !isRecord(payload["d"]) || !Array.isArray(payload["d"]["results"])) {
    return [];
  }

  return payload["d"]["results"].filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

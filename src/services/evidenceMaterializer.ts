import { buildSyntheticDataset } from "../adapters/syntheticData.js";
import { DeductionClaimSchema, type DeductionClaim } from "../types/claims.js";
import {
  CanonicalEvidenceDocumentSchema,
  EvidenceLinkSchema,
  evidenceContentHash,
  type CanonicalEvidenceDocument,
  type EvidenceDocumentType,
  type EvidenceLink,
  type EvidenceProvenance,
  type EvidenceSourceSystem
} from "../types/evidence.js";

export interface MaterializeRealEvidenceDatasetInput {
  retrievedAt: string;
}

export interface RealEvidenceDataset {
  claims: DeductionClaim[];
  documents: CanonicalEvidenceDocument[];
  links: EvidenceLink[];
}

interface EvidenceDocumentDraft {
  customerId: string;
  documentType: EvidenceDocumentType;
  evidenceId: string;
  invoiceRef: string;
  lineId: string;
  payload: Record<string, unknown>;
  provenance: EvidenceProvenance;
  retrievedAt: string;
  sourceRecordId: string;
  sourceSystem: EvidenceSourceSystem;
  storageUri?: string;
  validFrom?: string;
  validTo?: string;
}

export function materializeRealEvidenceDataset(input: MaterializeRealEvidenceDatasetInput): RealEvidenceDataset {
  const syntheticDataset = buildSyntheticDataset({ seed: 42 });
  const documents: CanonicalEvidenceDocument[] = [];
  const links: EvidenceLink[] = [];
  const claims = syntheticDataset.deductionLines.map((line) => {
    const invoiceRef = `INV-${line.lineId}`;
    const reasonCode = reasonCodeForRule(line.ruleId);
    const claim = DeductionClaimSchema.parse({
      claimAmount: line.amount.toFixed(2),
      claimId: `CLAIM-${line.lineId}`,
      customerId: line.customerId,
      invoiceRef,
      lineId: line.lineId,
      reasonCode,
      recordIds: [line.lineId, invoiceRef, `EVD-REMIT-${line.lineId}`],
      remittanceEvidenceId: `EVD-REMIT-${line.lineId}`
    });

    for (const document of documentsForLine({
      amount: line.amount.toFixed(2),
      customerId: line.customerId,
      invoiceRef,
      lineId: line.lineId,
      reasonCode,
      retrievedAt: input.retrievedAt,
      ruleId: line.ruleId
    })) {
      documents.push(document);
      links.push(...linksForDocument(document, claim));
    }

    return claim;
  });

  return { claims, documents, links };
}

function documentsForLine(input: {
  amount: string;
  customerId: string;
  invoiceRef: string;
  lineId: string;
  reasonCode: string;
  retrievedAt: string;
  ruleId: string;
}): CanonicalEvidenceDocument[] {
  const documents = [
    makeDocument({
      ...input,
      documentType: "sap_invoice",
      evidenceId: `EVD-SAP-INVOICE-${input.lineId}`,
      payload: {
        billedAmount: input.amount,
        customerId: input.customerId,
        entitySet: "C_BillingDocumentFs",
        invoiceRef: input.invoiceRef,
        lineId: input.lineId,
        serviceName: "ZUI_BILLINGDOCUMENTFS_0001",
        sourceMode: "generated-sap-shaped-fallback"
      },
      provenance: "source_generated",
      sourceRecordId: input.invoiceRef,
      sourceSystem: "sap_odata",
      storageUri: generatedEvidenceStorageUri(`EVD-SAP-INVOICE-${input.lineId}`)
    }),
    makeDocument({
      ...input,
      documentType: "remittance_advice",
      evidenceId: `EVD-REMIT-${input.lineId}`,
      payload: {
        claimAmount: input.amount,
        deductionRef: `DED-${input.lineId}`,
        invoiceRef: input.invoiceRef,
        lineId: input.lineId,
        reasonCode: input.reasonCode,
        transactionSet: "820"
      },
      provenance: "source_generated",
      sourceRecordId: `REMIT-${input.lineId}`,
      sourceSystem: "remittance",
      storageUri: generatedEvidenceStorageUri(`EVD-REMIT-${input.lineId}`)
    }),
    makeDocument({
      ...input,
      documentType: "bureau_alert",
      evidenceId: `EVD-BUREAU-${input.lineId}`,
      payload: {
        alertType: input.customerId === "CUST-HARBOR" ? "distress-signal" : "normal-monitoring",
        customerId: input.customerId,
        lineId: input.lineId,
        riskScore: input.customerId === "CUST-HARBOR" ? 71 : 25
      },
      provenance: "source_generated",
      sourceRecordId: `BUREAU-${input.customerId}`,
      sourceSystem: "bureau"
    }),
    makeDocument({
      ...input,
      documentType: "payment_history",
      evidenceId: `EVD-PAYMENT-HISTORY-${input.lineId}`,
      payload: {
        customerId: input.customerId,
        daysToPayTrailing90: input.customerId === "CUST-HARBOR" ? 72 : 31,
        invoiceRef: input.invoiceRef,
        lineId: input.lineId,
        openDeductionAmount: input.amount
      },
      provenance: "source_generated",
      sourceRecordId: `PAYMENT-HISTORY-${input.customerId}`,
      sourceSystem: "payment_history"
    })
  ];

  return [...documents, ...scenarioSpecificDocuments(input)];
}

function scenarioSpecificDocuments(input: {
  amount: string;
  customerId: string;
  invoiceRef: string;
  lineId: string;
  retrievedAt: string;
  ruleId: string;
}): CanonicalEvidenceDocument[] {
  switch (input.ruleId) {
    case "damage-evidence-valid":
      return [
        makeDocument({
          ...input,
          documentType: "carrier_damage_report",
          evidenceId: `EVD-CARRIER-REPORT-${input.lineId}`,
          payload: {
            damagedGoodsAmount: input.amount,
            invoiceRef: input.invoiceRef,
            lineId: input.lineId,
            reportStatus: "VERIFIED",
            salvageCreditAmount: "0.00"
          },
          provenance: "source_generated",
          sourceRecordId: `CARRIER-REPORT-${input.lineId}`,
          sourceSystem: "carrier"
        }),
        makeDocument({
          ...input,
          documentType: "carrier_photo",
          evidenceId: `EVD-CARRIER-PHOTO-${input.lineId}`,
          payload: {
            invoiceRef: input.invoiceRef,
            lineId: input.lineId,
            photoEvidenceReceived: true,
            photoSetId: `PHOTO-${input.lineId}`
          },
          provenance: "source_generated",
          sourceRecordId: `CARRIER-PHOTO-${input.lineId}`,
          sourceSystem: "carrier"
        })
      ];
    case "promo-not-captured":
      return tpmDocuments(input, input.amount, "0.00", "active-promo-billed-at-list");
    case "shortage-pod-mismatch":
      return [podDocument(input, true, "100", "100")];
    case "otif-fine-valid":
      return [contractSlaDocument(input, true, input.amount), podDocument(input, false, "100", "96")];
    case "otif-timestamp-mismatch":
      return [contractSlaDocument(input, true, input.amount), podDocument(input, true, "100", "100")];
    case "pricing-below-contract":
      return [
        makeDocument({
          ...input,
          documentType: "customer_po",
          evidenceId: `EVD-CUSTOMER-PO-${input.lineId}`,
          payload: {
            actualPaidAmount: "0.00",
            deliveredQuantity: "1",
            invoiceRef: input.invoiceRef,
            lineId: input.lineId,
            poUnitPrice: "0.00"
          },
          provenance: "source_generated",
          sourceRecordId: `PO-${input.lineId}`,
          sourceSystem: "customer_po"
        }),
        makeDocument({
          ...input,
          documentType: "contract_pricing",
          evidenceId: `EVD-CONTRACT-PRICING-${input.lineId}`,
          payload: {
            contractPriceAvailable: true,
            contractedUnitPrice: input.amount,
            invoiceRef: input.invoiceRef,
            lineId: input.lineId
          },
          provenance: "source_generated",
          sourceRecordId: `CONTRACT-PRICE-${input.lineId}`,
          sourceSystem: "contract_repo"
        })
      ];
    case "promo-overclaim":
      return tpmDocuments(input, "0.00", input.amount, "approved-accrual-exceeded");
    case "duplicate-credit":
      return [
        makeDocument({
          ...input,
          documentType: "sap_credit_memo",
          evidenceId: `EVD-SAP-CREDIT-MEMO-${input.lineId}`,
          payload: {
            alreadyCredited: true,
            creditMemoAmount: input.amount,
            invoiceRef: input.invoiceRef,
            lineId: input.lineId,
            sourceMode: "generated-sap-shaped-fallback"
          },
          provenance: "source_generated",
          sourceRecordId: `CREDIT-MEMO-${input.lineId}`,
          sourceSystem: "sap_odata"
        })
      ];
    default:
      throw new Error(`Unsupported evidence materialization rule: ${input.ruleId}`);
  }
}

function tpmDocuments(
  input: { amount: string; customerId: string; invoiceRef: string; lineId: string; retrievedAt: string },
  approvedAccrual: string,
  claimedAllowance: string,
  status: string
): CanonicalEvidenceDocument[] {
  return [
    makeDocument({
      ...input,
      documentType: "tpm_promo",
      evidenceId: `EVD-TPM-PROMO-${input.lineId}`,
      payload: {
        approvedPromoExists: true,
        customerId: input.customerId,
        invoiceBilledAtList: true,
        invoiceRef: input.invoiceRef,
        lineId: input.lineId,
        promoStatus: status
      },
      provenance: "source_generated",
      sourceRecordId: `TPM-PROMO-${input.lineId}`,
      sourceSystem: "tpm"
    }),
    makeDocument({
      ...input,
      documentType: "tpm_accrual",
      evidenceId: `EVD-TPM-ACCRUAL-${input.lineId}`,
      payload: {
        approvedAccrual,
        approvedAccrualExceeded: claimedAllowance !== "0.00",
        capturedPromoCredit: claimedAllowance === "0.00" ? "0.00" : undefined,
        claimedAllowance,
        invoiceRef: input.invoiceRef,
        lineId: input.lineId
      },
      provenance: "source_generated",
      sourceRecordId: `TPM-ACCRUAL-${input.lineId}`,
      sourceSystem: "tpm"
    })
  ];
}

function contractSlaDocument(
  input: { amount: string; customerId: string; invoiceRef: string; lineId: string; retrievedAt: string },
  contractSlaAllowsFine: boolean,
  allowedFineAmount: string
): CanonicalEvidenceDocument {
  return makeDocument({
    ...input,
    documentType: "contract_sla",
    evidenceId: `EVD-CONTRACT-SLA-${input.lineId}`,
    payload: {
      allowedFineAmount,
      contractSlaAllowsFine,
      invoiceRef: input.invoiceRef,
      lineId: input.lineId,
      slaBreachConfirmed: true
    },
    provenance: "source_generated",
    sourceRecordId: `CONTRACT-SLA-${input.lineId}`,
    sourceSystem: "contract_repo"
  });
}

function podDocument(
  input: { amount: string; customerId: string; invoiceRef: string; lineId: string; retrievedAt: string },
  podSignedFullDelivery: boolean,
  deliveredQuantity: string,
  signedQuantity: string
): CanonicalEvidenceDocument {
  return makeDocument({
    ...input,
    documentType: "pod",
    evidenceId: `EVD-POD-${input.lineId}`,
    payload: {
      deliveredQuantity,
      invoiceRef: input.invoiceRef,
      lineId: input.lineId,
      podSignedFullDelivery,
      signedQuantity
    },
    provenance: "source_generated",
    sourceRecordId: `POD-${input.lineId}`,
    sourceSystem: "three_pl",
    storageUri: generatedEvidenceStorageUri(`EVD-POD-${input.lineId}`)
  });
}

function generatedEvidenceStorageUri(evidenceId: string): string {
  return `supabase://recoup_evidence_documents/${evidenceId}`;
}

function makeDocument(input: EvidenceDocumentDraft): CanonicalEvidenceDocument {
  const payload = stripUndefined(input.payload);

  return CanonicalEvidenceDocumentSchema.parse({
    contentHash: evidenceContentHash(payload),
    customerId: input.customerId,
    documentType: input.documentType,
    evidenceId: input.evidenceId,
    payload,
    provenance: input.provenance,
    retrievedAt: input.retrievedAt,
    sourceRecordId: input.sourceRecordId,
    sourceSystem: input.sourceSystem,
    ...(input.storageUri === undefined ? {} : { storageUri: input.storageUri }),
    ...(input.validFrom === undefined ? {} : { validFrom: input.validFrom }),
    ...(input.validTo === undefined ? {} : { validTo: input.validTo })
  });
}

function linksForDocument(document: CanonicalEvidenceDocument, claim: DeductionClaim): EvidenceLink[] {
  return [
    EvidenceLinkSchema.parse({
      evidenceId: document.evidenceId,
      recordId: claim.lineId,
      recordRole: "deduction_line"
    }),
    EvidenceLinkSchema.parse({
      evidenceId: document.evidenceId,
      recordId: claim.claimId,
      recordRole: "claim"
    }),
    EvidenceLinkSchema.parse({
      evidenceId: document.evidenceId,
      recordId: claim.customerId,
      recordRole: "customer"
    }),
    EvidenceLinkSchema.parse({
      evidenceId: document.evidenceId,
      recordId: claim.invoiceRef,
      recordRole: "invoice"
    }),
    EvidenceLinkSchema.parse({
      evidenceId: document.evidenceId,
      recordId: document.sourceRecordId,
      recordRole: "source_record"
    })
  ];
}

function reasonCodeForRule(ruleId: string): string {
  switch (ruleId) {
    case "damage-evidence-valid":
      return "DAMAGE";
    case "promo-not-captured":
    case "promo-overclaim":
      return "PROMO";
    case "shortage-pod-mismatch":
      return "SHORTAGE";
    case "otif-fine-valid":
    case "otif-timestamp-mismatch":
      return "OTIF";
    case "pricing-below-contract":
      return "PRICING";
    case "duplicate-credit":
      return "DUPLICATE_CREDIT";
    default:
      throw new Error(`Unsupported claim reason rule: ${ruleId}`);
  }
}

function stripUndefined(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

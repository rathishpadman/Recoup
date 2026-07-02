import { createHash } from "node:crypto";
import {
  evaluateRule,
  type DamageEvidenceValidInput,
  type DuplicateCreditInput,
  type OtifFineValidInput,
  type OtifTimestampMismatchInput,
  type PricingBelowContractInput,
  type PromoNotCapturedInput,
  type PromoOverclaimInput,
  type RuleFinding,
  type RuleId,
  type RuleInput,
  type ShortagePodMismatchInput
} from "../core/rules/index.js";
import type { DeductionClaim } from "../types/claims.js";
import {
  canonicalEvidenceJson,
  type CanonicalEvidenceDocument,
  type EvidenceDocumentType
} from "../types/evidence.js";
import { money, type Money } from "../types/money.js";

export interface ReconcileDeductionClaimInput {
  claim: DeductionClaim;
  documents: CanonicalEvidenceDocument[];
}

export interface SerializableRuleInput {
  [key: string]: unknown;
  claimedAmount: string;
  lineId: string;
  period: string;
  recordIds: string[];
  ruleId: RuleId;
}

export interface ReconciliationReceipt {
  claimId: string;
  confidenceFactors: Record<string, unknown>;
  contentHash: string;
  derivedRuleInput: SerializableRuleInput;
  deterministicBasis: Record<string, unknown>;
  evidenceIds: string[];
  lineId: string;
  receiptId: string;
  ruleId: RuleId;
}

interface CandidateRule {
  comparisonValues: Record<string, unknown>;
  fieldEvidence: Record<string, string[]>;
  input: RuleInput;
  sourceDocuments: CanonicalEvidenceDocument[];
}

interface ClaimEvidenceContext {
  claim: DeductionClaim;
  documents: CanonicalEvidenceDocument[];
  lineId: string;
  period: string;
  remittance: CanonicalEvidenceDocument;
}

export function reconcileDeductionClaim(input: ReconcileDeductionClaimInput): ReconciliationReceipt {
  const context = buildClaimEvidenceContext(input.claim, input.documents);
  const candidate = deriveCandidateRule(context);
  const finding = evaluateRule(candidate.input.ruleId, candidate.input);

  if (finding === undefined) {
    throw new Error(`Unable to derive reconciliation rule for ${context.lineId} from evidence documents.`);
  }

  return buildReceipt(context.claim, candidate, finding);
}

function buildClaimEvidenceContext(claim: DeductionClaim, documents: CanonicalEvidenceDocument[]): ClaimEvidenceContext {
  const matchingDocuments = documents
    .filter((document) => payloadString(document, "lineId") === claim.lineId && document.customerId === claim.customerId)
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const remittance = findOne(matchingDocuments, "remittance_advice");

  if (remittance === undefined) {
    throw new Error(`Missing required remittance_advice evidence for ${claim.lineId}.`);
  }

  return {
    claim,
    documents: matchingDocuments,
    lineId: claim.lineId,
    period: remittance.retrievedAt.slice(0, 7),
    remittance
  };
}

function deriveCandidateRule(context: ClaimEvidenceContext): CandidateRule {
  const creditMemo = findOne(context.documents, "sap_credit_memo");
  if (creditMemo !== undefined) {
    return deriveDuplicateCredit(context, creditMemo);
  }

  const customerPo = findOne(context.documents, "customer_po");
  const contractPricing = findOne(context.documents, "contract_pricing");
  if (customerPo !== undefined && contractPricing !== undefined) {
    const sapInvoice = findRequired(context, "sap_invoice");
    return derivePricingBelowContract(context, customerPo, contractPricing, sapInvoice);
  }

  const promo = findOne(context.documents, "tpm_promo");
  const accrual = findOne(context.documents, "tpm_accrual");
  if (promo !== undefined && accrual !== undefined) {
    if (payloadBoolean(accrual, "approvedAccrualExceeded")) {
      const bureau = findRequired(context, "bureau_alert");
      const paymentHistory = findRequired(context, "payment_history");
      return derivePromoOverclaim(context, promo, accrual, bureau, paymentHistory);
    }

    return derivePromoNotCaptured(context, promo, accrual);
  }

  const contractSla = findOne(context.documents, "contract_sla");
  const pod = findOne(context.documents, "pod");
  if (contractSla !== undefined && pod !== undefined) {
    return payloadBoolean(pod, "podSignedFullDelivery")
      ? deriveOtifTimestampMismatch(context, contractSla, pod)
      : deriveOtifFineValid(context, contractSla, pod);
  }

  if (payloadString(context.remittance, "reasonCode") === "SHORTAGE") {
    if (pod === undefined) {
      throw new Error(`Missing required pod evidence for ${context.lineId}.`);
    }
    return deriveShortagePodMismatch(context, pod);
  }

  const carrierReport = findOne(context.documents, "carrier_damage_report");
  const carrierPhoto = findOne(context.documents, "carrier_photo");
  if (carrierReport !== undefined && carrierPhoto !== undefined) {
    return deriveDamageEvidenceValid(context, carrierReport, carrierPhoto);
  }

  throw missingRequiredEvidenceForReason(context, {
    accrual,
    carrierPhoto,
    carrierReport,
    contractPricing,
    contractSla,
    creditMemo,
    customerPo,
    pod,
    promo
  });
}

function missingRequiredEvidenceForReason(
  context: ClaimEvidenceContext,
  available: {
    accrual: CanonicalEvidenceDocument | undefined;
    carrierPhoto: CanonicalEvidenceDocument | undefined;
    carrierReport: CanonicalEvidenceDocument | undefined;
    contractPricing: CanonicalEvidenceDocument | undefined;
    contractSla: CanonicalEvidenceDocument | undefined;
    creditMemo: CanonicalEvidenceDocument | undefined;
    customerPo: CanonicalEvidenceDocument | undefined;
    pod: CanonicalEvidenceDocument | undefined;
    promo: CanonicalEvidenceDocument | undefined;
  }
): Error {
  switch (payloadString(context.remittance, "reasonCode")) {
    case "DAMAGE":
      if (available.carrierReport === undefined) {
        return new Error(`Missing required carrier_damage_report evidence for ${context.lineId}.`);
      }
      if (available.carrierPhoto === undefined) {
        return new Error(`Missing required carrier_photo evidence for ${context.lineId}.`);
      }
      break;
    case "DUPLICATE_CREDIT":
      if (available.creditMemo === undefined) {
        return new Error(`Missing required sap_credit_memo evidence for ${context.lineId}.`);
      }
      break;
    case "OTIF":
      if (available.contractSla === undefined) {
        return new Error(`Missing required contract_sla evidence for ${context.lineId}.`);
      }
      if (available.pod === undefined) {
        return new Error(`Missing required pod evidence for ${context.lineId}.`);
      }
      break;
    case "PRICING":
      if (available.customerPo === undefined) {
        return new Error(`Missing required customer_po evidence for ${context.lineId}.`);
      }
      if (available.contractPricing === undefined) {
        return new Error(`Missing required contract_pricing evidence for ${context.lineId}.`);
      }
      break;
    case "PROMO":
      if (available.promo === undefined) {
        return new Error(`Missing required tpm_promo evidence for ${context.lineId}.`);
      }
      if (available.accrual === undefined) {
        return new Error(`Missing required tpm_accrual evidence for ${context.lineId}.`);
      }
      break;
  }

  throw new Error(`Unable to derive reconciliation rule for ${context.lineId} from evidence documents.`);
}

function deriveDamageEvidenceValid(
  context: ClaimEvidenceContext,
  report: CanonicalEvidenceDocument,
  photo: CanonicalEvidenceDocument
): CandidateRule {
  const input: DamageEvidenceValidInput = {
    ...baseRuleInput(context, "damage-evidence-valid", [report, photo]),
    carrierReportReceived: payloadString(report, "reportStatus") === "VERIFIED",
    damagedGoodsAmount: payloadMoney(report, "damagedGoodsAmount"),
    photoEvidenceReceived: payloadBoolean(photo, "photoEvidenceReceived"),
    salvageCreditAmount: payloadMoney(report, "salvageCreditAmount")
  };

  return candidate(input, [context.remittance, report, photo], {
    carrierReportReceived: [report.evidenceId],
    damagedGoodsAmount: [report.evidenceId],
    photoEvidenceReceived: [photo.evidenceId],
    salvageCreditAmount: [report.evidenceId]
  });
}

function derivePromoNotCaptured(
  context: ClaimEvidenceContext,
  promo: CanonicalEvidenceDocument,
  accrual: CanonicalEvidenceDocument
): CandidateRule {
  const input: PromoNotCapturedInput = {
    ...baseRuleInput(context, "promo-not-captured", [promo, accrual]),
    approvedPromoAccrual: payloadMoney(accrual, "approvedAccrual"),
    approvedPromoExists: payloadBoolean(promo, "approvedPromoExists"),
    capturedPromoCredit: payloadMoney(accrual, "capturedPromoCredit"),
    invoiceBilledAtList: payloadBoolean(promo, "invoiceBilledAtList")
  };

  return candidate(input, [context.remittance, promo, accrual], {
    approvedPromoAccrual: [accrual.evidenceId],
    approvedPromoExists: [promo.evidenceId],
    capturedPromoCredit: [accrual.evidenceId],
    invoiceBilledAtList: [promo.evidenceId]
  });
}

function deriveShortagePodMismatch(context: ClaimEvidenceContext, pod: CanonicalEvidenceDocument): CandidateRule {
  const input: ShortagePodMismatchInput = {
    ...baseRuleInput(context, "shortage-pod-mismatch", [pod]),
    allowedShortageAmount: money("0.00"),
    claimedShortage: payloadString(context.remittance, "reasonCode") === "SHORTAGE",
    podSignedFullDelivery: payloadBoolean(pod, "podSignedFullDelivery")
  };

  return candidate(input, [context.remittance, pod], {
    allowedShortageAmount: [context.remittance.evidenceId],
    claimedShortage: [context.remittance.evidenceId],
    podSignedFullDelivery: [pod.evidenceId]
  });
}

function deriveOtifFineValid(
  context: ClaimEvidenceContext,
  contractSla: CanonicalEvidenceDocument,
  pod: CanonicalEvidenceDocument
): CandidateRule {
  const input: OtifFineValidInput = {
    ...baseRuleInput(context, "otif-fine-valid", [contractSla, pod]),
    allowedFineAmount: payloadMoney(contractSla, "allowedFineAmount"),
    contractSlaAllowsFine: payloadBoolean(contractSla, "contractSlaAllowsFine"),
    slaBreachConfirmed: payloadBoolean(contractSla, "slaBreachConfirmed")
  };

  return candidate(input, [context.remittance, contractSla, pod], {
    allowedFineAmount: [contractSla.evidenceId],
    contractSlaAllowsFine: [contractSla.evidenceId],
    slaBreachConfirmed: [contractSla.evidenceId, pod.evidenceId]
  });
}

function deriveOtifTimestampMismatch(
  context: ClaimEvidenceContext,
  contractSla: CanonicalEvidenceDocument,
  pod: CanonicalEvidenceDocument
): CandidateRule {
  const input: OtifTimestampMismatchInput = {
    ...baseRuleInput(context, "otif-timestamp-mismatch", [contractSla, pod]),
    allowedFineAmount: money("0.00"),
    otifFineAssessed: payloadString(context.remittance, "reasonCode") === "OTIF",
    podTimestampOnTime: payloadBoolean(pod, "podSignedFullDelivery")
  };

  return candidate(input, [context.remittance, contractSla, pod], {
    allowedFineAmount: [pod.evidenceId],
    otifFineAssessed: [context.remittance.evidenceId],
    podTimestampOnTime: [pod.evidenceId]
  });
}

function derivePricingBelowContract(
  context: ClaimEvidenceContext,
  customerPo: CanonicalEvidenceDocument,
  contractPricing: CanonicalEvidenceDocument,
  sapInvoice: CanonicalEvidenceDocument
): CandidateRule {
  const contractedUnitPrice = payloadMoney(contractPricing, "contractedUnitPrice");
  const deliveredQuantity = requiredPayloadString(customerPo, "deliveredQuantity");
  const actualPaidAmount = payloadMoney(customerPo, "actualPaidAmount");
  const sapInvoiceBilledAmount = payloadMoney(sapInvoice, "billedAmount");
  const input: PricingBelowContractInput = {
    ...baseRuleInput(context, "pricing-below-contract", [customerPo, contractPricing, sapInvoice]),
    actualPaidAmount,
    contractPriceAvailable: payloadBoolean(contractPricing, "contractPriceAvailable"),
    contractedUnitPrice,
    deductedBelowContractPrice: actualPaidAmount.lessThan(contractedUnitPrice.times(deliveredQuantity)),
    deliveredQuantity
  };

  return candidate(input, [context.remittance, customerPo, contractPricing, sapInvoice], {
    actualPaidAmount: [customerPo.evidenceId],
    contractPriceAvailable: [contractPricing.evidenceId],
    contractedUnitPrice: [contractPricing.evidenceId],
    deductedBelowContractPrice: [customerPo.evidenceId, contractPricing.evidenceId, sapInvoice.evidenceId],
    deliveredQuantity: [customerPo.evidenceId],
    sapInvoiceBilledAmount: [sapInvoice.evidenceId]
  }, {
    actualPaidAmount: actualPaidAmount.toFixed(2),
    contractedUnitPrice: contractedUnitPrice.toFixed(2),
    deliveredQuantity,
    expectedContractAmount: contractedUnitPrice.times(deliveredQuantity).toFixed(2),
    sapInvoiceBilledAmount: sapInvoiceBilledAmount.toFixed(2)
  });
}

function derivePromoOverclaim(
  context: ClaimEvidenceContext,
  promo: CanonicalEvidenceDocument,
  accrual: CanonicalEvidenceDocument,
  bureau: CanonicalEvidenceDocument,
  paymentHistory: CanonicalEvidenceDocument
): CandidateRule {
  const sourceDocuments = [context.remittance, promo, accrual, bureau, paymentHistory];
  const approvedAccrual = payloadMoney(accrual, "approvedAccrual");
  const claimedAllowance = payloadMoney(accrual, "claimedAllowance");
  const input: PromoOverclaimInput = {
    ...baseRuleInput(context, "promo-overclaim", sourceDocuments),
    approvedAccrual,
    approvedAccrualExceeded: payloadBoolean(accrual, "approvedAccrualExceeded"),
    claimedAllowance
  };

  return candidate(input, sourceDocuments, {
    approvedAccrual: [accrual.evidenceId],
    approvedAccrualExceeded: [accrual.evidenceId],
    claimedAllowance: [accrual.evidenceId],
    customerRiskContext: [bureau.evidenceId, paymentHistory.evidenceId]
  }, {
    approvedAccrual: approvedAccrual.toFixed(2),
    bureauRiskScore: payloadNumber(bureau, "riskScore"),
    claimedAllowance: claimedAllowance.toFixed(2),
    daysToPayTrailing90: payloadNumber(paymentHistory, "daysToPayTrailing90"),
    openDeductionAmount: requiredPayloadString(paymentHistory, "openDeductionAmount")
  });
}

function deriveDuplicateCredit(context: ClaimEvidenceContext, creditMemo: CanonicalEvidenceDocument): CandidateRule {
  const input: DuplicateCreditInput = {
    ...baseRuleInput(context, "duplicate-credit", [creditMemo]),
    alreadyCredited: payloadBoolean(creditMemo, "alreadyCredited"),
    priorCreditAmount: payloadMoney(creditMemo, "creditMemoAmount")
  };

  return candidate(input, [context.remittance, creditMemo], {
    alreadyCredited: [creditMemo.evidenceId],
    priorCreditAmount: [creditMemo.evidenceId]
  });
}

function baseRuleInput<T extends RuleId>(
  context: ClaimEvidenceContext,
  ruleId: T,
  sourceDocuments: CanonicalEvidenceDocument[]
) {
  const evidenceIds = uniqueEvidenceIds([context.remittance, ...sourceDocuments]);

  return {
    claimedAmount: payloadMoney(context.remittance, "claimAmount"),
    lineId: context.lineId,
    period: context.period,
    recordIds: [context.claim.claimId, context.claim.lineId, ...evidenceIds],
    ruleId
  };
}

function candidate(
  input: RuleInput,
  sourceDocuments: CanonicalEvidenceDocument[],
  fieldEvidence: Record<string, string[]>,
  comparisonValues: Record<string, unknown> = {}
): CandidateRule {
  return {
    comparisonValues,
    fieldEvidence,
    input,
    sourceDocuments: dedupeDocuments(sourceDocuments)
  };
}

function buildReceipt(claim: DeductionClaim, candidateRule: CandidateRule, finding: RuleFinding): ReconciliationReceipt {
  const sourceDocuments = candidateRule.sourceDocuments;
  const evidenceIds = uniqueEvidenceIds(sourceDocuments);
  const derivedRuleInput = serializeRuleInput(candidateRule.input);
  const deterministicBasis = {
    comparisonValues: candidateRule.comparisonValues,
    comparedEvidenceIds: evidenceIds,
    deltaAmount: finding.deltaAmount.toFixed(2),
    inputFieldEvidence: candidateRule.fieldEvidence,
    ruleBasis: finding.basis,
    sourceDocumentTypes: [...new Set(sourceDocuments.map((document) => document.documentType))].sort(),
    sourceRecordIdsByEvidenceId: Object.fromEntries(
      sourceDocuments.map((document) => [document.evidenceId, document.sourceRecordId])
    )
  };
  const confidenceFactors = {
    allRequiredEvidencePresent: true,
    evidenceCount: sourceDocuments.length,
    provenanceByEvidenceId: Object.fromEntries(
      sourceDocuments.map((document) => [document.evidenceId, document.provenance])
    ),
    retrievedAtByEvidenceId: Object.fromEntries(
      sourceDocuments.map((document) => [document.evidenceId, document.retrievedAt])
    ),
    sourceSystems: [...new Set(sourceDocuments.map((document) => document.sourceSystem))].sort()
  };
  const receiptWithoutHash = {
    claimId: claim.claimId,
    confidenceFactors,
    derivedRuleInput,
    deterministicBasis,
    evidenceIds,
    lineId: claim.lineId,
    receiptId: `RECON-${claim.lineId}`,
    ruleId: candidateRule.input.ruleId
  };

  return {
    ...receiptWithoutHash,
    contentHash: sha256Canonical(receiptWithoutHash)
  };
}

function serializeRuleInput(input: RuleInput): SerializableRuleInput {
  const base = {
    claimedAmount: input.claimedAmount.toFixed(2),
    lineId: input.lineId,
    period: input.period,
    recordIds: input.recordIds,
    ruleId: input.ruleId
  };

  switch (input.ruleId) {
    case "damage-evidence-valid":
      return {
        ...base,
        carrierReportReceived: input.carrierReportReceived,
        damagedGoodsAmount: moneyString(input.damagedGoodsAmount),
        photoEvidenceReceived: input.photoEvidenceReceived,
        salvageCreditAmount: moneyString(input.salvageCreditAmount)
      };
    case "promo-not-captured":
      return {
        ...base,
        approvedPromoAccrual: moneyString(input.approvedPromoAccrual),
        approvedPromoExists: input.approvedPromoExists,
        capturedPromoCredit: moneyString(input.capturedPromoCredit),
        invoiceBilledAtList: input.invoiceBilledAtList
      };
    case "shortage-pod-mismatch":
      return {
        ...base,
        allowedShortageAmount: moneyString(input.allowedShortageAmount),
        claimedShortage: input.claimedShortage,
        podSignedFullDelivery: input.podSignedFullDelivery
      };
    case "otif-fine-valid":
      return {
        ...base,
        allowedFineAmount: moneyString(input.allowedFineAmount),
        contractSlaAllowsFine: input.contractSlaAllowsFine,
        slaBreachConfirmed: input.slaBreachConfirmed
      };
    case "otif-timestamp-mismatch":
      return {
        ...base,
        allowedFineAmount: moneyString(input.allowedFineAmount),
        otifFineAssessed: input.otifFineAssessed,
        podTimestampOnTime: input.podTimestampOnTime
      };
    case "pricing-below-contract":
      return {
        ...base,
        actualPaidAmount: moneyString(input.actualPaidAmount),
        contractPriceAvailable: input.contractPriceAvailable,
        contractedUnitPrice: moneyString(input.contractedUnitPrice),
        deductedBelowContractPrice: input.deductedBelowContractPrice,
        deliveredQuantity: input.deliveredQuantity
      };
    case "promo-overclaim":
      return {
        ...base,
        approvedAccrual: moneyString(input.approvedAccrual),
        approvedAccrualExceeded: input.approvedAccrualExceeded,
        claimedAllowance: moneyString(input.claimedAllowance)
      };
    case "duplicate-credit":
      return {
        ...base,
        alreadyCredited: input.alreadyCredited,
        priorCreditAmount: moneyString(input.priorCreditAmount)
      };
  }
}

function findOne(
  documents: CanonicalEvidenceDocument[],
  documentType: EvidenceDocumentType
): CanonicalEvidenceDocument | undefined {
  return documents.find((document) => document.documentType === documentType);
}

function findRequired(context: ClaimEvidenceContext, documentType: EvidenceDocumentType): CanonicalEvidenceDocument {
  const document = findOne(context.documents, documentType);
  if (document === undefined) {
    throw new Error(`Missing required ${documentType} evidence for ${context.lineId}.`);
  }
  return document;
}

function payloadString(document: CanonicalEvidenceDocument, fieldName: string): string | undefined {
  const value = document.payload[fieldName];
  return typeof value === "string" ? value : undefined;
}

function requiredPayloadString(document: CanonicalEvidenceDocument, fieldName: string): string {
  const value = payloadString(document, fieldName);
  if (value === undefined) {
    throw new Error(`Evidence ${document.evidenceId} missing string field ${fieldName}.`);
  }
  return value;
}

function payloadBoolean(document: CanonicalEvidenceDocument, fieldName: string): boolean {
  const value = document.payload[fieldName];
  if (typeof value !== "boolean") {
    throw new Error(`Evidence ${document.evidenceId} missing boolean field ${fieldName}.`);
  }
  return value;
}

function payloadMoney(document: CanonicalEvidenceDocument, fieldName: string): Money {
  const value = payloadString(document, fieldName);
  if (value === undefined) {
    throw new Error(`Evidence ${document.evidenceId} missing money field ${fieldName}.`);
  }
  return money(value);
}

function payloadNumber(document: CanonicalEvidenceDocument, fieldName: string): number {
  const value = document.payload[fieldName];
  if (typeof value !== "number") {
    throw new Error(`Evidence ${document.evidenceId} missing number field ${fieldName}.`);
  }
  return value;
}

function uniqueEvidenceIds(documents: CanonicalEvidenceDocument[]): string[] {
  return [...new Set(documents.map((document) => document.evidenceId))].sort();
}

function dedupeDocuments(documents: CanonicalEvidenceDocument[]): CanonicalEvidenceDocument[] {
  const byEvidenceId = new Map(documents.map((document) => [document.evidenceId, document]));
  return [...byEvidenceId.values()].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function moneyString(value: Money | undefined): string {
  if (value === undefined) {
    throw new Error("Derived rule input is missing a required money value.");
  }
  return value.toFixed(2);
}

function sha256Canonical(value: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalEvidenceJson(value)).digest("hex");
}

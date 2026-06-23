import type { DeductionDecisionGuardInput } from "./explainability.js";

export function assertDeductionEvidencePack(decision: DeductionDecisionGuardInput): void {
  const requiresSupportingDocuments =
    decision.routing === "recovery" || decision.verdict === "invalid" || decision.verdict === "partial";

  if (requiresSupportingDocuments && decision.evidenceDocumentIds.length === 0) {
    throw new Error("Invalid or partial deduction decisions require supporting documents.");
  }

  if (!requiresSupportingDocuments) {
    return;
  }

  const supportDocs = decision.evidenceDocuments ?? [];
  const hasReferencedSupport = supportDocs.some((document) => {
    const requiredType = requiredDocumentTypeByRule[decision.deterministicBasis.ruleId];
    return decision.evidenceDocumentIds.includes(document.documentId) && document.documentType === requiredType;
  });

  if (!hasReferencedSupport) {
    throw new Error("Invalid or partial deduction decisions require the rule-specific support document.");
  }
}

const requiredDocumentTypeByRule = {
  "damage-evidence-valid": "carrier-report",
  "promo-not-captured": "trade-promo",
  "shortage-pod-mismatch": "POD",
  "otif-fine-valid": "contract",
  "otif-timestamp-mismatch": "POD",
  "pricing-below-contract": "contract",
  "promo-overclaim": "trade-promo",
  "duplicate-credit": "credit-memo"
} as const;

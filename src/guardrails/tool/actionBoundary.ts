import { assertDeductionEvidencePack } from "./evidencePack.js";
import { assertDecisionExplainability, type DeductionDecisionGuardInput } from "./explainability.js";

export function assertRecoveryActionDecision(decision: DeductionDecisionGuardInput): void {
  assertDecisionExplainability(decision);
  if (decision.routing !== "recovery") {
    throw new Error("Recovery actions require recovery-routed deduction decisions.");
  }
  assertRecoverySupportingDocuments(decision);
  assertDeductionEvidencePack(decision);
}

export function assertBillingActionDecision(decision: DeductionDecisionGuardInput): void {
  assertDecisionExplainability(decision);
  if (decision.routing !== "billing") {
    throw new Error("Billing actions require billing-routed deduction decisions.");
  }
  assertDeductionEvidencePack(decision);
}

function assertRecoverySupportingDocuments(decision: DeductionDecisionGuardInput): void {
  const supportDocs = decision.evidenceDocuments ?? [];
  const supportDocIds = new Set(supportDocs.map((document) => document.documentId));
  if (
    decision.evidenceDocumentIds.length === 0 ||
    !decision.evidenceDocumentIds.every((documentId) => supportDocIds.has(documentId))
  ) {
    throw new Error("Recovery actions require referenced supporting documents.");
  }
}

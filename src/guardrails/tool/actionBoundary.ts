import { assertDeductionEvidencePack } from "./evidencePack.js";
import { assertDecisionExplainability, type DeductionDecisionGuardInput } from "./explainability.js";
import { throwGuardrailTrip } from "../trip.js";

export function assertRecoveryActionDecision(decision: DeductionDecisionGuardInput): void {
  assertDecisionExplainability(decision);
  if (decision.routing !== "recovery") {
    throwGuardrailTrip({
      guardrailName: "recovery-action-boundary",
      reason: "Recovery actions require recovery-routed deduction decisions.",
      recordIds: decision.recordIds
    });
  }
  assertRecoverySupportingDocuments(decision);
  assertDeductionEvidencePack(decision);
}

export function assertBillingActionDecision(decision: DeductionDecisionGuardInput): void {
  assertDecisionExplainability(decision);
  if (decision.routing !== "billing") {
    throwGuardrailTrip({
      guardrailName: "billing-action-boundary",
      reason: "Billing actions require billing-routed deduction decisions.",
      recordIds: decision.recordIds
    });
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
    throwGuardrailTrip({
      guardrailName: "recovery-action-boundary",
      reason: "Recovery actions require referenced supporting documents.",
      recordIds: decision.recordIds
    });
  }
}

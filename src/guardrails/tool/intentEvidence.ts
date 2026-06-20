export interface IntentEvidenceGuardInput {
  customerId: string;
  intentLabel: string;
  recordIds: string[];
  behavioralEvidenceIds?: string[];
  deterministicBasis?: {
    rScoreComponents?: Record<string, unknown> | undefined;
    [key: string]: unknown;
  };
}

const governedIntentLabels = new Set(["gaming", "high-risk-intent"]);

export function assertIntentEvidence(decision: IntentEvidenceGuardInput): void {
  if (!governedIntentLabels.has(decision.intentLabel)) {
    return;
  }

  const rScoreComponents = decision.deterministicBasis?.rScoreComponents;

  if (
    decision.recordIds.length === 0 ||
    decision.behavioralEvidenceIds === undefined ||
    decision.behavioralEvidenceIds.length === 0 ||
    rScoreComponents === undefined ||
    Object.keys(rScoreComponents).length === 0
  ) {
    throw new Error("Gaming intent labels require cited behavioral evidence and R-score components.");
  }
}

import { assertDeductionEvidencePack } from "../tool/evidencePack.js";
import { assertDecisionExplainability, type DeductionDecisionGuardInput } from "../tool/explainability.js";
import { assertIntentEvidence, type IntentEvidenceGuardInput } from "../tool/intentEvidence.js";
import {
  assertNoWrongfulContainment,
  type NoWrongfulContainmentGuardInput
} from "../tool/noWrongfulContainment.js";

export interface FinalAgentOutputGuardInput {
  deductionDecisions?: DeductionDecisionGuardInput[];
  intentDecisions?: IntentEvidenceGuardInput[];
  containmentDecisions?: NoWrongfulContainmentGuardInput[];
}

export function assertFinalAgentOutput(output: FinalAgentOutputGuardInput): void {
  for (const decision of output.deductionDecisions ?? []) {
    assertDecisionExplainability(decision);
    assertDeductionEvidencePack(decision);
  }

  for (const decision of output.intentDecisions ?? []) {
    assertIntentEvidence(decision);
  }

  for (const decision of output.containmentDecisions ?? []) {
    assertNoWrongfulContainment(decision);
  }
}

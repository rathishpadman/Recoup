import { Decimal } from "decimal.js";
import type { DeductionRouting, DeductionVerdict } from "../../types/entities.js";
import type { Money } from "../../types/money.js";
import { ruleIds, type RuleId } from "../../core/rules/types.js";
import type { EvidenceDocument } from "../../tools/retrieval/docs.js";

export interface DeductionDecisionGuardInput {
  decisionId: string;
  lineId: string;
  verdict: DeductionVerdict;
  routing: DeductionRouting;
  recordIds: string[];
  basis: string;
  deterministicBasis: {
    ruleId: RuleId;
    computedDeltaAmount: Money;
    amountSource: string;
  };
  evidenceDocumentIds: string[];
  evidenceDocuments?: EvidenceDocument[];
  producedBy: string;
  modelId: string;
  confidence: "blocked: decision-confidence-threshold unset";
}

export function assertDecisionExplainability(decision: DeductionDecisionGuardInput): void {
  if (decision.recordIds.length === 0 || decision.basis.trim().length === 0) {
    throw new Error("Decision requires cited recordIds and deterministic basis.");
  }

  if (
    decision.deterministicBasis.amountSource !== "core-rule-delta" ||
    !ruleIds.includes(decision.deterministicBasis.ruleId) ||
    !(decision.deterministicBasis.computedDeltaAmount instanceof Decimal)
  ) {
    throw new Error("Decision requires cited recordIds and deterministic basis.");
  }
}

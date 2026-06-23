import { evaluateRule, type RuleFinding, type RuleInput, type RuleId } from "../core/rules/index.js";
import type { DeductionRouting, DeductionVerdict } from "../types/entities.js";
import {
  CoreRuleInputSchema,
  DeductionDecisionToolInputSchema,
  type DecisionConfidenceAssessment,
  type DeductionDecisionToolOutput
} from "../types/decision.js";
import { assertDecisionExplainability } from "../guardrails/tool/explainability.js";
import { assertDeductionEvidencePack } from "../guardrails/tool/evidencePack.js";

export {
  CoreRuleInputSchema,
  DeductionDecisionGuardInputSchema,
  DeductionDecisionToolInputSchema,
  type DeductionDecisionToolInput,
  type DeductionDecisionToolOutput
} from "../types/decision.js";

export function evaluateCoreRule(input: unknown): RuleFinding {
  const parsed = CoreRuleInputSchema.parse(input) as RuleInput;
  const finding = evaluateRule(parsed.ruleId, parsed);
  if (finding === undefined) {
    throw new Error(`No deterministic finding for canonical line ${parsed.lineId}.`);
  }

  return finding;
}

export function buildDeductionDecision(input: unknown): DeductionDecisionToolOutput {
  const parsed = DeductionDecisionToolInputSchema.parse(input);
  if (parsed.ruleId !== parsed.finding.ruleId) {
    throw new Error("Decision ruleId must match finding ruleId.");
  }

  const verdict = verdictForRule(parsed.ruleId);
  const decision: DeductionDecisionToolOutput = {
    decisionId: `deduction-decision:${parsed.lineId}`,
    lineId: parsed.lineId,
    verdict,
    routing: routingForVerdict(verdict),
    recordIds: uniqueRecordIds([
      ...parsed.finding.recordIds,
      ...parsed.evidenceDocuments.flatMap((document) => [document.documentId, ...document.recordIds])
    ]),
    basis: parsed.finding.basis,
    deterministicBasis: {
      ruleId: parsed.finding.ruleId,
      computedDeltaAmount: parsed.finding.deltaAmount,
      amountSource: "core-rule-delta"
    },
    evidenceDocumentIds: parsed.evidenceDocuments.map((document) => document.documentId),
    evidenceDocuments: parsed.evidenceDocuments,
    producedBy: parsed.producedBy,
    modelId: parsed.modelId,
    confidence: buildDecisionConfidence(parsed)
  };

  assertDecisionExplainability(decision);
  assertDeductionEvidencePack(decision);

  return decision;
}

function buildDecisionConfidence(
  parsed: ReturnType<typeof DeductionDecisionToolInputSchema.parse>
): "blocked: decision-confidence-threshold unset" | DecisionConfidenceAssessment {
  if (parsed.decisionConfidenceThreshold === undefined) {
    return "blocked: decision-confidence-threshold unset";
  }

  const evidenceCompleteness = computeEvidenceCompleteness(parsed.ruleId, parsed.evidenceDocuments);
  const sourceAgreement = computeSourceAgreement(parsed.evidenceDocuments);
  const ruleMatchStrength = computeRuleMatchStrength(parsed.finding);
  const score = evidenceCompleteness * 0.4 + sourceAgreement * 0.3 + ruleMatchStrength * 0.3;
  const threshold = parsed.decisionConfidenceThreshold.threshold;

  return {
    deterministicBasis: {
      evidenceCompleteness: toScoreString(evidenceCompleteness),
      formula: "0.40*evidenceCompleteness + 0.30*sourceAgreement + 0.30*ruleMatchStrength",
      ruleMatchStrength: toScoreString(ruleMatchStrength),
      scoreSource: "deterministic-decision-confidence",
      sourceAgreement: toScoreString(sourceAgreement),
      thresholdSource: "recoup_config.decision_confidence_threshold"
    },
    route: score >= threshold ? "standard_draft_stage" : "enhanced_human_review",
    score: toScoreString(score),
    threshold: toScoreString(threshold)
  };
}

function computeEvidenceCompleteness(
  ruleId: RuleId,
  evidenceDocuments: ReturnType<typeof DeductionDecisionToolInputSchema.parse>["evidenceDocuments"]
): number {
  const requiredTypes = requiredEvidenceTypesByRule[ruleId];
  const presentTypes = new Set(evidenceDocuments.map((document) => document.documentType));
  const presentCount = requiredTypes.filter((documentType) => presentTypes.has(documentType)).length;

  return presentCount / requiredTypes.length;
}

function computeSourceAgreement(
  evidenceDocuments: ReturnType<typeof DeductionDecisionToolInputSchema.parse>["evidenceDocuments"]
): number {
  return new Set(evidenceDocuments.map((document) => document.source)).size >= 2 ? 1 : 0;
}

function computeRuleMatchStrength(finding: ReturnType<typeof DeductionDecisionToolInputSchema.parse>["finding"]): number {
  return finding.eventId.trim().length > 0 && finding.deltaAmount.greaterThanOrEqualTo(0) ? 1 : 0;
}

function toScoreString(value: number): string {
  return value.toFixed(4);
}

const requiredEvidenceTypesByRule = {
  "damage-evidence-valid": ["carrier-report"],
  "promo-not-captured": ["trade-promo"],
  "shortage-pod-mismatch": ["POD"],
  "otif-fine-valid": ["contract"],
  "otif-timestamp-mismatch": ["POD"],
  "pricing-below-contract": ["contract"],
  "promo-overclaim": ["trade-promo"],
  "duplicate-credit": ["credit-memo"]
} satisfies Record<RuleId, Array<ReturnType<typeof DeductionDecisionToolInputSchema.parse>["evidenceDocuments"][number]["documentType"]>>;

function uniqueRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds)];
}

function verdictForRule(ruleId: RuleId): DeductionVerdict {
  switch (ruleId) {
    case "damage-evidence-valid":
    case "promo-not-captured":
    case "otif-fine-valid":
      return "valid";
    case "promo-overclaim":
      return "partial";
    case "shortage-pod-mismatch":
    case "otif-timestamp-mismatch":
    case "pricing-below-contract":
    case "duplicate-credit":
      return "invalid";
  }
}

function routingForVerdict(verdict: DeductionVerdict): DeductionRouting {
  return verdict === "valid" ? "billing" : "recovery";
}

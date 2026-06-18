import type { DeductionDecisionGuardInput } from "../guardrails/tool/explainability.js";

const decisionsById = new Map<string, DeductionDecisionGuardInput>();

export function clearDecisionStore(): void {
  decisionsById.clear();
}

export function registerDecision(decision: DeductionDecisionGuardInput): void {
  decisionsById.set(decision.decisionId, decision);
}

export function getDecisionOrThrow(decisionId: string): DeductionDecisionGuardInput {
  const decision = decisionsById.get(decisionId);
  if (decision === undefined) {
    throw new Error(`Decision not found: ${decisionId}`);
  }

  return decision;
}

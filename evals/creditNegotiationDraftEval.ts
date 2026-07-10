import { sha256CanonicalJson } from "../config/governed.js";
import {
  parseCreditNegotiationDraftStructures,
  priceAgentDraftedDealStructures,
  type PriceAgentDraftedDealStructuresInput
} from "../src/services/creditNegotiationDrafts.js";
import type { DealOptimizerModel } from "../src/services/dealOptimizer.js";

export type CreditNegotiationDraftEvalStatus = "fail" | "pass";

export interface CreditNegotiationDraftEvalCase {
  allowedCitationRecordIds: readonly string[];
  caseId: string;
  citedRecordIds: readonly string[];
  equivalenceGroup?: string;
  expectEngineRejection?: boolean;
  prompt: string;
  rawModelOutput: unknown;
}

export interface CreditNegotiationDraftEvalInput {
  cases: readonly CreditNegotiationDraftEvalCase[];
  pricingContext: Omit<PriceAgentDraftedDealStructuresInput, "drafts">;
}

export interface CreditNegotiationDraftEvalCaseResult {
  caseId: string;
  checks: {
    citationScope: CreditNegotiationDraftEvalStatus;
    downstreamDeterminism?: CreditNegotiationDraftEvalStatus;
    engineRejection?: CreditNegotiationDraftEvalStatus;
    grammarAdherence: CreditNegotiationDraftEvalStatus;
    noDollarLeakage: CreditNegotiationDraftEvalStatus;
  };
  equivalenceGroup?: string;
  failures: string[];
  pricedSignature?: string;
  prompt: string;
  rawModelOutputSuppressed: true;
  status: CreditNegotiationDraftEvalStatus;
}

export interface CreditNegotiationDraftEvalReport {
  caseResults: CreditNegotiationDraftEvalCaseResult[];
  status: CreditNegotiationDraftEvalStatus;
  summary: {
    deterministicGroupsChecked: number;
    failedCases: number;
    passedCases: number;
    totalCases: number;
  };
}

const forbiddenModelDollarKeyPattern =
  /(?:amount|dollar|price|objective|objectiveValue|revenue|cost|loss|expectedDefaultLoss|holdingCost|costOfCapital|ev)$/iu;
const forbiddenModelDollarTextPattern = /\$|\b(?:usd|dollars?)\b/iu;

export function evaluateCreditNegotiationDraftEval(input: CreditNegotiationDraftEvalInput): CreditNegotiationDraftEvalReport {
  const mutableResults = input.cases.map((evalCase) => evaluateCase(evalCase, input.pricingContext));
  applyDownstreamDeterminismChecks(mutableResults);

  const caseResults = mutableResults.map(finalizeCaseResult);
  const passedCases = caseResults.filter((result) => result.status === "pass").length;
  const deterministicGroupsChecked = new Set(
    caseResults
      .filter((result) => result.equivalenceGroup !== undefined && result.checks.downstreamDeterminism === "pass")
      .map((result) => result.equivalenceGroup)
  ).size;

  return {
    caseResults,
    status: passedCases === caseResults.length ? "pass" : "fail",
    summary: {
      deterministicGroupsChecked,
      failedCases: caseResults.length - passedCases,
      passedCases,
      totalCases: caseResults.length
    }
  };
}

interface MutableEvalCaseResult {
  caseId: string;
  checks: {
    citationScope: CreditNegotiationDraftEvalStatus;
    downstreamDeterminism?: CreditNegotiationDraftEvalStatus;
    engineRejection?: CreditNegotiationDraftEvalStatus;
    grammarAdherence: CreditNegotiationDraftEvalStatus;
    noDollarLeakage: CreditNegotiationDraftEvalStatus;
  };
  equivalenceGroup?: string;
  failures: string[];
  pricedSignature?: string;
  prompt: string;
  rawModelOutputSuppressed: true;
}

function evaluateCase(
  evalCase: CreditNegotiationDraftEvalCase,
  pricingContext: Omit<PriceAgentDraftedDealStructuresInput, "drafts">
): MutableEvalCaseResult {
  const failures: string[] = [];
  const checks: MutableEvalCaseResult["checks"] = {
    citationScope: "pass",
    grammarAdherence: "fail",
    noDollarLeakage: "pass"
  };

  if (containsForbiddenModelDollarValue(evalCase.rawModelOutput)) {
    checks.noDollarLeakage = "fail";
    failures.push("raw model output included a forbidden dollar, price, cost, or objective field");
  }

  const outsideCitations = evalCase.citedRecordIds.filter((recordId) => !evalCase.allowedCitationRecordIds.includes(recordId));
  if (evalCase.citedRecordIds.length === 0) {
    checks.citationScope = "fail";
    failures.push("model narration did not cite selected credit/source/evidence record IDs");
  } else if (outsideCitations.length > 0) {
    checks.citationScope = "fail";
    failures.push(`citations included record IDs outside the selected evidence packet: ${outsideCitations.join(", ")}`);
  }

  let pricedSignature: string | undefined;
  if (checks.noDollarLeakage === "pass") {
    try {
      const drafts = parseCreditNegotiationDraftStructures(evalCase.rawModelOutput);
      checks.grammarAdherence = "pass";
      const model = priceAgentDraftedDealStructures({
        ...pricingContext,
        drafts
      });
      pricedSignature = pricedModelSignature(model);
      const engineRejectionCheck = evaluateEngineRejection(evalCase, model);
      if (engineRejectionCheck !== undefined) {
        checks.engineRejection = engineRejectionCheck.status;
        if (engineRejectionCheck.failure !== undefined) {
          failures.push(engineRejectionCheck.failure);
        }
      }
    } catch (error) {
      checks.grammarAdherence = "fail";
      failures.push(`grammar schema rejected model output: ${toErrorMessage(error)}`);
    }
  }

  return {
    caseId: evalCase.caseId,
    checks,
    ...(evalCase.equivalenceGroup === undefined ? {} : { equivalenceGroup: evalCase.equivalenceGroup }),
    failures,
    ...(pricedSignature === undefined ? {} : { pricedSignature }),
    prompt: evalCase.prompt,
    rawModelOutputSuppressed: true
  };
}

function applyDownstreamDeterminismChecks(results: MutableEvalCaseResult[]): void {
  const groupedResults = new Map<string, MutableEvalCaseResult[]>();
  for (const result of results) {
    if (result.equivalenceGroup === undefined) {
      continue;
    }
    const group = groupedResults.get(result.equivalenceGroup) ?? [];
    group.push(result);
    groupedResults.set(result.equivalenceGroup, group);
  }

  for (const [groupName, group] of groupedResults.entries()) {
    const signatures = new Set(group.map((result) => result.pricedSignature).filter((signature): signature is string => signature !== undefined));
    const failure =
      group.length < 5
        ? `equivalence group ${groupName} included ${group.length.toString()} phrasing cases; expected at least 5`
        : signatures.size === 1
          ? undefined
          : `equivalence group ${groupName} produced non-deterministic priced rankings`;

    for (const result of group) {
      result.checks.downstreamDeterminism = failure === undefined ? "pass" : "fail";
      if (failure !== undefined) {
        result.failures.push(failure);
      }
    }
  }
}

function finalizeCaseResult(result: MutableEvalCaseResult): CreditNegotiationDraftEvalCaseResult {
  const status = Object.values(result.checks).every((check) => check === "pass") && result.failures.length === 0 ? "pass" : "fail";
  return {
    ...result,
    status
  };
}

function evaluateEngineRejection(
  evalCase: CreditNegotiationDraftEvalCase,
  model: DealOptimizerModel
): { failure?: string; status: CreditNegotiationDraftEvalStatus } | undefined {
  if (evalCase.expectEngineRejection === undefined) {
    return undefined;
  }

  const rejected = model.rejectedCandidates.length > 0 && model.rankedCandidates.length === 0;
  if (evalCase.expectEngineRejection === rejected) {
    return { status: "pass" };
  }

  return {
    failure: evalCase.expectEngineRejection
      ? "engine accepted a draft structure that the eval expected to reject"
      : "engine rejected a draft structure that the eval expected to price",
    status: "fail"
  };
}

function pricedModelSignature(model: DealOptimizerModel): string {
  return sha256CanonicalJson({
    rankedCandidates: model.rankedCandidates.map((candidate) => ({
      calculationHash: candidate.calculationHash,
      candidateId: candidate.candidateId,
      objectiveValue: candidate.objectiveValue,
      rank: candidate.rank
    })),
    rejectedCandidates: model.rejectedCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      reason: candidate.reason
    }))
  });
}

function containsForbiddenModelDollarValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenModelDollarValue);
  }
  if (typeof value === "string") {
    return forbiddenModelDollarTextPattern.test(value);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => forbiddenModelDollarKeyPattern.test(key) || containsForbiddenModelDollarValue(nested)
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

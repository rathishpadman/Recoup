import {
  parseCreditNegotiationCounterOffer,
  validateCreditNegotiationCounterPolicy,
  type CreditNegotiationCounterParseResult
} from "../src/services/creditNegotiationCounterParser.js";
import type { CreditNegotiationPolicyRow } from "../src/services/creditNegotiationPolicy.js";

export type CreditNegotiationCounterEvalStatus = "fail" | "pass";
export type CreditNegotiationCounterExpectedStatus = "grammar_valid" | "human_review";

export interface CreditNegotiationCounterEvalCase {
  caseId: string;
  expectedStatus: CreditNegotiationCounterExpectedStatus;
  rawMessage: string;
  rawModelOutput: unknown;
}

export interface CreditNegotiationCounterEvalInput {
  cases: readonly CreditNegotiationCounterEvalCase[];
  policyRows: readonly CreditNegotiationPolicyRow[];
}

export interface CreditNegotiationCounterEvalCaseResult {
  caseId: string;
  checks: {
    citationGrounding: CreditNegotiationCounterEvalStatus;
    expectedStatus: CreditNegotiationCounterEvalStatus;
    grammarAdherence: CreditNegotiationCounterEvalStatus;
    noModelComputedTerms: CreditNegotiationCounterEvalStatus;
    policyBounds: CreditNegotiationCounterEvalStatus;
  };
  failures: string[];
  parsedStatus: CreditNegotiationCounterExpectedStatus;
  rawModelOutputSuppressed: true;
  status: CreditNegotiationCounterEvalStatus;
}

export interface CreditNegotiationCounterEvalReport {
  caseResults: CreditNegotiationCounterEvalCaseResult[];
  status: CreditNegotiationCounterEvalStatus;
  summary: {
    failedCases: number;
    grammarValidCases: number;
    humanReviewCases: number;
    passedCases: number;
    totalCases: number;
  };
}

const forbiddenComputedTermKeys = new Set(["extractedTerms", "terms", "amounts", "computedTerms", "dollarValues"]);

export function evaluateCreditNegotiationCounterEval(input: CreditNegotiationCounterEvalInput): CreditNegotiationCounterEvalReport {
  const caseResults = input.cases.map((evalCase) => evaluateCase(evalCase, input.policyRows));
  const passedCases = caseResults.filter((result) => result.status === "pass").length;

  return {
    caseResults,
    status: passedCases === caseResults.length ? "pass" : "fail",
    summary: {
      failedCases: caseResults.length - passedCases,
      grammarValidCases: caseResults.filter((result) => result.parsedStatus === "grammar_valid").length,
      humanReviewCases: caseResults.filter((result) => result.parsedStatus === "human_review").length,
      passedCases,
      totalCases: caseResults.length
    }
  };
}

function evaluateCase(
  evalCase: CreditNegotiationCounterEvalCase,
  policyRows: readonly CreditNegotiationPolicyRow[]
): CreditNegotiationCounterEvalCaseResult {
  const failures: string[] = [];
  const checks: CreditNegotiationCounterEvalCaseResult["checks"] = {
    citationGrounding: "pass",
    expectedStatus: "pass",
    grammarAdherence: "pass",
    noModelComputedTerms: "pass",
    policyBounds: "pass"
  };

  if (containsComputedTermKey(evalCase.rawModelOutput)) {
    checks.noModelComputedTerms = "fail";
    failures.push("model output included computed terms instead of cited spans only");
  }

  const parsed = parseCreditNegotiationCounterOffer({
    modelExtraction: evalCase.rawModelOutput,
    rawMessage: evalCase.rawMessage
  });
  const policyChecked = validateCreditNegotiationCounterPolicy(parsed, policyRows);
  const parsedStatus = policyChecked.status;
  if (parsedStatus === "human_review" && parsed.status === "grammar_valid") {
    checks.policyBounds = "fail";
    failures.push(policyChecked.reason);
  }
  if (parsed.status === "human_review" && parsed.reason === "Counter-offer model extraction is outside the approved schema.") {
    checks.grammarAdherence = "fail";
    failures.push(parsed.reason);
  }
  if (hasUngroundedCitation(parsed, evalCase.rawMessage)) {
    checks.citationGrounding = "fail";
    failures.push("model cited spans outside the inbound email body");
  }
  if (parsedStatus !== evalCase.expectedStatus) {
    checks.expectedStatus = "fail";
    failures.push(`parsed status ${parsedStatus} did not match expected ${evalCase.expectedStatus}`);
  }

  const status =
    Object.values(checks).every((check) => check === "pass") && failures.length === 0 && checks.noModelComputedTerms === "pass"
      ? "pass"
      : "fail";

  return {
    caseId: evalCase.caseId,
    checks,
    failures,
    parsedStatus,
    rawModelOutputSuppressed: true,
    status
  };
}

function hasUngroundedCitation(result: CreditNegotiationCounterParseResult, rawMessage: string): boolean {
  const citedSpans = result.citedSpans ?? [];
  return citedSpans.some((span) => !rawMessage.includes(span.text));
}

function containsComputedTermKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsComputedTermKey);
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => forbiddenComputedTermKeys.has(key) || containsComputedTermKey(nested)
  );
}

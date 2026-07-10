export interface GoldenQueryResult {
  answer?: unknown;
  citations?: unknown;
  modelExecution?:
    | {
        mode?: unknown;
        rawModelTextPolicy?: unknown;
        sourceReadMode?: unknown;
        tokenUsage?: unknown;
        tokenUsageSnapshot?: { totalTokens?: unknown };
      }
    | undefined;
  trace?: unknown;
}

export interface DavidGoldenAccount {
  accountId: string;
  customer: string;
  verdict: string;
}

export const llmQueryGoldenScenarios = {
  davidCreditAccountRisk: {
    forbiddenAnswerPatterns: [/\bSELECT\b/iu, /\bINSERT\b/iu, /\bUPDATE\b/iu, /\bDELETE\b/iu, /\bDROP\b/iu],
    requiredMode: "live_openai_agents"
  },
  mayaWorkspaceInvalidDeductions: {
    expectedAnswerTerms: [
      "Crestline Grocery",
      "ValuMart Club",
      "Harbor Foods",
      "cases S3 and S6",
      "case S5",
      "case S8",
      "4 invalid cases",
      "3 customers"
    ],
    forbiddenAnswerPatterns: [
      /\bSELECT\b/iu,
      /\bINSERT\b/iu,
      /\bUPDATE\b/iu,
      /\bDELETE\b/iu,
      /\bDROP\b/iu,
      /\bS[1-8]-L\d+\b/iu,
      /a cited record/iu
    ],
    question: "Which customers are having invalid deductions?",
    requiredMode: "live_openai_agents"
  }
} as const;

export function validateMayaWorkspaceInvalidDeductionsGolden(result: GoldenQueryResult): string[] {
  const scenario = llmQueryGoldenScenarios.mayaWorkspaceInvalidDeductions;
  const errors = validateCommonLiveQueryResult(result, {
    forbiddenAnswerPatterns: scenario.forbiddenAnswerPatterns,
    label: "Maya workspace invalid deductions",
    requiredMode: scenario.requiredMode
  });
  const answer = readString(result.answer);
  for (const term of scenario.expectedAnswerTerms) {
    if (!answer.includes(term)) {
      errors.push(`answer omitted ${term}`);
    }
  }
  if (result.modelExecution?.sourceReadMode !== "live_sdk_mcp") {
    errors.push("Maya workspace invalid deductions source read mode was not live_sdk_mcp");
  }

  return errors;
}

export function validateDavidCreditQueryGolden(account: DavidGoldenAccount, result: GoldenQueryResult): string[] {
  const scenario = llmQueryGoldenScenarios.davidCreditAccountRisk;
  const errors = validateCommonLiveQueryResult(result, {
    forbiddenAnswerPatterns: scenario.forbiddenAnswerPatterns,
    label: `David credit query ${account.accountId}`,
    requiredMode: scenario.requiredMode
  });
  const answer = readString(result.answer).toLocaleLowerCase();
  if (!answer.includes(account.customer.toLocaleLowerCase())) {
    errors.push(`answer omitted customer ${account.customer}`);
  }
  if (!answer.includes(`${account.verdict.toLocaleLowerCase()} risk`)) {
    errors.push(`answer omitted verdict ${account.verdict} risk`);
  }

  return errors;
}

function validateCommonLiveQueryResult(
  result: GoldenQueryResult,
  options: {
    forbiddenAnswerPatterns: readonly RegExp[];
    label: string;
    requiredMode: string;
  }
): string[] {
  const errors: string[] = [];
  const answer = readString(result.answer);
  if (answer.trim().length < 40) {
    errors.push(`${options.label} answer is too short to be readable`);
  }
  for (const pattern of options.forbiddenAnswerPatterns) {
    if (pattern.test(answer)) {
      errors.push(`${options.label} answer exposed a raw SQL/write pattern`);
    }
  }
  if (result.modelExecution?.mode !== options.requiredMode) {
    errors.push(`${options.label} modelExecution mode was not ${options.requiredMode}`);
  }
  if (result.modelExecution?.sourceReadMode !== undefined && result.modelExecution.sourceReadMode !== "live_sdk_mcp") {
    errors.push(`${options.label} source read mode was not live_sdk_mcp`);
  }
  if (result.modelExecution?.rawModelTextPolicy !== "suppressed") {
    errors.push(`${options.label} raw model output policy was not suppressed`);
  }
  const tokenUsage = result.modelExecution?.tokenUsage ?? result.modelExecution?.tokenUsageSnapshot?.totalTokens;
  if (typeof tokenUsage !== "number") {
    errors.push(`${options.label} omitted token usage proof`);
  }
  if (!Array.isArray(result.citations) || result.citations.length === 0) {
    errors.push(`${options.label} omitted cited records`);
  }
  if (!Array.isArray(result.trace) || result.trace.length === 0) {
    errors.push(`${options.label} omitted trace rows`);
  }

  return errors;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

import type { GovernedConfigValues } from "../../config/governed.js";
import type { SourcePort } from "../adapters/source.js";
import {
  runForensicsInvestigation,
  type DeductionDecision,
  type ForensicsRun,
  type RunForensicsInvestigationOptions
} from "../agents/forensics.js";
import type { ForensicsQueryTraceEvent, ForensicsQueryTracePhase } from "../agents/liveForensicsStream.js";
import type { ServiceInvocationContext } from "./serviceLayer.js";
import { settlementRunIdForSource } from "./settlementRunIdentity.js";
import { money, type Money } from "../types/money.js";

export const workspaceForensicsQueryBasis = "current settlement run read-model + deterministic forensics decisions" as const;

export interface ForensicsWorkspaceQuerySessionInput {
  governedConfig: GovernedConfigValues;
  question: string;
  runForensics?: (options: RunForensicsInvestigationOptions) => ForensicsRun;
  settlementRunId: string;
  reconciliation?: RunForensicsInvestigationOptions["reconciliation"];
  serviceContext: ServiceInvocationContext;
  source: SourcePort;
}

export interface ForensicsWorkspaceQueryCitation {
  deterministicBasis: typeof workspaceForensicsQueryBasis;
  documentId?: string;
  recordId: string;
  source?: string;
  summary?: string;
}

export type SourceAnnotatedForensicsWorkspaceQueryTraceEvent = ForensicsQueryTraceEvent & {
  retrievalSource?: "agent_trace" | "sap_odata" | "source_backed" | "supabase";
  sourceFreshness?: string;
  sourceKind?: "agent_trace" | "derived_backend" | "operator_session" | "sap_odata" | "supabase";
  transportLabel?: string;
  transportLayer?: string;
};

export type ForensicsWorkspaceQueryResponse =
  | {
      answer: string;
      citations: ForensicsWorkspaceQueryCitation[];
      deterministicBasis: typeof workspaceForensicsQueryBasis;
      facts: WorkspaceQueryFacts;
      matchedCaseIds: string[];
      sourceReadStatus: "source_backed_workspace_scope";
      sourceReads: {
        canonicalModel: "ForensicsWorkspaceReadModel";
        caseCount: number;
        selectedRecordIds: string[];
        settlementRunId: string;
        sourceFreshness: "snapshot";
        transportLabel: "Current settlement run read model";
        transportLayer: "source_port_forensics_workspace";
      };
      trace: SourceAnnotatedForensicsWorkspaceQueryTraceEvent[];
    }
  | {
      answer?: undefined;
      citations: [];
      deterministicBasis?: undefined;
      facts?: undefined;
      matchedCaseIds?: undefined;
      sourceReadStatus?: undefined;
      sourceReads?: undefined;
      trace: [];
    };

export class ForensicsWorkspaceSettlementRunMismatchError extends Error {
  readonly currentSettlementRunId: string;

  constructor(currentSettlementRunId: string) {
    super("Maya workspace query requires the current settlement run.");
    this.name = "ForensicsWorkspaceSettlementRunMismatchError";
    this.currentSettlementRunId = currentSettlementRunId;
  }
}

export function buildForensicsWorkspaceQueryResponse(
  input: ForensicsWorkspaceQuerySessionInput
): ForensicsWorkspaceQueryResponse {
  const question = input.question.trim();
  if (question.length === 0) {
    throw new Error("Forensics workspace query requires question.");
  }

  const settlementRun = input.source.loadSettlementRun();
  const currentSettlementRunId = settlementRunIdForSource(settlementRun);
  if (input.settlementRunId.trim() !== currentSettlementRunId) {
    throw new ForensicsWorkspaceSettlementRunMismatchError(currentSettlementRunId);
  }

  const run = (input.runForensics ?? runForensicsInvestigation)({
    governedConfig: input.governedConfig,
    ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
    serviceContext: input.serviceContext,
    source: input.source
  });
  if (run.decisions.length === 0) {
    return blockedWorkspaceQueryResponse();
  }

  const caseSummaries = buildWorkspaceCaseSummaries(run.decisions, settlementRun);
  if (caseSummaries.length === 0) {
    return blockedWorkspaceQueryResponse();
  }

  const matchedCases = matchWorkspaceCases(caseSummaries, question);
  // Cite what the answer actually rests on. Citing the whole run for a question about one case
  // dressed an unrelated answer in evidence. With no match the run itself is the subject, and the
  // cockpit will not display an answer with no citations at all.
  const citations = buildWorkspaceQueryCitations(matchedCases.length === 0 ? caseSummaries : matchedCases);
  const citedRecordIds = citations.map((citation) => citation.recordId);

  return {
    answer: buildDeterministicWorkspaceQueryAnswer({
      caseSummaries,
      matchedCases,
      question
    }),
    citations,
    facts: buildWorkspaceQueryFacts(caseSummaries),
    matchedCaseIds: matchedCases.map((summary) => summary.caseId),
    deterministicBasis: workspaceForensicsQueryBasis,
    sourceReadStatus: "source_backed_workspace_scope",
    sourceReads: {
      canonicalModel: "ForensicsWorkspaceReadModel",
      caseCount: caseSummaries.length,
      selectedRecordIds: dedupeRecordIds(citedRecordIds),
      settlementRunId: currentSettlementRunId,
      sourceFreshness: "snapshot",
      transportLabel: "Current settlement run read model",
      transportLayer: "source_port_forensics_workspace"
    },
    trace: buildWorkspaceQueryTrace(citedRecordIds)
  };
}

interface WorkspaceCaseSummary {
  amount: string;
  basis: string;
  caseId: string;
  customerId: string;
  customerName: string;
  lineIds: string[];
  recordIds: string[];
  routing: string;
  ruleId: string;
  verdict: string;
}

/**
 * Everything a reader could be told about this run, computed from the read model. An answer may
 * only contain values that appear here.
 */
export interface WorkspaceQueryFacts {
  amounts: string[];
  caseIds: string[];
  counts: number[];
  customerNames: string[];
  recordIds: string[];
  routings: string[];
  ruleIds: string[];
  verdicts: string[];
}

function buildWorkspaceCaseSummaries(
  decisions: readonly DeductionDecision[],
  settlementRun: ReturnType<SourcePort["loadSettlementRun"]>
): WorkspaceCaseSummary[] {
  const customersById = new Map(settlementRun.customers.map((customer) => [customer.customerId, customer]));
  const linesById = new Map(settlementRun.deductionLines.map((line) => [line.lineId, line]));
  const byCaseId = new Map<string, DeductionDecision[]>();
  for (const decision of decisions) {
    const caseId = workspaceCaseIdFromLineId(decision.lineId);
    byCaseId.set(caseId, [...(byCaseId.get(caseId) ?? []), decision]);
  }

  return [...byCaseId.entries()].map(([caseId, caseDecisions]) => {
    const representative = caseDecisions[0];
    if (representative === undefined) {
      throw new Error(`Workspace case ${caseId} has no deterministic forensics decision.`);
    }
    const representativeLine = linesById.get(representative.lineId);
    const customerId = representativeLine?.customerId ?? "unknown";
    const customerName = customersById.get(customerId)?.name ?? customerId;

    const caseAmount = caseDecisions.reduce(
      (total, decision) => total.plus(decision.deterministicBasis.computedDeltaAmount),
      money("0.00")
    );

    return {
      amount: formatWorkspaceMoney(caseAmount),
      basis: representative.basis,
      caseId,
      customerId,
      customerName,
      lineIds: caseDecisions.map((decision) => decision.lineId),
      recordIds: dedupeRecordIds(
        caseDecisions.flatMap((decision) => [
          decision.lineId,
          ...decision.recordIds,
          ...decision.evidenceDocuments.flatMap((document) => document.recordIds)
        ])
      ),
      routing: representative.routing,
      ruleId: representative.deterministicBasis.ruleId,
      verdict: representative.verdict
    };
  });
}

function formatWorkspaceMoney(value: Money): string {
  const fixed = value.toDecimalPlaces(2).toFixed(2);
  const [whole = "0", fractional = "00"] = fixed.split(".");

  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}.${fractional}`;
}

/** Terms that carry no topical meaning; matching on them would select every case. */
const workspaceQueryStopWords = new Set([
  "about", "all", "and", "are", "can", "case", "cases", "deduction", "deductions", "did", "does",
  "explain", "for", "from", "give", "help", "how", "into", "its", "làm", "list", "many", "me",
  "much", "run", "settlement", "show", "some", "tell", "that", "the", "their", "there", "these",
  "this", "those", "understand", "was", "were", "what", "when", "where", "which", "who", "why",
  "with", "you", "your"
]);

function workspaceQueryTerms(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9-]+/u)
        .filter((term) => term.length >= 3 && !workspaceQueryStopWords.has(term))
    )
  ];
}

/**
 * Cases whose rule, basis, customer, verdict or routing mentions a term from the question. The
 * rule id is what makes a topical word reach both of its cases: promo-overclaim's basis speaks of
 * an allowance and a TPM accrual and never says promo.
 */
export function matchWorkspaceCases(
  caseSummaries: readonly WorkspaceCaseSummary[],
  question: string
): WorkspaceCaseSummary[] {
  const terms = workspaceQueryTerms(question);
  if (terms.length === 0) {
    return [];
  }

  const scored = caseSummaries
    .map((summary) => {
      const haystack = [
        summary.ruleId,
        summary.basis,
        summary.customerName,
        summary.caseId,
        summary.verdict,
        summary.routing
      ]
        .join(" ")
        .toLowerCase();

      return { hits: terms.filter((term) => haystack.includes(term)).length, summary };
    })
    .filter((entry) => entry.hits > 0);
  const bestHits = Math.max(0, ...scored.map((entry) => entry.hits));
  const best = scored.filter((entry) => entry.hits === bestHits);
  // One incidental word shared with a basis sentence is not a topical match. Require either two
  // matching terms or a hit on the rule id, which is what actually classifies a case.
  const confident = best.filter(
    (entry) => entry.hits >= 2 || terms.some((term) => entry.summary.ruleId.toLowerCase().includes(term))
  );

  return confident.map((entry) => entry.summary);
}

export function buildWorkspaceQueryFacts(caseSummaries: readonly WorkspaceCaseSummary[]): WorkspaceQueryFacts {
  return {
    amounts: dedupeRecordIds(caseSummaries.map((summary) => summary.amount)),
    caseIds: dedupeRecordIds(caseSummaries.map((summary) => summary.caseId)),
    counts: [
      ...new Set([
        caseSummaries.length,
        ...["valid", "invalid", "partial"].map((verdict) => countWorkspaceCasesBy(caseSummaries, "verdict", verdict)),
        ...["billing", "recovery"].map((routing) => countWorkspaceCasesBy(caseSummaries, "routing", routing)),
        ...caseSummaries.map((summary) => summary.lineIds.length)
      ])
    ],
    customerNames: dedupeRecordIds(caseSummaries.map((summary) => summary.customerName)),
    recordIds: dedupeRecordIds(caseSummaries.flatMap((summary) => [...summary.lineIds, ...summary.recordIds])),
    routings: dedupeRecordIds(caseSummaries.map((summary) => summary.routing)),
    ruleIds: dedupeRecordIds(caseSummaries.map((summary) => summary.ruleId)),
    verdicts: dedupeRecordIds(caseSummaries.map((summary) => summary.verdict))
  };
}

function buildWorkspaceQueryCitations(caseSummaries: readonly WorkspaceCaseSummary[]): ForensicsWorkspaceQueryCitation[] {
  return caseSummaries.flatMap((summary) =>
    summary.recordIds.map((recordId) => ({
      deterministicBasis: workspaceForensicsQueryBasis,
      documentId: summary.caseId,
      recordId,
      source: recordId === summary.caseId || summary.lineIds.includes(recordId) ? "source_backed" : "derived_backend",
      summary: `${summary.caseId} ${summary.customerName} ${summary.verdict} verdict routed to ${summary.routing}: ${summary.basis}`
    }))
  );
}

function buildDeterministicWorkspaceQueryAnswer(input: {
  caseSummaries: readonly WorkspaceCaseSummary[];
  matchedCases: readonly WorkspaceCaseSummary[];
  question: string;
}): string {
  const validCount = countWorkspaceCasesBy(input.caseSummaries, "verdict", "valid");
  const invalidCount = countWorkspaceCasesBy(input.caseSummaries, "verdict", "invalid");
  const partialCount = countWorkspaceCasesBy(input.caseSummaries, "verdict", "partial");
  const billingCount = countWorkspaceCasesBy(input.caseSummaries, "routing", "billing");
  const recoveryCount = countWorkspaceCasesBy(input.caseSummaries, "routing", "recovery");
  const normalizedQuestion = input.question.toLowerCase();

  // A question that names a topic, customer or case is answered with those cases. The generic run
  // summary below used to answer everything, so anything that was not about invalid deductions got
  // a paragraph that never addressed it.
  if (input.matchedCases.length > 0 && input.matchedCases.length < input.caseSummaries.length) {
    const described = input.matchedCases.map(
      (summary) =>
        `${summary.caseId} (${summary.customerName}) is ${summary.verdict} and routes to ${summary.routing} for ${summary.amount}: ${summary.basis}`
    );
    return [
      `${formatCaseList(input.matchedCases.map((summary) => summary.caseId))} ${input.matchedCases.length === 1 ? "matches" : "match"} that question.`,
      described.join(" "),
      "The cited settlement and evidence records are attached below for review."
    ].join(" ");
  }

  // A question about the run as a whole matches no single case, but the summary below is its
  // correct answer. Reporting "nothing matched" for it would be wrong, not merely unhelpful.
  if (input.matchedCases.length === 0 && !normalizedQuestion.includes("invalid") && !isRunOverviewQuestion(normalizedQuestion)) {
    return [
      "No case in the current settlement run matches that question.",
      `The run has ${input.caseSummaries.length.toString()} deduction cases across ${dedupeRecordIds(input.caseSummaries.map((summary) => summary.customerName)).length.toString()} customers.`,
      "The cited settlement and evidence records are attached below for review."
    ].join(" ");
  }

  if (normalizedQuestion.includes("invalid")) {
    const invalidCases = input.caseSummaries.filter((summary) => summary.verdict === "invalid");
    const invalidCustomerGroups = groupCasesByCustomer(invalidCases).map((group) => {
      return `${group.customerName} (${formatCaseList(group.cases.map((summary) => summary.caseId))})`;
    });
    return [
      `Invalid deductions currently involve ${invalidCustomerGroups.join(", ")}.`,
      `That is ${invalidCount.toString()} invalid cases from ${dedupeRecordIds(invalidCases.map((summary) => summary.customerId)).length.toString()} customers.`,
      `The cited settlement and evidence records are attached below for review.`
    ].join(" ");
  }

  return [
    `The current settlement run has ${input.caseSummaries.length.toString()} deduction cases.`,
    `Agents returned ${validCount.toString()} valid, ${invalidCount.toString()} invalid, and ${partialCount.toString()} partial verdicts from the read-model.`,
    `${billingCount.toString()} cases route to Billing and ${recoveryCount.toString()} cases route to Recovery.`,
    `The cited settlement and evidence records are attached below for review.`
  ].join(" ");
}

/**
 * Whether the question is about the run as a whole rather than a particular case. These match no
 * single case, so without this they would be reported as unanswerable when the summary answers them.
 */
function isRunOverviewQuestion(normalizedQuestion: string): boolean {
  return [
    "across the settlement run",
    "settlement run",
    "the run",
    "overall",
    "in total",
    "how many",
    "summary",
    "summarise",
    "summarize",
    "conclude",
    "concluded",
    "breakdown",
    "status of"
  ].some((phrase) => normalizedQuestion.includes(phrase));
}

function groupCasesByCustomer(cases: readonly WorkspaceCaseSummary[]): Array<{
  cases: WorkspaceCaseSummary[];
  customerId: string;
  customerName: string;
}> {
  const groups = new Map<string, { cases: WorkspaceCaseSummary[]; customerId: string; customerName: string }>();
  for (const summary of cases) {
    const group = groups.get(summary.customerId) ?? {
      cases: [],
      customerId: summary.customerId,
      customerName: summary.customerName
    };
    group.cases.push(summary);
    groups.set(summary.customerId, group);
  }

  return [...groups.values()];
}

function formatCaseList(caseIds: readonly string[]): string {
  const uniqueCaseIds = dedupeRecordIds(caseIds);
  if (uniqueCaseIds.length === 0) {
    return "no cited cases";
  }
  const [firstCaseId, secondCaseId] = uniqueCaseIds as [string, string?, ...string[]];
  if (uniqueCaseIds.length === 1) {
    return `case ${firstCaseId}`;
  }
  if (uniqueCaseIds.length === 2) {
    return `cases ${firstCaseId} and ${secondCaseId ?? ""}`;
  }
  const lastCaseId = uniqueCaseIds[uniqueCaseIds.length - 1] ?? "";

  return `cases ${uniqueCaseIds.slice(0, -1).join(", ")}, and ${lastCaseId}`;
}

function buildWorkspaceQueryTrace(citedRecordIds: readonly string[]): SourceAnnotatedForensicsWorkspaceQueryTraceEvent[] {
  const recordIds = dedupeRecordIds(citedRecordIds);
  return [
    workspaceTraceEvent("supervisor", "Settlement run accepted", "Workspace query matched the current settlement run.", recordIds),
    workspaceTraceEvent("query", "Question normalized", "Workspace question was normalized for a settlement-run report.", recordIds),
    workspaceTraceEvent("retrieval", "Evidence packet read", "Settlement line and evidence record IDs were read from the current source snapshot.", recordIds),
    workspaceTraceEvent("decision", "Decision rollup checked", "Deterministic forensics decisions supplied the workspace verdict and routing rollup.", recordIds)
  ];
}

function workspaceTraceEvent(
  phase: ForensicsQueryTracePhase,
  label: string,
  message: string,
  recordIds: readonly string[]
): SourceAnnotatedForensicsWorkspaceQueryTraceEvent {
  const hook =
    phase === "supervisor"
      ? "agent_start"
      : phase === "decision"
        ? "agent_end"
        : phase === "query"
          ? "agent_tool_start"
          : "agent_tool_end";

  return {
    agentName: "Recoup Copilot",
    deterministicBasis: workspaceForensicsQueryBasis,
    hook,
    label,
    message,
    phase,
    receiptDeterministicBasis: "Recoup deterministic forensics hook audit event",
    recordIds: [...recordIds],
    retrievalSource: "source_backed",
    sourceKind: "derived_backend",
    ...(phase === "retrieval" ? { toolName: "settlement.run.read" } : {})
  };
}

function countWorkspaceCasesBy(
  caseSummaries: readonly WorkspaceCaseSummary[],
  key: "routing" | "verdict",
  value: string
): number {
  return caseSummaries.filter((summary) => summary[key] === value).length;
}

function workspaceCaseIdFromLineId(lineId: string): string {
  return lineId.match(/^(S[1-8])-/u)?.[1] ?? lineId;
}

function blockedWorkspaceQueryResponse(): ForensicsWorkspaceQueryResponse {
  return {
    citations: [],
    trace: []
  };
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}

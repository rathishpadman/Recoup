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

  const citations = buildWorkspaceQueryCitations(caseSummaries);
  const citedRecordIds = citations.map((citation) => citation.recordId);
  return {
    answer: buildDeterministicWorkspaceQueryAnswer({
      caseSummaries,
      question
    }),
    citations,
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
  basis: string;
  caseId: string;
  customerId: string;
  customerName: string;
  lineIds: string[];
  recordIds: string[];
  routing: string;
  verdict: string;
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

    return {
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
      verdict: representative.verdict
    };
  });
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
  question: string;
}): string {
  const validCount = countWorkspaceCasesBy(input.caseSummaries, "verdict", "valid");
  const invalidCount = countWorkspaceCasesBy(input.caseSummaries, "verdict", "invalid");
  const partialCount = countWorkspaceCasesBy(input.caseSummaries, "verdict", "partial");
  const billingCount = countWorkspaceCasesBy(input.caseSummaries, "routing", "billing");
  const recoveryCount = countWorkspaceCasesBy(input.caseSummaries, "routing", "recovery");
  const normalizedQuestion = input.question.toLowerCase();

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

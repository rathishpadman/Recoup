import { runtimeModels } from "../../config/models.js";
import type { GovernedConfigValues } from "../../config/governed.js";
import type { SourcePort } from "../adapters/source.js";
import type { ArbitrationResult } from "../core/arbitration.js";
import { runRiskMeshClosedLoop } from "./riskMesh.js";

export interface OfflineQueryInput {
  governedConfig: GovernedConfigValues;
  question: string;
  recordIds?: string[];
  selectedLineId?: string;
  source: SourcePort;
}

export interface OfflineQueryAnswer {
  status: "disabled_offline_safe";
  answer: string;
  citationParity: CitationParity;
  recordIds: string[];
  deterministicBasis: string;
  modelExecution: "blocked: offline build does not invoke live model calls";
  plannedModels: {
    voice: typeof runtimeModels.realtime;
    text: typeof runtimeModels.fast;
  };
}

export interface CitationParity {
  textRecordIds: string[];
  voiceRecordIds: string[];
  parity: "same_record_ids";
}

export interface DeterministicForensicsQueryAnswerInput {
  basis: string;
  citationRecordIds: readonly string[];
  question: string;
  routing: string;
  selectedLineId: string;
  verdict: string;
}

export function buildDeterministicForensicsQueryAnswer(input: DeterministicForensicsQueryAnswerInput): string {
  const citationRecordIds = dedupeRecordIds(input.citationRecordIds);
  const intent = classifySelectedEvidenceQueryIntent(input.question);
  const selectedLineLead = `Line ${input.selectedLineId}`;
  const verdictLead = `${selectedLineLead} is ${input.verdict} and routed to ${input.routing}.`;
  const citationLead = `The answer is limited to cited record IDs: ${citationRecordIds.join(", ")}.`;

  if (intent === "approval_gate") {
    return [
      `Before Maya opens approval for ${input.selectedLineId}, the current finding remains ${input.verdict} and routes to ${input.routing}.`,
      `Deterministic basis: ${input.basis}`,
      "External action stays gated behind human approval.",
      citationLead
    ].join(" ");
  }

  if (intent === "route") {
    return [
      `${selectedLineLead} belongs with ${input.routing}.`,
      `The current ${input.verdict} finding is supported by: ${input.basis}`,
      citationLead
    ].join(" ");
  }

  if (intent === "counterfactual_validity") {
    return [
      `A valid deduction would need cited evidence that overturns the current finding for ${input.selectedLineId}.`,
      `Instead, the selected evidence supports the ${input.verdict} verdict and ${input.routing} route: ${input.basis}`,
      citationLead
    ].join(" ");
  }

  if (intent === "customer_challenge") {
    return [
      `To respond on ${input.selectedLineId}, use the cited evidence supporting the ${input.verdict} verdict and ${input.routing} route.`,
      `Deterministic basis: ${input.basis}`,
      citationLead
    ].join(" ");
  }

  return [
    verdictLead,
    `Basis: ${input.basis}`,
    citationLead
  ].join(" ");
}

export function answerOfflineQuery(input: OfflineQueryInput | undefined): OfflineQueryAnswer {
  const maybeInput = input as Partial<OfflineQueryInput> | undefined;
  if (maybeInput?.governedConfig === undefined) {
    throw new Error("Governed runtime config snapshot required.");
  }
  if (maybeInput.source === undefined) {
    throw new Error("Supabase source snapshot required.");
  }
  const queryInput = maybeInput as OfflineQueryInput;

  const normalizedQuestion = queryInput.question.trim();
  if (queryInput.selectedLineId !== undefined && queryInput.recordIds !== undefined) {
    return {
      status: "disabled_offline_safe",
      answer:
        normalizedQuestion.length === 0
          ? "Selected evidence query is staged for offline demo only; no live model call was made."
          : `Selected evidence query for ${queryInput.selectedLineId} is staged for offline demo only; use the cited selected evidence records shown in the cockpit packet.`,
      citationParity: sameRecordIdCitationParity(queryInput.recordIds),
      recordIds: [...queryInput.recordIds],
      deterministicBasis:
        "query.answer selectedLineId + selected evidence recordIds + offline model-execution block; live Realtime answers must stay scoped to the selected cockpit evidence packet.",
      modelExecution: "blocked: offline build does not invoke live model calls",
      plannedModels: {
        voice: runtimeModels.realtime,
        text: runtimeModels.fast
      }
    };
  }

  const normalizedLower = normalizedQuestion.toLowerCase();
  const asksForHarborRisk =
    normalizedLower.includes("harbor") || normalizedLower.includes("blocked") || normalizedLower.includes("risk");

  if (asksForHarborRisk) {
    const riskRun = runRiskMeshClosedLoop({ governedConfig: queryInput.governedConfig, source: queryInput.source });
    const arbitrationState = describeArbitrationState(riskRun.arbitration);
    const recordIds = Array.from(
      new Set([
        ...riskRun.sentinel.recordIds,
        ...riskRun.arbitration.recordIds,
        ...riskRun.holdAction.recordIds,
        ...riskRun.auditEntries.flatMap((entry) => entry.recordIds)
      ])
    );

    return {
      status: "disabled_offline_safe",
      answer:
        `Harbor is staged for human-reviewed Risk Mesh handling from cited audit and cockpit state. Sentinel state is ${riskRun.sentinel.reason}; Risk Mesh arbitration state is ${arbitrationState}. The offline harness reports the Supabase recoup_config snapshot and live query policy without invoking a model.`,
      citationParity: sameRecordIdCitationParity(recordIds),
      recordIds,
      deterministicBasis:
        "audit.read + core.riskMeshClosedLoop staged records; Supabase recoup_config snapshot injected by service boundary, with runtime credentials and HITL query policy still required for live model execution.",
      modelExecution: "blocked: offline build does not invoke live model calls",
      plannedModels: {
        voice: runtimeModels.realtime,
        text: runtimeModels.fast
      }
    };
  }

  const settlementRun = queryInput.source.loadSettlementRun();
  const citedRecordIds = settlementRun.deductionLines.slice(0, 3).map((line) => line.lineId);

  return {
    status: "disabled_offline_safe",
    answer:
      normalizedQuestion.length === 0
        ? "Conversational query is staged for offline demo only; no live model call was made."
        : "Conversational query is staged for offline demo only; use the cockpit records and audit trail for cited evidence.",
    citationParity: sameRecordIdCitationParity(citedRecordIds),
    recordIds: citedRecordIds,
    deterministicBasis: "Offline harness blocks Realtime/text model execution until runtime credentials and HITL query policy are configured.",
    modelExecution: "blocked: offline build does not invoke live model calls",
    plannedModels: {
      voice: runtimeModels.realtime,
      text: runtimeModels.fast
    }
  };
}

function describeArbitrationState(arbitration: ArbitrationResult): string {
  if (arbitration.status === "blocked") {
    return arbitration.reason;
  }

  return `ranked-resolution:${arbitration.resolution}`;
}

function sameRecordIdCitationParity(recordIds: readonly string[]): CitationParity {
  const citedRecordIds = dedupeRecordIds(recordIds);

  return {
    textRecordIds: citedRecordIds,
    voiceRecordIds: [...citedRecordIds],
    parity: "same_record_ids"
  };
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.map((recordId) => recordId.trim()).filter((recordId) => recordId.length > 0))];
}

type SelectedEvidenceQueryIntent = "approval_gate" | "counterfactual_validity" | "customer_challenge" | "generic" | "route";

function classifySelectedEvidenceQueryIntent(question: string): SelectedEvidenceQueryIntent {
  const normalizedQuestion = question.trim().toLowerCase();
  if (normalizedQuestion.length === 0) {
    return "generic";
  }

  if (
    normalizedQuestion.includes("approval") ||
    normalizedQuestion.includes("manager") ||
    normalizedQuestion.includes("human review") ||
    normalizedQuestion.includes("human approval")
  ) {
    return "approval_gate";
  }

  if (
    normalizedQuestion.includes("billing correction") ||
    normalizedQuestion.includes("recovery pursuit") ||
    normalizedQuestion.includes("what route") ||
    normalizedQuestion.includes("which route") ||
    normalizedQuestion.includes("drives that route") ||
    normalizedQuestion.includes("route")
  ) {
    return "route";
  }

  if (
    normalizedQuestion.includes("what would make this a valid deduction") ||
    normalizedQuestion.includes("valid-deduction pattern") ||
    normalizedQuestion.includes("valid deduction pattern")
  ) {
    return "counterfactual_validity";
  }

  if (
    normalizedQuestion.includes("customer says") ||
    normalizedQuestion.includes("challenge") ||
    normalizedQuestion.includes("what proof supports") ||
    normalizedQuestion.includes("what evidence supports")
  ) {
    return "customer_challenge";
  }

  return "generic";
}

import { runtimeModels } from "../../config/models.js";
import type { GovernedConfigValues } from "../../config/governed.js";
import type { SourcePort } from "../adapters/source.js";
import type { ArbitrationResult } from "../core/arbitration.js";
import { runRiskMeshClosedLoop } from "./riskMesh.js";

export interface OfflineQueryInput {
  governedConfig: GovernedConfigValues;
  question: string;
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
  const citedRecordIds = [...recordIds];

  return {
    textRecordIds: citedRecordIds,
    voiceRecordIds: [...citedRecordIds],
    parity: "same_record_ids"
  };
}

import { runtimeModels } from "../../config/models.js";
import { runRiskMeshClosedLoop } from "./riskMesh.js";

export interface OfflineQueryInput {
  question: string;
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

export function answerOfflineQuery(input: OfflineQueryInput): OfflineQueryAnswer {
  const normalizedQuestion = input.question.trim();
  const normalizedLower = normalizedQuestion.toLowerCase();
  const asksForHarborRisk =
    normalizedLower.includes("harbor") || normalizedLower.includes("blocked") || normalizedLower.includes("risk");

  if (asksForHarborRisk) {
    const riskRun = runRiskMeshClosedLoop();
    const recordIds = Array.from(
      new Set([...riskRun.sentinel.recordIds, ...riskRun.arbitration.recordIds, ...riskRun.holdAction.recordIds, "LEDGER-6-PARTIAL-HOLD"])
    );

    return {
      status: "disabled_offline_safe",
      answer:
        `Harbor is staged for human-reviewed Risk Mesh handling from cited audit and cockpit state. Runtime ranking remains blocked by ${riskRun.sentinel.reason} and ${riskRun.arbitration.reason}, so the offline harness reports the DB-backed loader and VERIFY-PROD calibration dependencies instead of activating ranking.`,
      citationParity: sameRecordIdCitationParity(recordIds),
      recordIds,
      deterministicBasis:
        "audit.read + core.riskMeshClosedLoop staged records; owner-ratified config-as-code seed rows exist, while DB-backed runtime config loading, runtime credentials, and HITL query policy remain blocked.",
      modelExecution: "blocked: offline build does not invoke live model calls",
      plannedModels: {
        voice: runtimeModels.realtime,
        text: runtimeModels.fast
      }
    };
  }

  return {
    status: "disabled_offline_safe",
    answer:
      normalizedQuestion.length === 0
        ? "Conversational query is staged for offline demo only; no live model call was made."
        : "Conversational query is staged for offline demo only; use the cockpit records and audit trail for cited evidence.",
    citationParity: sameRecordIdCitationParity(["SYNTHETIC-SEED-42"]),
    recordIds: ["SYNTHETIC-SEED-42"],
    deterministicBasis: "Offline harness blocks Realtime/text model execution until runtime credentials and HITL query policy are configured.",
    modelExecution: "blocked: offline build does not invoke live model calls",
    plannedModels: {
      voice: runtimeModels.realtime,
      text: runtimeModels.fast
    }
  };
}

function sameRecordIdCitationParity(recordIds: readonly string[]): CitationParity {
  const citedRecordIds = [...recordIds];

  return {
    textRecordIds: citedRecordIds,
    voiceRecordIds: [...citedRecordIds],
    parity: "same_record_ids"
  };
}

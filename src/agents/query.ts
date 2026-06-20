import { runtimeModels } from "../../config/models.js";
import { runRiskMeshClosedLoop } from "./riskMesh.js";

export interface OfflineQueryInput {
  question: string;
}

export interface OfflineQueryAnswer {
  status: "disabled_offline_safe";
  answer: string;
  recordIds: string[];
  deterministicBasis: string;
  modelExecution: "blocked: offline build does not invoke live model calls";
  plannedModels: {
    voice: typeof runtimeModels.realtime;
    text: typeof runtimeModels.fast;
  };
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
        `Harbor is staged for human-reviewed Risk Mesh handling from cited audit and cockpit state. The live risk narrative remains blocked by r-score-weights-unset and ${riskRun.arbitration.reason}, so the offline harness reports the dependencies instead of inventing expert-owned weights.`,
      recordIds,
      deterministicBasis:
        "audit.read + core.riskMeshClosedLoop staged records; Realtime/text execution is blocked until runtime credentials and HITL query policy are configured.",
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
    recordIds: ["SYNTHETIC-SEED-42"],
    deterministicBasis: "Offline harness blocks Realtime/text model execution until runtime credentials and HITL query policy are configured.",
    modelExecution: "blocked: offline build does not invoke live model calls",
    plannedModels: {
      voice: runtimeModels.realtime,
      text: runtimeModels.fast
    }
  };
}

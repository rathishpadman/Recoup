import type { GovernedConfigValues, GovernedDecisionEvalBars } from "../config/governed.js";
import type { SourcePort } from "../src/adapters/source.js";
import {
  ReleaseEvalLabelManifestSchema,
  type ReleaseOwnerInputSnapshot,
  type RunControlConfig
} from "../config/releaseOwnerInputs.js";
import { runRiskMeshClosedLoop, type RiskMeshClosedLoopRun } from "../src/agents/riskMesh.js";
import type { ArbitrationResult } from "../src/core/arbitration.js";
import { evaluateGamingCandidate } from "../src/core/risk.js";
import { buildRunControlStatus } from "../src/services/conductor.js";
import type { DeductionLine } from "../src/types/entities.js";
import {
  buildAccuracyBarReport,
  buildCanonicalDeductionValidityCases,
  buildReleaseReadinessReport,
  type IntentLabel,
  type MetricCase,
  type ReleaseReadinessReport
} from "./harness.js";

const LABEL_MANIFEST_UNAVAILABLE_CASE_COUNT = Number.POSITIVE_INFINITY;

type ArbitrationEvalLabel = ReleaseOwnerInputSnapshot["arbitrationLabels"]["labels"][number];
type ReleaseArbitrationEvalRun = Omit<RiskMeshClosedLoopRun, "arbitration"> & {
  arbitration: ArbitrationResult;
};

export interface CurrentReleaseReadinessInput {
  accuracyBars?: GovernedDecisionEvalBars;
  arbitrationCases?: Array<MetricCase<string>>;
  intentCases?: Array<MetricCase<IntentLabel>>;
  labelManifest?: unknown;
  governedConfig?: GovernedConfigValues;
  releaseOwnerInputs?: ReleaseOwnerInputSnapshot;
  runControlConfig?: RunControlConfig;
  source?: SourcePort;
}

export type ReleaseLabelManifestRequirement =
  | {
      status: "blocked";
      reason: "owner-eval-label-manifest-unavailable";
      requiredIntentLabelCount: number;
      requiredArbitrationLabelCount: number;
    }
  | {
      status: "pass";
      approvedBy: string;
      requiredIntentLabelCount: number;
      requiredArbitrationLabelCount: number;
    };

export interface ReleaseOwnerInputRequestItem {
  inputId: string;
  ownerSource: string;
  requestedInput: string;
  requiredFor: string[];
}

export interface ReleaseOwnerInputRequest {
  releaseGateInputs: ReleaseOwnerInputRequestItem[];
  safetyNotes: string[];
}

export function buildCurrentReleaseReadinessReport(input: CurrentReleaseReadinessInput = {}): ReleaseReadinessReport {
  const settlementRun = input.source?.loadSettlementRun();
  const labelManifest = buildReleaseLabelManifestRequirement(input.labelManifest ?? input.releaseOwnerInputs?.labelManifest);
  const governedConfig = input.governedConfig;
  const thresholds = input.accuracyBars ?? governedConfig?.accuracyBars;
  const accuracyBars =
    thresholds === undefined
      ? buildBlockedAccuracyBarReport("governed accuracy bars unavailable")
      : settlementRun === undefined
      ? buildBlockedAccuracyBarReport("Supabase settlement source rows unavailable")
      : buildAccuracyBarReport({
          deductionValidityCases: buildCanonicalDeductionValidityCases(settlementRun.deductionLines),
          intentCases:
            input.intentCases ??
            buildReleaseIntentCases(input.releaseOwnerInputs, settlementRun.deductionLines, governedConfig, input.source),
          arbitrationCases: input.arbitrationCases ?? buildReleaseArbitrationCases(input.releaseOwnerInputs, governedConfig, input.source),
          thresholds,
          requiredIntentLabelCount: labelManifest.requiredIntentLabelCount,
          requiredArbitrationLabelCount: labelManifest.requiredArbitrationLabelCount
        });

  return buildReleaseReadinessReport({
    runControl: buildRunControlStatus(input.runControlConfig ?? input.releaseOwnerInputs?.runControlConfig),
    accuracyBars
  });
}

function buildBlockedAccuracyBarReport(reason: string) {
  return {
    arbitrationAgreement: { status: "blocked", reason },
    deductionValidity: { status: "blocked", reason },
    intentPrecision: { status: "blocked", reason }
  } as const;
}

export function formatReleaseReadinessReport(report: ReleaseReadinessReport): string {
  return JSON.stringify(report, null, 2);
}

export function buildReleaseLabelManifestRequirement(manifest?: unknown): ReleaseLabelManifestRequirement {
  if (manifest !== undefined) {
    const parsedManifest = ReleaseEvalLabelManifestSchema.parse(manifest);
    return {
      status: "pass",
      approvedBy: parsedManifest.approvedBy,
      requiredIntentLabelCount: parsedManifest.intentCaseIds.length,
      requiredArbitrationLabelCount: parsedManifest.arbitrationCaseIds.length
    };
  }

  return {
    status: "blocked",
    reason: "owner-eval-label-manifest-unavailable",
    requiredIntentLabelCount: LABEL_MANIFEST_UNAVAILABLE_CASE_COUNT,
    requiredArbitrationLabelCount: LABEL_MANIFEST_UNAVAILABLE_CASE_COUNT
  };
}

export function buildReleaseIntentCases(
  releaseOwnerInputs: ReleaseOwnerInputSnapshot | undefined,
  deductionLines: DeductionLine[],
  governedConfig: GovernedConfigValues | undefined,
  source: SourcePort | undefined
): Array<MetricCase<IntentLabel>> {
  if (releaseOwnerInputs === undefined || governedConfig === undefined || source === undefined) {
    return [];
  }

  return releaseOwnerInputs.intentLabels.labels.map((label) => ({
    actual: label.actual,
    predicted: predictIntentLabel(label.modelCustomerId, deductionLines, governedConfig, source)
  }));
}

export function buildReleaseArbitrationCases(
  releaseOwnerInputs: ReleaseOwnerInputSnapshot | undefined,
  governedConfig: GovernedConfigValues | undefined,
  source: SourcePort | undefined,
  riskRun?: ReleaseArbitrationEvalRun
): Array<MetricCase<string>> {
  if (releaseOwnerInputs === undefined || governedConfig === undefined || source === undefined) {
    return [];
  }

  const run = riskRun ?? runRiskMeshClosedLoop({ governedConfig, source });
  const includeRanking = run.arbitration.status === "ranked";

  return releaseOwnerInputs.arbitrationLabels.labels.map((label) => ({
    actual: buildExpectedArbitrationEvalLabel(label, includeRanking),
    predicted: buildHarborArbitrationEvalLabel(run, label.modelCaseId)
  }));
}

function predictIntentLabel(
  customerId: string,
  deductionLines: DeductionLine[],
  governedConfig: GovernedConfigValues,
  source: SourcePort
): IntentLabel {
  if (customerId === "CUST-HARBOR") {
    const snapshot = source.loadRiskObservationSnapshot(customerId);
    if (snapshot === undefined) {
      throw new Error("Release readiness Harbor intent prediction requires Supabase risk source rows.");
    }

    return snapshot.observedSignals.currentDsoDays > snapshot.observedSignals.baselineDsoDays
      ? "distressed-honest"
      : "genuine";
  }

  const gamingAssessment = evaluateGamingCandidate({
    customerId,
    deductionLines,
    gate: governedConfig.gamingGate
  });

  return gamingAssessment.candidate ? "gaming" : "genuine";
}

function buildExpectedArbitrationEvalLabel(label: ArbitrationEvalLabel, includeRanking: boolean): string {
  if (!includeRanking) {
    return label.actual;
  }

  return `${label.actual}|ranking=${label.expectedRanking.join(">")}`;
}

function buildHarborArbitrationEvalLabel(run: ReleaseArbitrationEvalRun, modelCaseId: string): string {
  if (run.arbitration.caseId !== modelCaseId) {
    return `unsupported-arbitration-case:${modelCaseId}`;
  }

  const baseLabel = [
    `partial-release-${run.partialHold.releaseRatioPercent.toFixed(0)}`,
    `ship=${run.holdAction.proposedReleaseAmount.toFixed(2)}`,
    `backorder=${run.holdAction.proposedBackOrderAmount.toFixed(2)}`,
    `terms=${run.termsAction.terms}`
  ].join("|");

  if (run.arbitration.status !== "ranked") {
    return baseLabel;
  }

  return `${baseLabel}|ranking=${run.arbitration.rankedOptions.map((option) => option.optionId).join(">")}`;
}

export function buildReleaseOwnerInputRequest(): ReleaseOwnerInputRequest {
  return {
    releaseGateInputs: [
      {
        inputId: "run-control-token-budget",
        ownerSource: "Appendix G",
        requestedInput: "Owner-approved token budget per runtime phase or agent.",
        requiredFor: ["I-16", "verify:release"]
      },
      {
        inputId: "run-control-step-budget",
        ownerSource: "Appendix G",
        requestedInput: "Owner-approved step budget per runtime phase or agent.",
        requiredFor: ["I-16", "verify:release"]
      },
      {
        inputId: "run-control-retry-cap",
        ownerSource: "Appendix G",
        requestedInput: "Owner-approved retry cap per runtime phase or tool.",
        requiredFor: ["I-16", "verify:release"]
      },
      {
        inputId: "eval-label-manifest",
        ownerSource: "Expert eval labels",
        requestedInput: "Owner-approved manifest of required intent and arbitration eval case IDs/counts.",
        requiredFor: ["I-28", "verify:release"]
      },
      {
        inputId: "complete-intent-labels",
        ownerSource: "Expert eval labels",
        requestedInput: "Complete customer intent labels for the manifest-defined demo evaluation set.",
        requiredFor: ["I-19", "I-28", "verify:release"]
      },
      {
        inputId: "complete-arbitration-labels",
        ownerSource: "Expert eval labels",
        requestedInput: "Complete expert arbitration labels for the manifest-defined Risk Mesh demo evaluation set.",
        requiredFor: ["I-21", "I-28", "verify:release"]
      }
    ],
    safetyNotes: [
      "Do not paste secrets or credentials.",
      "Do not include ERP write-back instructions.",
      "Do not ask Codex to invent budgets, thresholds, or labels."
    ]
  };
}

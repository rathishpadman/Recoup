import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import {
  buildReleaseArbitrationCases,
  buildReleaseIntentCases,
  buildCurrentReleaseReadinessReport,
  buildReleaseLabelManifestRequirement,
  buildReleaseOwnerInputRequest,
  formatReleaseReadinessReport
} from "../../evals/releaseReadiness.js";
import type { ReleaseOwnerInputSnapshot } from "../../config/releaseOwnerInputs.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runRiskMeshClosedLoop } from "../../src/agents/riskMesh.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("release readiness CLI support", () => {
  it("surfaces the current owner-bound release blockers", () => {
    const report = buildCurrentReleaseReadinessReport({ governedConfig, source });

    expect(report.status).toBe("fail");
    if (report.status !== "fail") {
      throw new Error("Expected current release readiness to fail until owner inputs are supplied");
    }

    expect(report.blockers).toEqual([
      {
        gate: "run-control",
        reason: "appendix-g-run-control-unset",
        openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"]
      },
      {
        gate: "intent-precision",
        reason: "complete intent labels unavailable"
      },
      {
        gate: "arbitration-agreement",
        reason: "arbitration expert labels unavailable"
      }
    ]);
  });

  it("formats failing release readiness without losing blocker reasons", () => {
    const output = formatReleaseReadinessReport(buildCurrentReleaseReadinessReport({ governedConfig, source }));

    expect(output).toContain("appendix-g-run-control-unset");
    expect(output).toContain("complete intent labels unavailable");
    expect(output).toContain("arbitration expert labels unavailable");
  });

  it("keeps one-label partial eval sets blocked until an owner manifest defines completeness", () => {
    const report = buildCurrentReleaseReadinessReport({
      arbitrationCases: [{ actual: "approve", predicted: "approve" }],
      governedConfig,
      intentCases: [{ actual: "gaming", predicted: "gaming" }],
      source
    });

    expect(report.status).toBe("fail");
    if (report.status !== "fail") {
      throw new Error("Expected partial label sets to remain release-blocked without an owner manifest");
    }

    expect(report.blockers).toEqual([
      {
        gate: "run-control",
        reason: "appendix-g-run-control-unset",
        openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"]
      },
      {
        gate: "intent-precision",
        reason: "complete intent labels unavailable"
      },
      {
        gate: "arbitration-agreement",
        reason: "arbitration expert labels unavailable"
      }
    ]);
  });

  it("fails closed when governed accuracy bars are not supplied by config or DB", () => {
    const report = buildCurrentReleaseReadinessReport();

    expect(report.status).toBe("fail");
    if (report.status !== "fail") {
      throw new Error("Expected release readiness to fail without governed accuracy bars.");
    }
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        { gate: "deduction-validity", reason: "governed accuracy bars unavailable" },
        { gate: "intent-precision", reason: "governed accuracy bars unavailable" },
        { gate: "arbitration-agreement", reason: "governed accuracy bars unavailable" }
      ])
    );
  });

  it("keeps eval label completeness blocked until an owner manifest supplies expected counts", () => {
    expect(buildReleaseLabelManifestRequirement()).toEqual({
      requiredArbitrationLabelCount: Number.POSITIVE_INFINITY,
      requiredIntentLabelCount: Number.POSITIVE_INFINITY,
      reason: "owner-eval-label-manifest-unavailable",
      status: "blocked"
    });
  });

  it("passes release readiness only when DB-backed run-control config and manifest-complete labels are supplied", () => {
    expect(
      buildCurrentReleaseReadinessReport({
        governedConfig,
        releaseOwnerInputs: buildOwnerInputSnapshotFixture(),
        source
      })
    ).toEqual({ status: "pass", blockers: [] });
  });

  it("derives release eval predictions from deterministic code instead of copying owner labels", () => {
    const releaseOwnerInputs = buildOwnerInputSnapshotFixture();
    const dataset = source.loadSettlementRun();

    expect(buildReleaseIntentCases(releaseOwnerInputs, dataset.deductionLines, governedConfig, source)).toEqual([
      { actual: "gaming", predicted: "gaming" },
      { actual: "distressed-honest", predicted: "distressed-honest" },
      { actual: "genuine", predicted: "genuine" },
      { actual: "genuine", predicted: "genuine" }
    ]);
    expect(buildReleaseArbitrationCases(releaseOwnerInputs, governedConfig, source)).toEqual([
      {
        actual:
          "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit|ranking=partial_release_55>full_release_revised_terms>full_release_100>full_hold_0",
        predicted:
          "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit|ranking=partial_release_55>full_release_revised_terms>full_release_100>full_hold_0"
      }
    ]);
  });

  it("compares owner expectedRanking when deterministic arbitration produces ranked options", () => {
    const releaseOwnerInputs = buildOwnerInputSnapshotFixture();
    const baseRun = runRiskMeshClosedLoop({ governedConfig, source });
    const rankedRun = {
      ...baseRun,
      arbitration: {
        caseId: "ARB-HARBOR-ORDER-640K",
        deterministicBasis: {
          formula: "sum(optionValue * expertWeight)" as const,
          positionCount: 4,
          weightSource: governedConfig.arbitrationWeights
        },
        rankedOptions: [
          { contributions: [], optionId: "partial_release_55", recordIds: ["6534"], weightedValue: "0.7575" },
          { contributions: [], optionId: "full_release_revised_terms", recordIds: ["6534"], weightedValue: "0.6600" },
          { contributions: [], optionId: "full_release_100", recordIds: ["6534"], weightedValue: "0.5500" },
          {
            contributions: [],
            optionId: "full_hold_0",
            recordIds: ["6534"],
            weightedValue: "0.4925"
          }
        ],
        recordIds: ["6534"],
        resolution: "partial_release_55",
        status: "ranked" as const
      }
    };

    expect(buildReleaseArbitrationCases(releaseOwnerInputs, governedConfig, source, rankedRun)).toEqual([
      {
        actual:
          "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit|ranking=partial_release_55>full_release_revised_terms>full_release_100>full_hold_0",
        predicted:
          "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit|ranking=partial_release_55>full_release_revised_terms>full_release_100>full_hold_0"
      }
    ]);
  });

  it("describes the owner inputs needed to unblock release readiness without supplying values", () => {
    expect(buildReleaseOwnerInputRequest()).toEqual({
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
    });
  });
});

function buildOwnerInputSnapshotFixture(): ReleaseOwnerInputSnapshot {
  return {
    arbitrationLabels: {
      approvedBy: "human:rathish-owner",
      labels: [
        {
          actual: "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit",
          caseId: "arb:harbor-order-6534",
          expectedRanking: ["partial_release_55", "full_release_revised_terms", "full_release_100", "full_hold_0"],
          modelCaseId: "ARB-HARBOR-ORDER-640K",
          recordIds: ["6534", "USCU_S04", "LEDGER-6-PARTIAL-HOLD"],
          sapOrderId: "6534"
        }
      ]
    },
    labelManifest: {
      approvedBy: "human:rathish-owner",
      arbitrationCaseIds: ["arb:harbor-order-6534"],
      intentCaseIds: ["intent:USCU_L10", "intent:USCU_S04", "intent:USCU_S07", "intent:USCU_S03"]
    },
    rowHashes: {
      arbitration_eval_labels: "246b86ea6db527a4209956412a8e92bb1726dbc0d7124c6953712e88ede22a0d",
      intent_eval_labels: "a0038f6bcb79cade73cb5264c41c28ba1a223063ee67779fbfd196214893efc6",
      release_eval_label_manifest: "66ae8d96a0ece2964fc7283d75212098f120b24b048bcce1f0dc103913663e82",
      run_control: "77dfb2833f50f78331984258e15ec5477feb8a330a13db6f5cdc551bb980b6d5"
    },
    runControlConfig: {
      approvedBy: "human:rathish-owner",
      phases: {
        containment: { retryCap: 2, stepBudget: 24, tokenBudget: 45000 },
        forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 },
        query: { retryCap: 1, stepBudget: 12, tokenBudget: 32000 },
        recovery: { retryCap: 2, stepBudget: 40, tokenBudget: 90000 },
        riskMesh: { retryCap: 2, stepBudget: 36, tokenBudget: 90000 },
        sentinel: { retryCap: 2, stepBudget: 30, tokenBudget: 70000 }
      }
    },
    intentLabels: {
      approvedBy: "human:rathish-owner",
      labels: [
        {
          actual: "gaming",
          caseId: "intent:USCU_L10",
          modelCustomerId: "CUST-CRESTLINE",
          recordIds: ["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"],
          sapCustomerId: "USCU_L10"
        },
        {
          actual: "distressed-honest",
          caseId: "intent:USCU_S04",
          modelCustomerId: "CUST-HARBOR",
          recordIds: ["FIN-DISP-202", "BUREAU-HARBOR-TAX-LIEN", "90000036", "90000085"],
          sapCustomerId: "USCU_S04"
        },
        {
          actual: "genuine",
          caseId: "intent:USCU_S07",
          modelCustomerId: "CUST-VALUMART",
          recordIds: ["S4-L1", "SLA-CONTRACT-1", "S5-L1", "POD-TIMESTAMP-1"],
          sapCustomerId: "USCU_S07"
        },
        {
          actual: "genuine",
          caseId: "intent:USCU_S03",
          modelCustomerId: "CUST-GREENLEAF",
          recordIds: ["S1-L1", "PHOTO-CARRIER-1", "POD-90000002"],
          sapCustomerId: "USCU_S03"
        }
      ]
    }
  };
}

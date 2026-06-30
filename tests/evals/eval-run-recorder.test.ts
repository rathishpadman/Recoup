import { describe, expect, it } from "vitest";
import type { ReleaseReadinessReport } from "../../evals/harness.js";
import {
  isEvalRunRecordingRequested,
  recordEvalRunSnapshot,
  RELEASE_READINESS_EVAL_GATES
} from "../../src/services/evalRunRecorder.js";
import type { EvalsFinopsRepository } from "../../src/services/evalsFinopsRepository.js";
import type { EvalGateResult, EvalGateRun } from "../../src/services/evalsFinopsTypes.js";

describe("eval run recorder", () => {
  it("records one eval run row and one result row per release-readiness gate", async () => {
    const repository = repositoryRecorder();
    const report: ReleaseReadinessReport = {
      blockers: [
        {
          gate: "run-control",
          openDependencies: ["run-control-token-budget"],
          reason: "run-control token budget unavailable"
        },
        {
          gate: "intent-precision",
          reason: "release-blocking metric below threshold",
          score: 0.82,
          threshold: 0.9
        }
      ],
      status: "fail"
    };

    const snapshot = await recordEvalRunSnapshot({
      branchName: "codex/evals-finops-governance",
      commitSha: "a".repeat(40),
      completedAt: "2026-06-30T10:00:01.000Z",
      repository,
      report,
      sourceMode: "live_supabase",
      startedAt: "2026-06-30T10:00:00.000Z"
    });

    expect(repository.evalRuns).toHaveLength(1);
    expect(repository.evalRuns[0]).toEqual(snapshot.run);
    expect(repository.evalRuns[0]).toMatchObject({
      branchName: "codex/evals-finops-governance",
      commitSha: "a".repeat(40),
      releaseStatus: "blocked",
      sourceMode: "live_supabase"
    });
    expect(repository.evalRuns[0]?.reportHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.run.recordIds).toEqual([`release-readiness-report:${snapshot.run.reportHash}`]);
    expect(repository.evalResults).toHaveLength(RELEASE_READINESS_EVAL_GATES.length);
    expect(repository.evalResults.map((result) => result.gate)).toEqual(RELEASE_READINESS_EVAL_GATES);
    expect(repository.evalResults.every((result) => result.evalRunId === repository.evalRuns[0]?.evalRunId)).toBe(true);
    expect(repository.evalResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockerReason: "run-control token budget unavailable",
          gate: "run-control",
          openDependencies: ["run-control-token-budget"],
          status: "blocked"
        }),
        expect.objectContaining({
          gate: "deduction-validity",
          openDependencies: [],
          status: "pass"
        }),
        expect.objectContaining({
          gate: "intent-precision",
          score: "0.82",
          status: "fail",
          threshold: "0.9"
        }),
        expect.objectContaining({
          gate: "arbitration-agreement",
          status: "pass"
        })
      ])
    );
  });

  it("does not invent owner labels, scores, or thresholds when a gate is blocked", async () => {
    const repository = repositoryRecorder();
    const report: ReleaseReadinessReport = {
      blockers: [
        {
          gate: "intent-precision",
          reason: "complete intent labels unavailable"
        }
      ],
      status: "fail"
    };

    await recordEvalRunSnapshot({
      completedAt: "2026-06-30T10:00:01.000Z",
      repository,
      report,
      sourceMode: "blocked",
      startedAt: "2026-06-30T10:00:00.000Z"
    });

    expect(repository.evalRuns[0]).toMatchObject({
      releaseStatus: "blocked",
      sourceMode: "blocked"
    });
    expect(repository.evalResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blockerReason: "complete intent labels unavailable",
          gate: "intent-precision",
          openDependencies: [],
          status: "blocked"
        })
      ])
    );
    const intentResult = repository.evalResults.find((result) => result.gate === "intent-precision");
    expect(intentResult).not.toHaveProperty("score");
    expect(intentResult).not.toHaveProperty("threshold");
    expect(JSON.stringify(repository.evalResults)).not.toContain("owner-approved");
  });

  it("requires an explicit env value or CLI flag before recording is enabled", () => {
    expect(isEvalRunRecordingRequested({ args: [], env: {} })).toBe(false);
    expect(isEvalRunRecordingRequested({ args: ["--dry-run"], env: { RECOUP_RECORD_EVAL_RUN: "false" } })).toBe(false);
    expect(isEvalRunRecordingRequested({ args: [], env: { RECOUP_RECORD_EVAL_RUN: "true" } })).toBe(true);
    expect(isEvalRunRecordingRequested({ args: ["--record-eval-run"], env: {} })).toBe(true);
  });
});

function repositoryRecorder(): EvalsFinopsRepository & { evalResults: EvalGateResult[]; evalRuns: EvalGateRun[] } {
  const evalRuns: EvalGateRun[] = [];
  const evalResults: EvalGateResult[] = [];

  return {
    evalResults,
    evalRuns,
    listActiveModelPricing: () => Promise.resolve([]),
    listAgentUsageRuns: () => Promise.resolve([]),
    listDailyRollups: () => Promise.resolve([]),
    listEvalGateResults: () => Promise.resolve([]),
    listOpenAiCostBuckets: () => Promise.resolve([]),
    listOpenRecommendations: () => Promise.resolve([]),
    loadLatestEvalRun: () => Promise.resolve(undefined),
    upsertAgentUsageRun: () => Promise.resolve(),
    upsertEvalGateResults: (results) => {
      evalResults.push(...results);
      return Promise.resolve();
    },
    upsertEvalGateRun: (run) => {
      evalRuns.push(run);
      return Promise.resolve();
    }
  };
}

import { sha256CanonicalJson } from "../../config/governed.js";
import type { EvalsFinopsRepository } from "./evalsFinopsRepository.js";
import type { EvalGateName, EvalGateResult, EvalGateRun, EvalsFinopsStatus } from "./evalsFinopsTypes.js";

export const RELEASE_READINESS_EVAL_GATES = [
  "run-control",
  "deduction-validity",
  "intent-precision",
  "arbitration-agreement"
] as const satisfies readonly EvalGateName[];

export interface EvalRunRecordingRequest {
  args: string[];
  env: Record<string, string | undefined>;
}

export interface RecordEvalRunSnapshotInput {
  branchName?: string;
  commitSha?: string;
  completedAt: string;
  repository: EvalsFinopsRepository;
  report: RecordedReleaseReadinessReport;
  sourceMode: EvalGateRun["sourceMode"];
  startedAt: string;
}

export interface RecordEvalRunSnapshotResult {
  results: EvalGateResult[];
  run: EvalGateRun;
}

type ReleaseReadinessEvalGate = (typeof RELEASE_READINESS_EVAL_GATES)[number];
type RecordedReleaseReadinessBlocker = {
  gate: ReleaseReadinessEvalGate;
  openDependencies?: string[];
  reason: string;
  score?: number;
  threshold?: number;
};
type RecordedReleaseReadinessReport =
  | {
      blockers: [];
      status: "pass";
    }
  | {
      blockers: [RecordedReleaseReadinessBlocker, ...RecordedReleaseReadinessBlocker[]];
      status: "fail";
    };

export function isEvalRunRecordingRequested(input: EvalRunRecordingRequest): boolean {
  return input.env.RECOUP_RECORD_EVAL_RUN === "true" || input.args.includes("--record-eval-run");
}

export async function recordEvalRunSnapshot(input: RecordEvalRunSnapshotInput): Promise<RecordEvalRunSnapshotResult> {
  const reportHash = sha256CanonicalJson(input.report);
  const evalRunId = `eval-run-${sha256CanonicalJson({
    branchName: input.branchName,
    commitSha: input.commitSha,
    completedAt: input.completedAt,
    reportHash,
    sourceMode: input.sourceMode,
    startedAt: input.startedAt
  }).slice(0, 24)}`;
  const recordIds = [`release-readiness-report:${reportHash}`];
  const blockerByGate = new Map<ReleaseReadinessEvalGate, RecordedReleaseReadinessBlocker>(
    input.report.status === "pass" ? [] : input.report.blockers.map((blocker) => [blocker.gate, blocker])
  );

  const run: EvalGateRun = {
    ...(input.branchName === undefined ? {} : { branchName: input.branchName }),
    ...(input.commitSha === undefined ? {} : { commitSha: input.commitSha }),
    completedAt: input.completedAt,
    deterministicBasis:
      "evals/releaseReadiness.ts buildCurrentReleaseReadinessReport snapshot; blocked gates keep missing owner inputs absent",
    evalRunId,
    recordIds,
    releaseStatus: releaseStatusForReport(input.report),
    reportHash,
    reportJson: input.report,
    sourceMode: input.sourceMode,
    startedAt: input.startedAt
  };
  const results = RELEASE_READINESS_EVAL_GATES.map((gate) =>
    buildGateResult({
      blocker: blockerByGate.get(gate),
      evalRunId,
      gate,
      recordIds
    })
  );

  await input.repository.upsertEvalGateRun(run);
  await input.repository.upsertEvalGateResults(results);

  return { results, run };
}

function buildGateResult(input: {
  blocker: RecordedReleaseReadinessBlocker | undefined;
  evalRunId: string;
  gate: ReleaseReadinessEvalGate;
  recordIds: string[];
}): EvalGateResult {
  const status = gateStatusForBlocker(input.blocker);
  const result: EvalGateResult = {
    deterministicBasis: deterministicBasisForGate(input.gate, status),
    evalGateResultId: `eval-gate-result-${sha256CanonicalJson({
      evalRunId: input.evalRunId,
      gate: input.gate
    }).slice(0, 24)}`,
    evalRunId: input.evalRunId,
    gate: input.gate,
    openDependencies: input.blocker?.openDependencies ?? [],
    recordIds: [...input.recordIds, `release-readiness-gate:${input.gate}`],
    status
  };

  if (input.blocker !== undefined) {
    result.blockerReason = input.blocker.reason;
  }
  if (input.blocker?.score !== undefined && input.blocker.threshold !== undefined) {
    result.score = String(input.blocker.score);
    result.threshold = String(input.blocker.threshold);
  }

  return result;
}

function releaseStatusForReport(report: RecordedReleaseReadinessReport): EvalsFinopsStatus {
  if (report.status === "pass") {
    return "pass";
  }

  return report.blockers.some((blocker) => gateStatusForBlocker(blocker) === "blocked") ? "blocked" : "fail";
}

function gateStatusForBlocker(blocker: RecordedReleaseReadinessBlocker | undefined): EvalsFinopsStatus {
  if (blocker === undefined) {
    return "pass";
  }

  return blocker.score !== undefined && blocker.threshold !== undefined ? "fail" : "blocked";
}

function deterministicBasisForGate(gate: ReleaseReadinessEvalGate, status: EvalsFinopsStatus): string {
  if (status === "pass") {
    return `evals/releaseReadiness.ts reported no blocker for ${gate}`;
  }
  if (status === "fail") {
    return `evals/releaseReadiness.ts numeric release-blocking metric for ${gate}`;
  }

  return `evals/releaseReadiness.ts blocked ${gate} without synthesized labels, scores, or thresholds`;
}

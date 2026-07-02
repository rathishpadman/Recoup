import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadLocalRuntimeEnvFiles } from "../config/env.js";
import {
  createSupabaseGovernedConfigRepositoryFromEnv,
  createSupabaseReleaseOwnerInputRepositoryFromEnv
} from "../src/memory/supabaseStore.js";
import { createSupabaseEvalsFinopsRepositoryFromEnv } from "../src/services/evalsFinopsRepository.js";
import { isEvalRunRecordingRequested, recordEvalRunSnapshot } from "../src/services/evalRunRecorder.js";
import type { GovernedConfigValues } from "../config/governed.js";
import {
  createSupabaseRiskObservationSnapshotReaderFromEnv,
  createSupabaseSettlementRunReaderFromEnv,
  sourcePortFromSupabaseSnapshots,
  type SupabaseRiskObservationSourceConfig
} from "../src/adapters/supabaseSyntheticSource.js";
import { readReconciliationMode } from "../config/reconciliationRollout.js";
import { createLegacySupabaseSettlementRunReaderFromEnv } from "../src/adapters/legacySupabaseSettlementRunReader.js";
import { buildCurrentReleaseReadinessReport, formatReleaseReadinessReport } from "./releaseReadiness.js";

const envFilePaths = [".env", ".env.local"].filter((path) => existsSync(path));
const env = loadLocalRuntimeEnvFiles(envFilePaths, process.env);
const startedAt = new Date().toISOString();
const governedConfigRepository = createSupabaseGovernedConfigRepositoryFromEnv(env);
const releaseOwnerInputRepository = createSupabaseReleaseOwnerInputRepositoryFromEnv(env);
const governedConfig = governedConfigRepository === undefined ? undefined : await governedConfigRepository.loadActive();
const releaseOwnerInputs =
  releaseOwnerInputRepository === undefined ? undefined : await releaseOwnerInputRepository.loadActive();
const source = governedConfig === undefined ? undefined : await loadReleaseReadinessSource(env, governedConfig.values);
const report = buildCurrentReleaseReadinessReport({
  ...(governedConfig === undefined ? {} : { governedConfig: governedConfig.values }),
  ...(releaseOwnerInputs === undefined ? {} : { releaseOwnerInputs }),
  ...(source === undefined ? {} : { source })
});
const completedAt = new Date().toISOString();

if (isEvalRunRecordingRequested({ args: process.argv.slice(2), env })) {
  const evalsFinopsRepository = createSupabaseEvalsFinopsRepositoryFromEnv(env);
  if (evalsFinopsRepository === undefined) {
    console.error("Recoup eval run recording requested, but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured.");
    process.exitCode = 1;
  } else {
    await recordEvalRunSnapshot({
      ...loadGitMetadata(),
      completedAt,
      repository: evalsFinopsRepository,
      report,
      sourceMode:
        governedConfig === undefined || releaseOwnerInputs === undefined || source === undefined ? "blocked" : "live_supabase",
      startedAt
    });
  }
}

if (report.status === "pass") {
  console.log("Recoup release readiness passed.");
} else {
  console.error("Recoup release readiness failed.");
  console.error(formatReleaseReadinessReport(report));
  process.exitCode = 1;
}

async function loadReleaseReadinessSource(env: Record<string, string | undefined>, governedConfig: GovernedConfigValues) {
  const settlementReader =
    readReconciliationMode(env) === "legacy"
      ? createLegacySupabaseSettlementRunReaderFromEnv(env, governedConfig.seed)
      : createSupabaseSettlementRunReaderFromEnv(env, governedConfig.seed);
  const riskReader = createSupabaseRiskObservationSnapshotReaderFromEnv(
    env,
    riskObservationSourcesFromGovernedConfig(governedConfig)
  );
  if (settlementReader === undefined || riskReader === undefined) {
    return undefined;
  }

  const [settlementRun, riskObservationSnapshot] = await Promise.all([
    settlementReader.loadSettlementRun(),
    riskReader.loadRiskObservationSnapshot(governedConfig.riskMeshCases.harbor.customerId)
  ]);
  if (riskObservationSnapshot === undefined) {
    return undefined;
  }

  return sourcePortFromSupabaseSnapshots({ riskObservationSnapshot, settlementRun });
}

function riskObservationSourcesFromGovernedConfig(
  governedConfig: GovernedConfigValues
): Record<string, SupabaseRiskObservationSourceConfig> {
  const harbor = governedConfig.riskMeshCases.harbor;

  return {
    [harbor.customerId]: {
      baselinePaymentRefs: [...harbor.riskObservationSource.baselinePaymentRefs],
      criticalAlertSeverity: harbor.riskObservationSource.criticalAlertSeverity,
      criticalAlertType: harbor.riskObservationSource.criticalAlertType,
      citedDeductionVerdicts: [...harbor.riskObservationSource.citedDeductionVerdicts],
      currentPaymentRef: harbor.riskObservationSource.currentPaymentRef,
      sourceCustomerId: harbor.riskObservationSource.sourceCustomerId
    }
  };
}

function loadGitMetadata(): { branchName?: string; commitSha?: string } {
  const branchName = readGitValue(["branch", "--show-current"]);
  const commitSha = readGitValue(["rev-parse", "HEAD"]);

  return {
    ...(branchName === undefined ? {} : { branchName }),
    ...(commitSha === undefined ? {} : { commitSha })
  };
}

function readGitValue(args: string[]): string | undefined {
  try {
    const value = execFileSync("git", args, { encoding: "utf8" }).trim();
    return value.length === 0 ? undefined : value;
  } catch {
    return undefined;
  }
}

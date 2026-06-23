import { existsSync } from "node:fs";
import { loadLocalRuntimeEnvFiles } from "../config/env.js";
import {
  createSupabaseGovernedConfigRepositoryFromEnv,
  createSupabaseReleaseOwnerInputRepositoryFromEnv
} from "../src/memory/supabaseStore.js";
import type { GovernedConfigValues } from "../config/governed.js";
import {
  createSupabaseRiskObservationSnapshotReaderFromEnv,
  createSupabaseSettlementRunReaderFromEnv,
  sourcePortFromSupabaseSnapshots,
  type SupabaseRiskObservationSourceConfig
} from "../src/adapters/supabaseSyntheticSource.js";
import { buildCurrentReleaseReadinessReport, formatReleaseReadinessReport } from "./releaseReadiness.js";

const envFilePaths = [".env", ".env.local"].filter((path) => existsSync(path));
const env = loadLocalRuntimeEnvFiles(envFilePaths, process.env);
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

if (report.status === "pass") {
  console.log("Recoup release readiness passed.");
} else {
  console.error("Recoup release readiness failed.");
  console.error(formatReleaseReadinessReport(report));
  process.exitCode = 1;
}

async function loadReleaseReadinessSource(env: Record<string, string | undefined>, governedConfig: GovernedConfigValues) {
  const settlementReader = createSupabaseSettlementRunReaderFromEnv(env, governedConfig.seed);
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

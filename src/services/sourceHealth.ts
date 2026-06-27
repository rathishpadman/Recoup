import type { RuntimeEnv } from "../../config/env.js";
import {
  buildConnectorReadiness,
  type ConnectorReadiness,
  type SupabaseToolDataSchemaProbe
} from "../adapters/connectorRegistry.js";
import {
  createSapODataConnectionFromEnv,
  SapODataReadOnlyClient
} from "../adapters/sapOData.js";

export interface SourceHealthResult {
  sourceName: string;
  status: "connected" | "degraded" | "blocked";
  sourceMode: "live" | "synthetic_static_table" | "unavailable";
  checkedAtIso: string;
  latencyMs: number;
  proofItems: string[];
  recordIds: string[];
  lastError?: string;
}

export interface SourceHealthOptions {
  availableCredentialEnvNames?: readonly string[];
  env?: RuntimeEnv;
  fetcher?: typeof fetch | undefined;
  now?: () => Date;
  sapMetadataProbeTimeoutMs?: number;
  timeoutAfter?: SourceHealthTimeoutAfter;
  toolDataSchemaProbe?: SupabaseToolDataSchemaProbe | undefined;
}

export interface SourceHealthSnapshotStore {
  loadLatest(): Promise<SourceHealthResult[]>;
  upsert(results: readonly SourceHealthResult[]): Promise<void>;
}

export type SourceHealthTimeoutAfter = (timeoutMs: number, label: string) => Promise<never>;

const sapHealthMetadataServiceName = "ZUI_BILLINGDOCUMENTFS_0001";
const sapMetadataProbeTimeoutLabel = "SAP OData metadata probe";
const defaultSapMetadataProbeTimeoutMs = 5_000;
export const defaultSourceHealthSnapshotMaxAgeMs = 15 * 60 * 1000;

export async function buildSourceHealthResults(options: SourceHealthOptions = {}): Promise<SourceHealthResult[]> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const availableCredentialEnvNames = options.availableCredentialEnvNames ?? readConfiguredEnvNames(env);
  const connectors = buildConnectorReadiness([], availableCredentialEnvNames, options.toolDataSchemaProbe);

  return Promise.all(
    connectors.map(async (connector) => {
      if (connector.name !== "sap-odata") {
        return sourceHealthFromConnector(connector, now().toISOString());
      }

      return probeSapODataHealth(connector, {
        env,
        fetcher: options.fetcher,
        now,
        timeoutAfter: options.timeoutAfter ?? defaultTimeoutAfter,
        timeoutMs: options.sapMetadataProbeTimeoutMs ?? defaultSapMetadataProbeTimeoutMs
      });
    })
  );
}

export async function buildSourceHealthResultsWithSnapshots(
  options: SourceHealthOptions & {
    snapshotMaxAgeMs?: number;
    snapshotStore?: SourceHealthSnapshotStore | undefined;
  } = {}
): Promise<SourceHealthResult[]> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const availableCredentialEnvNames = options.availableCredentialEnvNames ?? readConfiguredEnvNames(env);
  const connectors = buildConnectorReadiness([], availableCredentialEnvNames, options.toolDataSchemaProbe);
  const snapshotStore = options.snapshotStore;
  const freshSnapshotsBySourceName = new Map<string, SourceHealthResult>();

  if (snapshotStore !== undefined) {
    const snapshotMaxAgeMs = options.snapshotMaxAgeMs ?? defaultSourceHealthSnapshotMaxAgeMs;
    const snapshots = await snapshotStore.loadLatest().catch(() => []);
    for (const snapshot of snapshots) {
      if (isFreshSourceHealthSnapshot(snapshot, now(), snapshotMaxAgeMs)) {
        freshSnapshotsBySourceName.set(snapshot.sourceName, withSourceHealthSnapshotProof(snapshot));
      }
    }
  }

  const probedResults: SourceHealthResult[] = [];
  const results = await Promise.all(
    connectors.map(async (connector) => {
      const freshSnapshot = freshSnapshotsBySourceName.get(connector.name);
      if (freshSnapshot !== undefined && connector.name !== "sap-odata") {
        return freshSnapshot;
      }

      if (connector.name !== "sap-odata") {
        return sourceHealthFromConnector(connector, now().toISOString());
      }

      const probed = await probeSapODataHealth(connector, {
        env,
        fetcher: options.fetcher,
        now,
        timeoutAfter: options.timeoutAfter ?? defaultTimeoutAfter,
        timeoutMs: options.sapMetadataProbeTimeoutMs ?? defaultSapMetadataProbeTimeoutMs
      });
      probedResults.push(probed);
      return probed;
    })
  );

  if (snapshotStore !== undefined && probedResults.length > 0) {
    await snapshotStore.upsert(probedResults);
  }

  return results;
}

export async function buildSourceHealthResultsFromSnapshots(
  options: SourceHealthOptions & {
    snapshotMaxAgeMs?: number;
    snapshotStore?: SourceHealthSnapshotStore | undefined;
  } = {}
): Promise<SourceHealthResult[]> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const checkedAtIso = now().toISOString();
  const availableCredentialEnvNames = options.availableCredentialEnvNames ?? readConfiguredEnvNames(env);
  const connectors = buildConnectorReadiness([], availableCredentialEnvNames, options.toolDataSchemaProbe);
  const connectorNames = new Set<string>(connectors.map((connector) => connector.name));
  const snapshotMaxAgeMs = options.snapshotMaxAgeMs ?? defaultSourceHealthSnapshotMaxAgeMs;
  const snapshots = options.snapshotStore === undefined ? [] : await options.snapshotStore.loadLatest().catch(() => []);
  const snapshotsBySourceName = new Map(snapshots.map((snapshot) => [snapshot.sourceName, snapshot]));

  const connectorResults = connectors.map((connector) => {
    const snapshot = snapshotsBySourceName.get(connector.name);
    if (snapshot !== undefined) {
      return sourceHealthFromSnapshot(snapshot, now(), snapshotMaxAgeMs);
    }

    return unavailableSourceHealthFromConnector(connector, checkedAtIso);
  });
  const extraSnapshotResults = snapshots
    .filter((snapshot) => !connectorNames.has(snapshot.sourceName))
    .map((snapshot) => sourceHealthFromSnapshot(snapshot, now(), snapshotMaxAgeMs));

  return [...connectorResults, ...extraSnapshotResults];
}

export function buildSourceHealthFromConnectorReadiness(
  connectors: readonly ConnectorReadiness[],
  checkedAtIso: string
): SourceHealthResult[] {
  return connectors.map((connector) => sourceHealthFromConnector(connector, checkedAtIso));
}

async function probeSapODataHealth(
  connector: ConnectorReadiness,
  options: {
    env: RuntimeEnv;
    fetcher?: typeof fetch | undefined;
    now: () => Date;
    timeoutAfter: SourceHealthTimeoutAfter;
    timeoutMs: number;
  }
): Promise<SourceHealthResult> {
  const startedAt = options.now();
  const checkedAtIso = startedAt.toISOString();
  if (connector.status !== "ready") {
    return withMeasuredLatency(startedAt, options.now, {
      checkedAtIso,
      lastError: missingSapCredentialsMessage(connector),
      latencyMs: 0,
      proofItems: ["credentials missing", "external writes blocked"],
      recordIds: sourceHealthRecordIds(connector),
      sourceMode: "unavailable",
      sourceName: connector.name,
      status: "blocked"
    });
  }

  try {
    const connection = createSapODataConnectionFromEnv(options.env);
    if (connection === undefined) {
      return withMeasuredLatency(startedAt, options.now, {
        checkedAtIso,
        lastError: "SAP OData credentials are not configured.",
        latencyMs: 0,
        proofItems: ["credentials missing", "external writes blocked"],
        recordIds: sourceHealthRecordIds(connector),
        sourceMode: "unavailable",
        sourceName: connector.name,
        status: "blocked"
      });
    }

    const client = new SapODataReadOnlyClient(
      connection,
      withBoundedSapProbeFetch(options.fetcher ?? fetch, options.timeoutMs, options.timeoutAfter)
    );
    await client.fetchMetadata(sapHealthMetadataServiceName);

    return withMeasuredLatency(startedAt, options.now, {
      checkedAtIso,
      latencyMs: 0,
      proofItems: ["read-only metadata probe", "credentials present", "external writes blocked"],
      recordIds: uniqueStrings([...sourceHealthRecordIds(connector), sapHealthMetadataServiceName]),
      sourceMode: "live",
      sourceName: connector.name,
      status: "connected"
    });
  } catch (error) {
    return withMeasuredLatency(startedAt, options.now, {
      checkedAtIso,
      lastError: redactEnvValues(errorMessage(error), options.env),
      latencyMs: 0,
      proofItems: ["read-only metadata probe", "external writes blocked", "source probe failed"],
      recordIds: uniqueStrings([...sourceHealthRecordIds(connector), sapHealthMetadataServiceName]),
      sourceMode: "unavailable",
      sourceName: connector.name,
      status: "blocked"
    });
  }
}

function sourceHealthFromConnector(connector: ConnectorReadiness, checkedAtIso: string): SourceHealthResult {
  const status = sourceStatusFromConnector(connector);
  const sourceMode = status === "connected" ? connector.sourceMode : "unavailable";
  const result = {
    checkedAtIso,
    latencyMs: 0,
    proofItems: sourceHealthProofItems(connector),
    recordIds: sourceHealthRecordIds(connector),
    sourceMode,
    sourceName: connector.name,
    status
  } satisfies SourceHealthResult;

  if (status === "connected") {
    return result;
  }

  return {
    ...result,
    lastError: connector.reason
  };
}

function sourceStatusFromConnector(connector: ConnectorReadiness): SourceHealthResult["status"] {
  if (connector.status === "ready" || connector.status === "ready_synthetic") {
    return "connected";
  }

  return connector.status === "blocked_schema_required" ? "degraded" : "blocked";
}

function sourceHealthProofItems(connector: ConnectorReadiness): string[] {
  const proofItems = ["read-only", "external writes blocked"];
  proofItems.push(connector.proof.credentialsConfigured ? "credentials present" : "credentials missing");
  proofItems.push(connector.proof.schemaValidated ? "schema probe passed" : "schema probe blocked");
  if (connector.sourceMode === "synthetic_static_table") {
    proofItems.push("synthetic labelled");
  }

  return proofItems;
}

function sourceHealthRecordIds(connector: ConnectorReadiness): string[] {
  return uniqueStrings([
    connector.name,
    ...connector.requiredInputs,
    ...connector.missingCredentialEnvNames,
    ...connector.missingSourceContractInputs,
    ...(connector.sourceTableName === undefined ? [] : [connector.sourceTableName]),
    ...(connector.toolDataTableNames ?? [])
  ]);
}

function withMeasuredLatency(resultStartedAt: Date, now: () => Date, result: SourceHealthResult): SourceHealthResult {
  return {
    ...result,
    latencyMs: Math.max(0, now().getTime() - resultStartedAt.getTime())
  };
}

function isFreshSourceHealthSnapshot(snapshot: SourceHealthResult, now: Date, snapshotMaxAgeMs: number): boolean {
  const checkedAtMs = Date.parse(snapshot.checkedAtIso);
  if (Number.isNaN(checkedAtMs)) {
    return false;
  }

  return now.getTime() - checkedAtMs <= snapshotMaxAgeMs;
}

function withSourceHealthSnapshotProof(snapshot: SourceHealthResult): SourceHealthResult {
  return {
    ...snapshot,
    proofItems: uniqueStrings([...snapshot.proofItems, "supabase source-health snapshot"]),
    recordIds: uniqueStrings([...snapshot.recordIds, `recoup_source_health_snapshots:${snapshot.sourceName}`])
  };
}

function sourceHealthFromSnapshot(
  snapshot: SourceHealthResult,
  now: Date,
  snapshotMaxAgeMs: number
): SourceHealthResult {
  const withSnapshotProof = withSourceHealthSnapshotProof(snapshot);
  if (isFreshSourceHealthSnapshot(snapshot, now, snapshotMaxAgeMs)) {
    return withSnapshotProof;
  }

  return {
    ...withSnapshotProof,
    proofItems: uniqueStrings([...withSnapshotProof.proofItems, "source-health refresh overdue"])
  };
}

function unavailableSourceHealthFromConnector(
  connector: ConnectorReadiness,
  checkedAtIso: string
): SourceHealthResult {
  return {
    checkedAtIso,
    lastError: "Source health status unavailable until the background refresh stores a snapshot.",
    latencyMs: 0,
    proofItems: ["source-health status unavailable", "external writes blocked"],
    recordIds: uniqueStrings([...sourceHealthRecordIds(connector), `recoup_source_health_snapshots:${connector.name}`]),
    sourceMode: "unavailable",
    sourceName: connector.name,
    status: "blocked"
  };
}

function missingSapCredentialsMessage(connector: ConnectorReadiness): string {
  const missingInputs = uniqueStrings([...connector.missingCredentialEnvNames, ...connector.missingSourceContractInputs]);
  if (missingInputs.length === 0) {
    return "SAP OData credentials are not configured.";
  }

  return `SAP OData credentials are not configured; missing ${missingInputs.join(", ")}.`;
}

function readConfiguredEnvNames(env: RuntimeEnv): string[] {
  return Object.entries(env)
    .filter(([, value]) => value !== undefined && value.trim().length > 0)
    .map(([key]) => key);
}

function withBoundedSapProbeFetch(
  fetcher: typeof fetch,
  timeoutMs: number,
  timeoutAfter: SourceHealthTimeoutAfter
): typeof fetch {
  const boundedFetch: typeof fetch = (input, init) =>
    Promise.race([fetcher(input, init), timeoutAfter(timeoutMs, sapMetadataProbeTimeoutLabel)]);

  return boundedFetch;
}

function defaultTimeoutAfter(timeoutMs: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(timeoutMs)}ms.`));
    }, timeoutMs);
  });
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Source health probe failed.";
  }

  const causeCode = readErrorCauseCode(error);
  return causeCode === undefined ? error.message : `${error.message} (${causeCode})`;
}

function readErrorCauseCode(error: Error): string | undefined {
  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause !== "object" || cause === null || Array.isArray(cause)) {
    return undefined;
  }

  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Z0-9_]+$/u.test(code) ? code : undefined;
}

function redactEnvValues(message: string, env: RuntimeEnv): string {
  let redacted = message;
  for (const value of Object.values(env)) {
    if (value !== undefined && value.length > 3) {
      redacted = redacted.replaceAll(value, "[redacted]");
    }
  }

  return redacted;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

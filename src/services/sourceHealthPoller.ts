import {
  type SupabaseToolDataSchemaProbe,
  ALL_TOOLS_DATA_TABLE_NAMES
} from "../adapters/connectorRegistry.js";
import type { SupabaseTableReadinessProbe } from "../memory/supabaseStore.js";
import {
  buildSourceHealthResults,
  defaultSourceHealthSnapshotMaxAgeMs,
  type SourceHealthOptions,
  type SourceHealthResult,
  type SourceHealthSnapshotStore
} from "./sourceHealth.js";
import { probeMcpReadiness, type McpReadinessStatus } from "./mcpHealth.js";

export interface SourceHealthPollerOptions extends SourceHealthOptions {
  intervalMs?: number;
  mcpHealthFetcher?: typeof fetch;
  mcpHealthProbeTimeoutMs?: number;
  onError?: (error: unknown) => void;
  snapshotStore: SourceHealthSnapshotStore;
  toolDataSchemaProbeLoader?: () => Promise<SupabaseToolDataSchemaProbe | undefined>;
}

export interface SourceHealthPollerHandle {
  pollOnce(): Promise<SourceHealthResult[]>;
  stop(): void;
}

export async function pollAndPersistSourceHealth(options: SourceHealthPollerOptions): Promise<SourceHealthResult[]> {
  const toolDataSchemaProbe = options.toolDataSchemaProbe ?? (await options.toolDataSchemaProbeLoader?.());
  const [sourceResults, mcpReadiness] = await Promise.all([
    buildSourceHealthResults({ ...options, toolDataSchemaProbe }),
    probeMcpReadiness({
      ...(options.env === undefined ? {} : { env: options.env }),
      ...(options.mcpHealthFetcher === undefined ? {} : { fetcher: options.mcpHealthFetcher }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.timeoutAfter === undefined ? {} : { timeoutAfter: options.timeoutAfter }),
      ...(options.mcpHealthProbeTimeoutMs === undefined ? {} : { timeoutMs: options.mcpHealthProbeTimeoutMs })
    })
  ]);
  const results = [...sourceResults, sourceHealthFromMcpReadiness(mcpReadiness)];
  await options.snapshotStore.upsert(results);
  return results;
}

function sourceHealthFromMcpReadiness(readiness: McpReadinessStatus): SourceHealthResult {
  const recordIds = uniqueStrings([
    "mcp",
    ...(readiness.healthUrl === undefined ? [] : [readiness.healthUrl]),
    ...(readiness.endpoint === undefined ? [] : [readiness.endpoint]),
    ...(readiness.transport === undefined ? [] : [readiness.transport]),
    ...(readiness.sessionMode === undefined ? [] : [readiness.sessionMode])
  ]);

  if (readiness.status === "connected") {
    return {
      checkedAtIso: readiness.checkedAtIso,
      latencyMs: readiness.latencyMs,
      proofItems: ["mcp healthz reachable", "auth configured", "no ERP write-back"],
      recordIds,
      sourceMode: "live",
      sourceName: "mcp",
      status: "connected"
    };
  }

  return {
    checkedAtIso: readiness.checkedAtIso,
    lastError: readiness.lastError,
    latencyMs: readiness.latencyMs,
    proofItems: uniqueStrings([...readiness.proofItems, "no ERP write-back"]),
    recordIds,
    sourceMode: "unavailable",
    sourceName: "mcp",
    status: "blocked"
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function createToolDataSchemaProbeLoader(
  supabaseProbe: SupabaseTableReadinessProbe | undefined
): (() => Promise<SupabaseToolDataSchemaProbe | undefined>) | undefined {
  if (supabaseProbe === undefined) {
    return undefined;
  }

  return () => supabaseProbe.probeTables(ALL_TOOLS_DATA_TABLE_NAMES);
}

export function startSourceHealthPoller(options: SourceHealthPollerOptions): SourceHealthPollerHandle {
  let stopped = false;
  const pollOnce = async (): Promise<SourceHealthResult[]> => {
    if (stopped) {
      return [];
    }

    return pollAndPersistSourceHealth(options);
  };
  const reportError = (error: unknown): void => {
    options.onError?.(error);
  };
  const timer = setInterval(() => {
    void pollOnce().catch(reportError);
  }, options.intervalMs ?? defaultSourceHealthSnapshotMaxAgeMs);

  void pollOnce().catch(reportError);

  return {
    pollOnce,
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}

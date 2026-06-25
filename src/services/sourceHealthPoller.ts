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

export interface SourceHealthPollerOptions extends SourceHealthOptions {
  intervalMs?: number;
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
  const results = await buildSourceHealthResults({ ...options, toolDataSchemaProbe });
  await options.snapshotStore.upsert(results);
  return results;
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

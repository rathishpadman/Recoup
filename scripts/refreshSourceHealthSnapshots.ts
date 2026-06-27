import { loadLocalRuntimeEnvFiles } from "../config/localRuntimeEnv.js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  createSupabaseSourceHealthSnapshotRepositoryFromEnv,
  createSupabaseTableReadinessProbeFromEnv
} from "../src/memory/supabaseStore.js";
import { startMcpHttpServer, type StartedMcpHttpServer } from "../src/mcp/server.js";
import { pollAndPersistSourceHealth } from "../src/services/sourceHealthPoller.js";
import { createToolDataSchemaProbeLoader } from "../src/services/sourceHealthPoller.js";
import type { SourceHealthResult, SourceHealthSnapshotStore } from "../src/services/sourceHealth.js";
import type { SupabaseToolDataSchemaProbe } from "../src/adapters/connectorRegistry.js";
import type { RuntimeEnv } from "../config/env.js";

export interface RefreshSourceHealthSnapshotsOptions {
  env?: RuntimeEnv;
  fetcher?: typeof fetch;
  mcpHealthFetcher?: typeof fetch;
  now?: () => Date;
  onLog?: (line: string) => void;
  snapshotStore?: SourceHealthSnapshotStore;
  startMcpServer?: (input?: { env?: RuntimeEnv; port?: number }) => Promise<StartedMcpHttpServer>;
  toolDataSchemaProbe?: SupabaseToolDataSchemaProbe;
}

export async function refreshSourceHealthSnapshots(
  options: RefreshSourceHealthSnapshotsOptions = {}
): Promise<SourceHealthResult[]> {
  const baseEnv = options.env ?? loadLocalRuntimeEnvFiles();
  const snapshotStore = options.snapshotStore ?? createSupabaseSourceHealthSnapshotRepositoryFromEnv(baseEnv);
  if (snapshotStore === undefined) {
    throw new Error("Supabase source health snapshot store is not configured.");
  }

  const privateMcpRuntime = await startPrivateMcpRuntime(baseEnv, options.startMcpServer ?? startMcpHttpServer);
  const runtimeEnv = privateMcpRuntime.runtimeEnv;
  try {
    const toolDataSchemaProbeLoader =
      options.toolDataSchemaProbe === undefined
        ? createToolDataSchemaProbeLoader(createSupabaseTableReadinessProbeFromEnv(runtimeEnv))
        : undefined;
    const results = await pollAndPersistSourceHealth({
      availableCredentialEnvNames: readConfiguredEnvNames(runtimeEnv),
      env: runtimeEnv,
      ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
      ...(options.mcpHealthFetcher === undefined ? {} : { mcpHealthFetcher: options.mcpHealthFetcher }),
      ...(options.now === undefined ? {} : { now: options.now }),
      snapshotStore,
      ...(options.toolDataSchemaProbe === undefined ? {} : { toolDataSchemaProbe: options.toolDataSchemaProbe }),
      ...(toolDataSchemaProbeLoader === undefined ? {} : { toolDataSchemaProbeLoader })
    });

    options.onLog?.(`Refreshed ${String(results.length)} source-health snapshots.`);
    return results;
  } finally {
    await privateMcpRuntime.mcpServer?.close();
  }
}

async function startPrivateMcpRuntime(
  runtimeEnv: RuntimeEnv,
  startMcpServer: NonNullable<RefreshSourceHealthSnapshotsOptions["startMcpServer"]>
): Promise<{ mcpServer?: StartedMcpHttpServer; runtimeEnv: RuntimeEnv }> {
  if (readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_URL) !== undefined) {
    return { runtimeEnv };
  }

  const mcpRuntimeEnv = buildPrivateMcpRuntimeEnv(runtimeEnv);
  const mcpServer = await startMcpServer({ env: mcpRuntimeEnv, port: 0 });
  return {
    mcpServer,
    runtimeEnv: {
      ...mcpRuntimeEnv,
      RECOUP_MCP_URL: `${mcpServer.baseUrl}${mcpServer.endpoint}`
    }
  };
}

function buildPrivateMcpRuntimeEnv(runtimeEnv: RuntimeEnv): RuntimeEnv {
  return {
    ...runtimeEnv,
    RECOUP_MCP_AUTH_TOKEN: readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_AUTH_TOKEN) ?? `loopback-${randomUUID()}`,
    RECOUP_MCP_CLIENT_CAPABILITIES: readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_CLIENT_CAPABILITIES) ?? "read",
    RECOUP_MCP_CLIENT_PRINCIPAL:
      readConfiguredRuntimeValue(runtimeEnv.RECOUP_MCP_CLIENT_PRINCIPAL) ??
      readConfiguredRuntimeValue(runtimeEnv.RECOUP_COCKPIT_HUMAN_PRINCIPAL) ??
      "human:maya-lead"
  };
}

function readConfiguredRuntimeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function readConfiguredEnvNames(env: RuntimeEnv): string[] {
  return Object.entries(env)
    .filter(([, value]) => readConfiguredRuntimeValue(value) !== undefined)
    .map(([key]) => key);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  refreshSourceHealthSnapshots({
    onLog(line) {
      console.log(line);
    }
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Source health refresh failed.");
    process.exitCode = 1;
  });
}

function isCliEntrypoint(moduleUrl: string, argvPath: string | undefined): boolean {
  return argvPath !== undefined && moduleUrl === pathToFileURL(resolve(argvPath)).href;
}

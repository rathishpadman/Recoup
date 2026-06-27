import type { RuntimeEnv } from "../../config/env.js";

export type McpReadinessStatus =
  | {
      authConfigured: true;
      checkedAtIso: string;
      endpoint: string;
      healthUrl: string;
      latencyMs: number;
      sessionMode: string;
      status: "connected";
      transport: string;
    }
  | {
      authConfigured?: boolean;
      checkedAtIso: string;
      endpoint?: string;
      healthUrl?: string;
      lastError: string;
      latencyMs: number;
      proofItems: string[];
      sessionMode?: string;
      status: "blocked" | "unavailable";
      transport?: string;
    };

export interface McpHealthProbeOptions {
  env?: RuntimeEnv;
  fetcher?: typeof fetch;
  now?: () => Date;
  timeoutAfter?: (timeoutMs: number, label: string) => Promise<never>;
  timeoutMs?: number;
}

const defaultMcpHealthProbeTimeoutMs = 1_000;
const mcpHealthProbeTimeoutLabel = "MCP health probe";

export async function probeMcpReadiness(options: McpHealthProbeOptions = {}): Promise<McpReadinessStatus> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const checkedAtIso = startedAt.toISOString();
  const target = resolveMcpHealthUrl(env, checkedAtIso);
  if (target.status !== "configured") {
    return withMcpMeasuredLatency(startedAt, now, target.result);
  }

  try {
    const response = await Promise.race([
      (options.fetcher ?? fetch)(target.healthUrl, { cache: "no-store", method: "GET" }),
      (options.timeoutAfter ?? defaultTimeoutAfter)(
        options.timeoutMs ?? defaultMcpHealthProbeTimeoutMs,
        mcpHealthProbeTimeoutLabel
      )
    ]);
    if (!response.ok) {
      return withMcpMeasuredLatency(startedAt, now, {
        checkedAtIso,
        healthUrl: target.healthUrl,
        lastError: `MCP health probe returned HTTP ${String(response.status)}.`,
        latencyMs: 0,
        proofItems: ["mcp health probe failed", "no ERP write-back"],
        status: "blocked"
      });
    }

    const health = parseMcpHealthBody(await response.json());
    if (health === undefined) {
      return withMcpMeasuredLatency(startedAt, now, {
        checkedAtIso,
        healthUrl: target.healthUrl,
        lastError: "MCP health response failed validation.",
        latencyMs: 0,
        proofItems: ["mcp health probe failed", "no ERP write-back"],
        status: "blocked"
      });
    }

    if (!health.authConfigured) {
      return withMcpMeasuredLatency(startedAt, now, {
        authConfigured: false,
        checkedAtIso,
        endpoint: health.endpoint,
        healthUrl: target.healthUrl,
        lastError: "MCP auth is not configured.",
        latencyMs: 0,
        proofItems: ["mcp healthz reachable", "auth missing", "no ERP write-back"],
        sessionMode: health.sessionMode,
        status: "blocked",
        transport: health.transport
      });
    }

    return withMcpMeasuredLatency(startedAt, now, {
      authConfigured: true,
      checkedAtIso,
      endpoint: health.endpoint,
      healthUrl: target.healthUrl,
      latencyMs: 0,
      sessionMode: health.sessionMode,
      status: "connected",
      transport: health.transport
    });
  } catch {
    return withMcpMeasuredLatency(startedAt, now, {
      checkedAtIso,
      healthUrl: target.healthUrl,
      lastError: "MCP health probe failed.",
      latencyMs: 0,
      proofItems: ["mcp health probe failed", "no ERP write-back"],
      status: "blocked"
    });
  }
}

function resolveMcpHealthUrl(
  env: RuntimeEnv,
  checkedAtIso: string
):
  | { healthUrl: string; status: "configured" }
  | { result: Extract<McpReadinessStatus, { status: "blocked" | "unavailable" }>; status: "blocked" | "unavailable" } {
  const configuredUrl = readConfiguredRuntimeValue(env.RECOUP_MCP_URL);
  if (configuredUrl !== undefined) {
    try {
      return { healthUrl: healthUrlFromMcpUrl(configuredUrl), status: "configured" };
    } catch {
      return {
        result: {
          checkedAtIso,
          lastError: "RECOUP_MCP_URL is invalid.",
          latencyMs: 0,
          proofItems: ["mcp health endpoint invalid", "no ERP write-back"],
          status: "blocked"
        },
        status: "blocked"
      };
    }
  }

  const configuredPort = readConfiguredRuntimeValue(env.MCP_PORT);
  if (configuredPort === undefined) {
    return {
      result: {
        checkedAtIso,
        lastError: "MCP health endpoint is not configured.",
        latencyMs: 0,
        proofItems: ["mcp health endpoint missing", "no ERP write-back"],
        status: "unavailable"
      },
      status: "unavailable"
    };
  }

  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return {
      result: {
        checkedAtIso,
        lastError: "Invalid MCP_PORT.",
        latencyMs: 0,
        proofItems: ["mcp health endpoint invalid", "no ERP write-back"],
        status: "blocked"
      },
      status: "blocked"
    };
  }

  return { healthUrl: `http://127.0.0.1:${String(port)}/healthz`, status: "configured" };
}

function healthUrlFromMcpUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const normalizedPath = url.pathname.replace(/\/+$/u, "");
  if (normalizedPath === "" || normalizedPath === "/") {
    url.pathname = "/healthz";
    return url.toString();
  }

  url.pathname = normalizedPath.endsWith("/mcp")
    ? `${normalizedPath.slice(0, -"/mcp".length)}/healthz`
    : `${normalizedPath}/healthz`;
  return url.toString();
}

function parseMcpHealthBody(
  body: unknown
): { authConfigured: boolean; endpoint: string; sessionMode: string; transport: string } | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  return typeof record.authConfigured === "boolean" &&
    typeof record.endpoint === "string" &&
    typeof record.sessionMode === "string" &&
    typeof record.transport === "string"
    ? {
        authConfigured: record.authConfigured,
        endpoint: record.endpoint,
        sessionMode: record.sessionMode,
        transport: record.transport
      }
    : undefined;
}

function withMcpMeasuredLatency<T extends McpReadinessStatus>(startedAt: Date, now: () => Date, result: T): T {
  return {
    ...result,
    latencyMs: Math.max(0, now().getTime() - startedAt.getTime())
  };
}

function readConfiguredRuntimeValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function defaultTimeoutAfter(timeoutMs: number, label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(timeoutMs)}ms.`));
    }, timeoutMs);
  });
}

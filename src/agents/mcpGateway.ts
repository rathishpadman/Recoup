import { randomUUID } from "node:crypto";
import { defaultCockpitHumanPrincipal } from "../../config/cockpitHumanPrincipals.js";
import type { RuntimeEnv } from "../../config/env.js";
import {
  startMcpHttpServer,
  type StartMcpHttpServerInput,
  type StartedMcpHttpServer
} from "../mcp/server.js";
import type { ServiceInvocationContext } from "../services/serviceLayer.js";
import {
  createMCPToolStaticFilter,
  MCPServerStreamableHttp,
  type MCPServer,
  type MCPServerStreamableHttpOptions
} from "./openAiAgentsSdk.js";

export const mayaAgentMcpAllowedToolNames = [
  "audit.read",
  "query.answer"
] as const;

export interface MayaMcpGateway {
  close(): Promise<void>;
  connect(): Promise<void>;
  mcpServers: MCPServer[];
}

export interface CreateMayaMcpGatewayInput {
  env?: RuntimeEnv;
  serviceContext?: ServiceInvocationContext;
  startServer?: (input?: StartMcpHttpServerInput) => Promise<StartedMcpHttpServer>;
}

export function buildMayaMcpServerOptions(
  env: RuntimeEnv = process.env,
  serviceContext?: ServiceInvocationContext
): MCPServerStreamableHttpOptions {
  const url = readMayaMcpUrl(env);
  const token = readConfiguredValue(env.RECOUP_MCP_AUTH_TOKEN);
  if (token === undefined) {
    throw new Error("RECOUP_MCP_AUTH_TOKEN is required for Maya MCP agent source access.");
  }

  const principal =
    readConfiguredValue(env.RECOUP_MCP_CLIENT_PRINCIPAL) ??
    readConfiguredValue(env.RECOUP_COCKPIT_HUMAN_PRINCIPAL) ??
    defaultCockpitHumanPrincipal;
  const toolFilter = createMCPToolStaticFilter({ allowed: [...mayaAgentMcpAllowedToolNames] });
  if (toolFilter === undefined) {
    throw new Error("Maya MCP agent source tool filter is required.");
  }
  const queryScopeHeader = encodeQueryAnswerScopeHeader(serviceContext);

  return {
    cacheToolsList: false,
    name: "recoup-governed-data-plane",
    requestInit: {
      headers: {
        authorization: `Bearer ${token}`,
        "x-recoup-mcp-principal": principal,
        ...(queryScopeHeader === undefined ? {} : { "x-recoup-query-answer-scope": queryScopeHeader })
      }
    },
    toolFilter,
    url
  };
}

export async function createMayaMcpGateway(input: CreateMayaMcpGatewayInput = {}): Promise<MayaMcpGateway> {
  const env = input.env ?? process.env;
  const explicitMcpUrl = readConfiguredValue(env.RECOUP_MCP_URL);

  if (explicitMcpUrl !== undefined) {
    return createGatewayFromOptions(buildMayaMcpServerOptions(env, input.serviceContext));
  }

  const loopbackEnv = buildLoopbackMcpEnv(env);
  const started = await (input.startServer ?? startMcpHttpServer)({
    env: loopbackEnv,
    port: 0,
    ...(input.serviceContext === undefined ? {} : { serviceContext: input.serviceContext })
  });
  const options = buildMayaMcpServerOptions({
    ...loopbackEnv,
    RECOUP_MCP_URL: `${started.baseUrl}${started.endpoint}`
  }, input.serviceContext);

  return createGatewayFromOptions(options, started);
}

function createGatewayFromOptions(
  options: MCPServerStreamableHttpOptions,
  startedServer?: Pick<StartedMcpHttpServer, "close">
): MayaMcpGateway {
  const server = new MCPServerStreamableHttp(options);

  return {
    mcpServers: [server],
    async close() {
      try {
        await server.close();
      } finally {
        await startedServer?.close();
      }
    },
    async connect() {
      await server.connect();
    }
  };
}

function buildLoopbackMcpEnv(env: RuntimeEnv): RuntimeEnv {
  return {
    ...env,
    RECOUP_MCP_AUTH_TOKEN: readConfiguredValue(env.RECOUP_MCP_AUTH_TOKEN) ?? `loopback-${randomUUID()}`,
    RECOUP_MCP_CLIENT_CAPABILITIES: "read",
    RECOUP_MCP_CLIENT_PRINCIPAL:
      readConfiguredValue(env.RECOUP_MCP_CLIENT_PRINCIPAL) ??
      readConfiguredValue(env.RECOUP_COCKPIT_HUMAN_PRINCIPAL) ??
      defaultCockpitHumanPrincipal
  };
}

function readMayaMcpUrl(env: RuntimeEnv): string {
  const explicitUrl = readConfiguredValue(env.RECOUP_MCP_URL);
  if (explicitUrl !== undefined) {
    return explicitUrl;
  }

  return `http://127.0.0.1:${String(readMcpPort(env.MCP_PORT))}/mcp`;
}

function readMcpPort(value: string | undefined): number {
  if (value === undefined) {
    return 4318;
  }

  const trimmed = value.trim();
  const port = Number(trimmed);
  if (trimmed === "" || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Invalid MCP_PORT");
  }

  return port;
}

function readConfiguredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function encodeQueryAnswerScopeHeader(serviceContext: ServiceInvocationContext | undefined): string | undefined {
  const scope = serviceContext?.queryAnswerScope;
  if (scope === undefined) {
    return undefined;
  }

  return Buffer.from(
    JSON.stringify({
      recordIds: scope.recordIds,
      selectedLineId: scope.selectedLineId
    }),
    "utf8"
  ).toString("base64url");
}

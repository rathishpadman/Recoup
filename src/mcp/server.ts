import { randomUUID, timingSafeEqual } from "node:crypto";
import { type Server } from "node:http";
import { pathToFileURL } from "node:url";
import express, { type Express } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { invokeServiceTool, serviceToolMetadata, serviceTools } from "../services/serviceLayer.js";
import { evaluateToolPermission, type ToolPermissionContext } from "../services/permissionEngine.js";
import { loadLocalRuntimeEnv, type RuntimeEnv } from "../../config/env.js";

export interface McpToolDescriptor {
  name: string;
  inputSchema: {
    type: "object";
    description: string;
  };
}

export interface McpToolFacade {
  listTools(): McpToolDescriptor[];
  callTool(name: string, args: unknown): unknown;
}

export type McpToolFacadeOptions = ToolPermissionContext;

export interface StartMcpHttpServerInput {
  env?: RuntimeEnv;
  port?: number;
}

export interface McpHttpAppOptions {
  env?: RuntimeEnv;
}

export interface McpSdkServerOptions {
  actorContext?: ToolPermissionContext;
}

export interface StartedMcpHttpServer {
  baseUrl: string;
  close(): Promise<void>;
  endpoint: "/mcp";
  server: Server;
  transport: "StreamableHTTPServerTransport";
}

export function createMcpToolFacade(options: McpToolFacadeOptions = {}): McpToolFacade {
  return {
    listTools() {
      return Object.keys(serviceTools)
        .filter((name) => isMcpVisible(name))
        .sort()
        .map((name) => ({
          name,
          inputSchema: {
            type: "object",
            description: "Input is Zod-validated by the Recoup service boundary."
          }
        }));
    },
    callTool(name, args) {
      if (!isMcpVisible(name)) {
        throw new Error("Tool is not exposed through MCP.");
      }

      const metadata = serviceToolMetadata[name as keyof typeof serviceToolMetadata];
      const permission = evaluateToolPermission(metadata, options);
      if (permission.decision === "deny") {
        throw new Error(permission.reason ?? "Tool permission denied.");
      }

      return invokeServiceTool(name, args);
    }
  };
}

function isMcpVisible(name: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(serviceToolMetadata, name)) {
    return false;
  }

  return serviceToolMetadata[name as keyof typeof serviceToolMetadata].visibility === "mcp";
}

export function createMcpHttpApp(options: McpHttpAppOptions = {}): Express {
  const app = express();
  const runtimeEnv = options.env ?? process.env;
  const facade = createMcpToolFacade(buildMcpActorContext(runtimeEnv));

  app.use(express.json({ limit: "1mb" }));
  app.use("/mcp", buildMcpAuthMiddleware(runtimeEnv));

  app.get("/mcp/tools", (_request, response) => {
    response.json({ tools: facade.listTools() });
  });

  app.post("/mcp/tools/:name/call", (request, response) => {
    response.json({
      result: facade.callTool(request.params.name, request.body)
    });
  });

  return app;
}

export function createMcpSdkServer(options: McpSdkServerOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: "recoup",
      version: "0.1.0"
    },
    {
      instructions:
        "Recoup exposes cited, deterministic O2C read and draft-only tools. Approval decisions and ERP write-back are not exposed through MCP."
    }
  );
  const facade = createMcpToolFacade(options.actorContext);
  const passthroughInput = z.object({}).passthrough();

  for (const tool of facade.listTools()) {
    server.registerTool(
      tool.name,
      {
        description: tool.inputSchema.description,
        inputSchema: passthroughInput,
        annotations: {
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
          readOnlyHint: serviceToolMetadata[tool.name as keyof typeof serviceToolMetadata].sideEffectClass === "none"
        }
      },
      (args) => ({
        content: [
          {
            text: JSON.stringify(facade.callTool(tool.name, args)),
            type: "text"
          }
        ]
      })
    );
  }

  return server;
}

export function createMcpTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport();
}

export function createMcpStreamableHttpApp(options: McpHttpAppOptions = {}): Express {
  const app = express();
  const runtimeEnv = options.env ?? process.env;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.locals.mcpEndpoint = "/mcp";
  app.locals.mcpSessionMode = "stateful";
  app.locals.mcpTransport = "StreamableHTTPServerTransport";
  app.use(express.json({ limit: "1mb", type: ["application/json", "application/*+json"] }));

  app.get("/healthz", (_request, response) => {
    response.json({
      authConfigured: isMcpAuthConfigured(runtimeEnv),
      endpoint: app.locals.mcpEndpoint as string,
      sessionMode: app.locals.mcpSessionMode as string,
      transport: app.locals.mcpTransport as string
    });
  });

  app.use("/mcp", buildMcpAuthMiddleware(runtimeEnv));

  app.post("/mcp", async (request, response) => {
    try {
      const sessionId = readMcpSessionId(request.headers["mcp-session-id"]);
      let transport = sessionId === undefined ? undefined : transports.get(sessionId);

      if (transport === undefined && sessionId === undefined && isInitializeRequest(request.body)) {
        transport = createSessionTransport(transports);
        await createMcpSdkServer({ actorContext: buildMcpActorContext(runtimeEnv) }).connect(
          transport as unknown as Transport
        );
      }

      if (transport === undefined) {
        response.status(400).json(buildMcpBadRequest("Bad Request: No valid session ID provided."));
        return;
      }

      await transport.handleRequest(request, response, request.body as unknown);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json(buildMcpInternalError(error));
      }
    }
  });

  app.get("/mcp", async (request, response) => {
    try {
      const sessionId = readMcpSessionId(request.headers["mcp-session-id"]);
      const transport = sessionId === undefined ? undefined : transports.get(sessionId);

      if (transport === undefined) {
        response.status(400).send("Invalid or missing session ID");
        return;
      }

      await transport.handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json(buildMcpInternalError(error));
      }
    }
  });

  app.delete("/mcp", async (request, response) => {
    try {
      const sessionId = readMcpSessionId(request.headers["mcp-session-id"]);
      const transport = sessionId === undefined ? undefined : transports.get(sessionId);

      if (transport === undefined) {
        response.status(400).send("Invalid or missing session ID");
        return;
      }

      await transport.handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) {
        response.status(500).json(buildMcpInternalError(error));
      }
    }
  });

  return app;
}

function buildMcpAuthMiddleware(runtimeEnv: RuntimeEnv): express.RequestHandler {
  return (request, response, next) => {
    const auth = verifyMcpAuth(request, runtimeEnv);
    if (!auth.success) {
      response.setHeader("www-authenticate", "Bearer");
      response.status(401).json({ error: auth.error });
      return;
    }

    next();
  };
}

export async function startMcpHttpServer(input: StartMcpHttpServerInput = {}): Promise<StartedMcpHttpServer> {
  const runtimeEnv = input.env ?? process.env;
  const app = createMcpStreamableHttpApp({ env: runtimeEnv });
  const port = input.port ?? readMcpPort(runtimeEnv.MCP_PORT);

  return new Promise((resolve) => {
    const server = app.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected MCP server to bind a TCP port.");
      }

      resolve({
        baseUrl: `http://127.0.0.1:${String(address.port)}`,
        close: () => closeServer(server),
        endpoint: "/mcp",
        server,
        transport: "StreamableHTTPServerTransport"
      });
    });
  });
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

function verifyMcpAuth(
  request: express.Request,
  env: RuntimeEnv
): { principal: string; success: true } | { error: string; success: false } {
  const expectedToken = env.RECOUP_MCP_AUTH_TOKEN?.trim();
  const expectedPrincipal = env.RECOUP_MCP_CLIENT_PRINCIPAL?.trim();
  const requestToken = readBearerToken(request.header("authorization"));
  const requestPrincipal = request.header("x-recoup-mcp-principal")?.trim();

  if (expectedToken === undefined || expectedToken.length === 0) {
    return { error: "Verified MCP auth required.", success: false };
  }

  if (
    expectedPrincipal !== undefined &&
    expectedPrincipal.length > 0 &&
    requestPrincipal !== expectedPrincipal
  ) {
    return { error: "Verified MCP auth required.", success: false };
  }

  if (requestToken === undefined || !constantTimeEqual(requestToken, expectedToken)) {
    return { error: "Verified MCP auth required.", success: false };
  }

  return { principal: requestPrincipal ?? "mcp:verified-client", success: true };
}

function isMcpAuthConfigured(env: RuntimeEnv): boolean {
  return (env.RECOUP_MCP_AUTH_TOKEN?.trim().length ?? 0) > 0;
}

function buildMcpActorContext(env: RuntimeEnv): ToolPermissionContext {
  const actorId = env.RECOUP_MCP_CLIENT_PRINCIPAL?.trim();
  const capabilities = parseMcpCapabilities(env.RECOUP_MCP_CLIENT_CAPABILITIES);

  return {
    ...(actorId === undefined || actorId.length === 0 ? {} : { actorId }),
    ...(capabilities === undefined ? {} : { actorCapabilities: capabilities })
  };
}

function parseMcpCapabilities(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const capabilities = value
    .split(",")
    .map((capability) => capability.trim())
    .filter((capability) => capability.length > 0);

  return capabilities.length === 0 ? undefined : capabilities;
}

function readBearerToken(value: string | undefined): string | undefined {
  const prefix = "Bearer ";
  if (value === undefined || !value.startsWith(prefix)) {
    return undefined;
  }

  return value.slice(prefix.length).trim();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function createSessionTransport(transports: Map<string, StreamableHTTPServerTransport>): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    onsessioninitialized(sessionId) {
      transports.set(sessionId, transport);
    },
    sessionIdGenerator: () => randomUUID()
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId !== undefined) {
      transports.delete(sessionId);
    }
  };

  return transport;
}

function readMcpSessionId(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildMcpBadRequest(message: string) {
  return {
    error: {
      code: -32000,
      message
    },
    id: null,
    jsonrpc: "2.0"
  };
}

function buildMcpInternalError(error: unknown) {
  return {
    error: {
      code: -32603,
      message: error instanceof Error ? error.message : "Internal server error"
    },
    id: null,
    jsonrpc: "2.0"
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startMcpHttpServer({ env: loadLocalRuntimeEnv() });
  console.log(`Recoup MCP StreamableHTTP listening on ${server.baseUrl}${server.endpoint}`);

  process.once("SIGTERM", () => {
    void server.close();
  });
}

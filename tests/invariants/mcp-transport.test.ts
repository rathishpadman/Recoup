import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";
import {
  createMcpHttpApp,
  createMcpStreamableHttpApp,
  createMcpTransport,
  startMcpHttpServer
} from "../../src/mcp/server.js";

const mcpAuthEnv = {
  RECOUP_MCP_AUTH_TOKEN: "test-mcp-token",
  RECOUP_MCP_CLIENT_PRINCIPAL: "human:mcp-client"
} as const;
const mcpAuthHeaders = {
  authorization: `Bearer ${mcpAuthEnv.RECOUP_MCP_AUTH_TOKEN}`,
  "x-recoup-mcp-principal": mcpAuthEnv.RECOUP_MCP_CLIENT_PRINCIPAL
} as const;

describe("production MCP transport", () => {
  it("declares the MCP SDK as a direct runtime dependency", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@modelcontextprotocol/sdk"]).toBe("^1.29.0");
    expect(packageJson.scripts?.["dev:mcp"]).toBe("tsx watch src/mcp/server.ts");
  });

  it("uses the SDK StreamableHTTPServerTransport on the /mcp endpoint", () => {
    const app = createMcpStreamableHttpApp();
    const transport = createMcpTransport();

    expect(transport.constructor.name).toBe("StreamableHTTPServerTransport");
    expect(app.locals.mcpEndpoint).toBe("/mcp");
    expect(app.locals.mcpTransport).toBe("StreamableHTTPServerTransport");
  });

  it("serves a secret-free production health signal outside the MCP protocol route", async () => {
    const app = createMcpStreamableHttpApp({ env: mcpAuthEnv });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/healthz`);
      const body = (await response.json()) as {
        authConfigured: boolean;
        endpoint: string;
        sessionMode: string;
        transport: string;
      };

      expect(response.status).toBe(200);
      expect(body).toEqual({
        authConfigured: true,
        endpoint: "/mcp",
        sessionMode: "stateful",
        transport: "StreamableHTTPServerTransport"
      });
      expect(JSON.stringify(body)).not.toContain(mcpAuthEnv.RECOUP_MCP_AUTH_TOKEN);
    } finally {
      await close(server.server);
    }
  });

  it("does not serve legacy facade routes from the production StreamableHTTP app", async () => {
    const app = createMcpStreamableHttpApp({ env: mcpAuthEnv });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/mcp/tools`, {
        headers: mcpAuthHeaders
      });

      expect(response.status).toBe(404);
    } finally {
      await close(server.server);
    }
  });

  it("protects legacy MCP facade routes when the helper app is mounted", async () => {
    const app = createMcpHttpApp({ env: mcpAuthEnv });
    const server = await listen(app);

    try {
      const unauthenticated = await fetch(`${server.baseUrl}/mcp/tools`);
      const authenticated = await fetch(`${server.baseUrl}/mcp/tools`, {
        headers: mcpAuthHeaders
      });
      const body = (await authenticated.json()) as { tools: Array<{ name: string }> };

      expect(unauthenticated.status).toBe(401);
      expect(authenticated.status).toBe(200);
      expect(body.tools.map((tool) => tool.name)).toContain("retrieval.sap");
    } finally {
      await close(server.server);
    }
  });

  it("rejects unauthenticated StreamableHTTP requests when MCP auth is configured", async () => {
    const app = createMcpStreamableHttpApp({ env: mcpAuthEnv });
    const server = await listen(app);

    try {
      const response = await fetch(`${server.baseUrl}/mcp`, {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            capabilities: {},
            clientInfo: { name: "unauthenticated-test", version: "0.1.0" },
            protocolVersion: "2025-06-18"
          }
        }),
        headers: { accept: "application/json, text/event-stream", "content-type": "application/json" },
        method: "POST"
      });
      expect(response.status).toBe(401);
      const result = (await response.json()) as { error: string };
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(result.error).toBe("Verified MCP auth required.");
    } finally {
      await close(server.server);
    }
  });

  it("starts a dedicated MCP StreamableHTTP server on an explicit port", async () => {
    const server = await startMcpHttpServer({ port: 0 });

    try {
      expect(server.endpoint).toBe("/mcp");
      expect(server.transport).toBe("StreamableHTTPServerTransport");
      expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    } finally {
      await server.close();
    }
  });

  it("can source the MCP port from injected runtime env", async () => {
    const server = await startMcpHttpServer({ env: { MCP_PORT: "0" } });

    try {
      expect(server.endpoint).toBe("/mcp");
      expect(server.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
      expect(new URL(server.baseUrl).port).not.toBe("4318");
    } finally {
      await server.close();
    }
  });

  it("rejects invalid injected MCP ports without echoing the value", async () => {
    await expect(startMcpHttpServer({ env: { MCP_PORT: "secret-port" } })).rejects.toThrow(/^Invalid MCP_PORT$/u);
  });

  it("serves a complete MCP initialize and tools/list flow over authenticated StreamableHTTP", async () => {
    const server = await startMcpHttpServer({ env: { ...mcpAuthEnv, MCP_PORT: "0" } });
    const client = new Client({ name: "recoup-test-client", version: "0.1.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`${server.baseUrl}${server.endpoint}`), {
      requestInit: { headers: mcpAuthHeaders }
    });

    try {
      await client.connect(transport as unknown as Transport);
      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);

      expect(toolNames).toContain("retrieval.sap");
      expect(toolNames).toContain("agent_tool_sentinel_position");
      expect(toolNames).toContain("agent_tool_containment_intent_position");
      expect(toolNames).not.toContain("approvals.decide");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("denies draft action tool calls for read-only MCP clients over StreamableHTTP", async () => {
    const server = await startMcpHttpServer({
      env: {
        ...mcpAuthEnv,
        MCP_PORT: "0",
        RECOUP_MCP_CLIENT_CAPABILITIES: "read"
      }
    });
    const client = new Client({ name: "recoup-readonly-client", version: "0.1.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`${server.baseUrl}${server.endpoint}`), {
      requestInit: { headers: mcpAuthHeaders }
    });

    try {
      await client.connect(transport as unknown as Transport);

      const result = await client.callTool({
        arguments: { decisionId: "deduction-decision:S1-L2" },
        name: "actions.draftRebill"
      });

      expect(result).toMatchObject({
        isError: true
      });
      if (!Array.isArray(result.content)) {
        throw new Error("Expected MCP tool error content to be an array.");
      }
      expect(result.content[0]).toMatchObject({
        text: "Actor is not permitted to create draft-only action artifacts."
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

async function listen(app: ReturnType<typeof createMcpStreamableHttpApp>): Promise<{ baseUrl: string; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Expected an ephemeral TCP port.");
      }

      resolve({ baseUrl: `http://127.0.0.1:${String(address.port)}`, server });
    });
  });
}

async function close(server: Server): Promise<void> {
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

import { describe, expect, it } from "vitest";
import {
  buildMayaMcpServerOptions,
  mayaAgentMcpAllowedToolNames
} from "../../src/agents/mcpGateway.js";

describe("Maya MCP agent gateway", () => {
  it("builds a read-only Streamable HTTP MCP client config without source credentials", () => {
    const options = buildMayaMcpServerOptions({
      MCP_PORT: "4318",
      RECOUP_MCP_AUTH_TOKEN: "test-mcp-token",
      RECOUP_MCP_CLIENT_PRINCIPAL: "human:maya-lead",
      SAP_ODATA_CLIENT_SECRET: "sap-secret",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret"
    });

    expect(options.name).toBe("recoup-governed-data-plane");
    expect(options.url).toBe("http://127.0.0.1:4318/mcp");
    expect(options.cacheToolsList).toBe(false);
    expect(options.requestInit).toEqual({
      headers: {
        authorization: "Bearer test-mcp-token",
        "x-recoup-mcp-principal": "human:maya-lead"
      }
    });
    expect(options.toolFilter).toEqual({
      allowedToolNames: [...mayaAgentMcpAllowedToolNames]
    });
    const serializedOptions = JSON.stringify(options);

    expect(serializedOptions).not.toContain("sap-secret");
    expect(serializedOptions).not.toContain("supabase-secret");
    expect(mayaAgentMcpAllowedToolNames).toEqual([
      "audit.read",
      "query.answer"
    ]);
  });

  it("adds selected evidence query scope headers for explicit remote MCP clients", () => {
    const options = buildMayaMcpServerOptions(
      {
        RECOUP_MCP_AUTH_TOKEN: "test-mcp-token",
        RECOUP_MCP_URL: "https://mcp.example.test/mcp"
      },
      {
        queryAnswerScope: {
          recordIds: ["S3-L1", "INV-S3-1"],
          selectedLineId: "S3-L1"
        }
      }
    );

    expect(readRequestHeaders(options.requestInit as unknown)).toMatchObject({
      "x-recoup-query-answer-scope":
        "eyJyZWNvcmRJZHMiOlsiUzMtTDEiLCJJTlYtUzMtMSJdLCJzZWxlY3RlZExpbmVJZCI6IlMzLUwxIn0"
    });
  });

  it("rejects explicit remote MCP URLs when the bearer token is missing", () => {
    expect(() =>
      buildMayaMcpServerOptions({
        RECOUP_MCP_URL: "http://127.0.0.1:4318/mcp"
      })
    ).toThrow("RECOUP_MCP_AUTH_TOKEN is required for Maya MCP agent source access.");
  });
});

function readRequestHeaders(requestInit: unknown): Record<string, string> {
  if (typeof requestInit !== "object" || requestInit === null || !("headers" in requestInit)) {
    throw new Error("Expected requestInit headers.");
  }
  const headers = requestInit.headers;
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) {
    throw new Error("Expected requestInit headers object.");
  }

  return headers as Record<string, string>;
}

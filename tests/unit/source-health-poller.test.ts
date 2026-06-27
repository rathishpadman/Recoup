import { describe, expect, it, vi } from "vitest";
import { ALL_TOOLS_DATA_TABLE_NAMES, type SupabaseToolDataSchemaProbe } from "../../src/adapters/connectorRegistry.js";
import { pollAndPersistSourceHealth } from "../../src/services/sourceHealthPoller.js";

const fixedNow = new Date("2026-06-24T10:30:00.000Z");
const sapEnv = {
  SAP_ODATA_BASE_URL: "https://sap.example.test",
  SAP_ODATA_CLIENT: "100",
  SAP_ODATA_CLIENT_SECRET: "sap-basic-secret",
  SAP_ODATA_USERID: "sap-readonly-user",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
  SUPABASE_URL: "https://supabase.example.test"
};

describe("source health poller", () => {
  it("persists direct read-only source health probe results to the snapshot store", async () => {
    const snapshotStore = {
      loadLatest: vi.fn(),
      upsert: vi.fn()
    };
    const requests: Array<{ method: string | undefined; url: string }> = [];

    const results = await pollAndPersistSourceHealth({
      availableCredentialEnvNames: Object.keys(sapEnv),
      env: sapEnv,
      fetcher: (input, init) => {
        requests.push({ method: init?.method, url: stringifyFetchInput(input) });
        return Promise.resolve(new Response(sapMetadataXml(), { status: 200 }));
      },
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    expect(requiredStatus(results, "sap-odata")).toBe("connected");
    expect(snapshotStore.upsert).toHaveBeenCalledTimes(1);
    expect(snapshotStore.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMode: "live",
          sourceName: "sap-odata",
          status: "connected"
        })
      ])
    );
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requests.every((request) => request.url.includes("/$metadata"))).toBe(true);
  });

  it("loads Supabase Tools_data schema readiness before persisting non-SAP source snapshots", async () => {
    const snapshotStore = {
      loadLatest: vi.fn(),
      upsert: vi.fn()
    };
    const toolDataSchemaProbeLoader = vi.fn(() => Promise.resolve(allTablesAvailableProbe()));

    const results = await pollAndPersistSourceHealth({
      availableCredentialEnvNames: Object.keys(sapEnv),
      env: sapEnv,
      fetcher: () => Promise.resolve(new Response(sapMetadataXml(), { status: 200 })),
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbeLoader
    });

    const tpm = results.find((source) => source.sourceName === "tpm");
    expect(toolDataSchemaProbeLoader).toHaveBeenCalledTimes(1);
    expect(tpm).toMatchObject({
      sourceMode: "synthetic_static_table",
      status: "connected"
    });
    expect(snapshotStore.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMode: "synthetic_static_table",
          sourceName: "tpm",
          status: "connected"
        })
      ])
    );
  });

  it("persists MCP gateway health into the source-health snapshot store", async () => {
    const snapshotStore = {
      loadLatest: vi.fn(),
      upsert: vi.fn()
    };
    const mcpHealthFetcher = vi.fn((url: string | URL | Request) => {
      const requestedUrl = stringifyFetchInput(url);
      expect(requestedUrl).toBe("https://mcp.example.test/healthz");
      return Promise.resolve(
        Response.json({
          authConfigured: true,
          endpoint: "/mcp",
          sessionMode: "stateful",
          transport: "StreamableHTTPServerTransport"
        })
      );
    });

    const results = await pollAndPersistSourceHealth({
      availableCredentialEnvNames: [...Object.keys(sapEnv), "RECOUP_MCP_URL"],
      env: {
        ...sapEnv,
        RECOUP_MCP_URL: "https://mcp.example.test/mcp"
      },
      fetcher: () => Promise.resolve(new Response(sapMetadataXml(), { status: 200 })),
      mcpHealthFetcher,
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const mcp = results.find((source) => source.sourceName === "mcp");
    expect(mcpHealthFetcher).toHaveBeenCalledTimes(1);
    expect(mcp).toMatchObject({
      checkedAtIso: fixedNow.toISOString(),
      sourceMode: "live",
      sourceName: "mcp",
      status: "connected"
    });
    expect(mcp?.proofItems).toEqual(expect.arrayContaining(["mcp healthz reachable", "auth configured", "no ERP write-back"]));
    expect(mcp?.recordIds).toEqual(expect.arrayContaining(["mcp", "https://mcp.example.test/healthz", "/mcp"]));
    expect(snapshotStore.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMode: "live",
          sourceName: "mcp",
          status: "connected"
        })
      ])
    );
  });
});

function requiredStatus(results: ReadonlyArray<{ sourceName: string; status: string }>, sourceName: string): string {
  const result = results.find((candidate) => candidate.sourceName === sourceName);
  if (result === undefined) {
    throw new Error(`Missing source health for ${sourceName}.`);
  }

  return result.status;
}

function stringifyFetchInput(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.href;
  }

  return input.url;
}

function allTablesAvailableProbe(): SupabaseToolDataSchemaProbe {
  return {
    tableStatuses: Object.fromEntries(
      ALL_TOOLS_DATA_TABLE_NAMES.map((tableName) => [tableName, "available" as const])
    ),
    unsafeShadowActions: []
  };
}

function sapMetadataXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices>
    <Schema Namespace="SAP" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">
      <EntityType Name="BillingDocument">
        <Key><PropertyRef Name="BillingDocument" /></Key>
        <Property Name="BillingDocument" Type="Edm.String" />
      </EntityType>
      <EntitySet Name="C_BillingDocumentFs" EntityType="SAP.BillingDocument" />
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;
}

import { describe, expect, it, vi } from "vitest";
import { ALL_TOOLS_DATA_TABLE_NAMES, type SupabaseToolDataSchemaProbe } from "../../src/adapters/connectorRegistry.js";
import { refreshSourceHealthSnapshots } from "../../scripts/refreshSourceHealthSnapshots.ts";

const fixedNow = new Date("2026-06-27T10:00:00.000Z");
const cronEnv = {
  SAP_ODATA_BASE_URL: "https://sap.example.test",
  SAP_ODATA_CLIENT: "100",
  SAP_ODATA_CLIENT_SECRET: "sap-basic-secret",
  SAP_ODATA_USERID: "sap-readonly-user",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
  SUPABASE_URL: "https://supabase.example.test"
};

describe("source health refresh CLI", () => {
  it("runs one refresh with a private MCP health endpoint when no public MCP URL is configured", async () => {
    const snapshotStore = {
      loadLatest: vi.fn(),
      upsert: vi.fn()
    };
    const logs: string[] = [];
    const sapFetcher = vi.fn(() => Promise.resolve(new Response(sapMetadataXml(), { status: 200 })));
    const mcpHealthUrls: string[] = [];

    const results = await refreshSourceHealthSnapshots({
      env: cronEnv,
      fetcher: sapFetcher,
      mcpHealthFetcher: (input, init) => {
        mcpHealthUrls.push(stringifyFetchInput(input));
        return fetch(input, init);
      },
      now: () => fixedNow,
      onLog: (line) => {
        logs.push(line);
      },
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    expect(requiredSource(results, "sap-odata")).toMatchObject({
      sourceMode: "live",
      status: "connected"
    });
    expect(requiredSource(results, "mcp")).toMatchObject({
      sourceMode: "live",
      status: "connected"
    });
    expect(requiredSource(results, "mcp").proofItems).toEqual(
      expect.arrayContaining(["mcp healthz reachable", "auth configured", "no ERP write-back"])
    );
    expect(snapshotStore.upsert).toHaveBeenCalledTimes(1);
    expect(snapshotStore.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sourceName: "mcp", status: "connected" }),
        expect.objectContaining({ sourceName: "sap-odata", status: "connected" })
      ])
    );
    expect(sapFetcher).toHaveBeenCalledWith(expect.stringContaining("/$metadata"), expect.objectContaining({ method: "GET" }));
    expect(mcpHealthUrls).toHaveLength(1);
    expect(mcpHealthUrls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/healthz$/u);
    expect(logs.join(" ")).toContain("Refreshed");
    expect(JSON.stringify(results)).not.toContain("sap-basic-secret");
    expect(JSON.stringify(results)).not.toContain("loopback-source-health");
    expect(JSON.stringify(logs)).not.toContain("sap-basic-secret");
  });

  it("fails closed before probing when the Supabase source-health snapshot store is not configured", async () => {
    await expect(
      refreshSourceHealthSnapshots({
        env: { SAP_ODATA_BASE_URL: "https://sap.example.test" },
        fetcher: () => Promise.resolve(new Response(sapMetadataXml(), { status: 200 })),
        toolDataSchemaProbe: allTablesAvailableProbe()
      })
    ).rejects.toThrow("Supabase source health snapshot store is not configured.");
  });
});

function requiredSource(results: ReadonlyArray<{ proofItems: string[]; sourceName: string }>, sourceName: string) {
  const source = results.find((candidate) => candidate.sourceName === sourceName);
  if (source === undefined) {
    throw new Error(`Missing source ${sourceName}.`);
  }

  return source;
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

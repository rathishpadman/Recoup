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

  it("persists OpenAI evidence vector readiness without exposing provider identifiers", async () => {
    const snapshotStore = {
      loadLatest: vi.fn(),
      upsert: vi.fn()
    };
    let observedVectorSignal: AbortSignal | null | undefined;
    const openAiEvidenceVectorFetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      observedVectorSignal = init?.signal;
      const url = stringifyFetchInput(input);
      return Promise.resolve(
        Response.json(url.endsWith("/files?limit=100")
          ? {
              data: [
                vectorFile("S1-L1", "CUST-GREENLEAF", "carrier-report", ["S1-L1", "PHOTO-CARRIER-1", "INV-S1-1"], "Damaged product, evidence received"),
                vectorFile("S3-L1", "CUST-CRESTLINE", "POD", ["S3-L1", "POD-SIGNED-1", "INV-S3-1"], "Shortage claim with full signed POD"),
                vectorFile("S6-L1", "CUST-CRESTLINE", "contract", ["S6-L1", "PRICE-CLAUSE-1", "INV-S6-1"], "Pricing chargeback below contracted price"),
                vectorFile("S8-L1", "CUST-HARBOR", "credit-memo", ["S8-L1", "CREDIT-MEMO-1", "INV-S8-1"], "Duplicate already-credited deduction")
              ],
              has_more: false
            }
          : {
              file_counts: { completed: 4, failed: 0, in_progress: 0, total: 4 },
              id: "vs-provider-secret",
              metadata: { manifest: "maya-evidence-seed-42-v1" }
            })
      );
    });

    const results = await pollAndPersistSourceHealth({
      availableCredentialEnvNames: [...Object.keys(sapEnv), "OPENAI_API_KEY", "OPENAI_EVIDENCE_VECTOR_STORE_ID"],
      env: {
        ...sapEnv,
        OPENAI_API_KEY: "sk-provider-secret",
        OPENAI_EVIDENCE_VECTOR_STORE_ID: "vs-provider-secret"
      },
      fetcher: () => Promise.resolve(new Response(sapMetadataXml(), { status: 200 })),
      now: () => fixedNow,
      openAiEvidenceVectorFetcher,
      openAiEvidenceVectorProbeTimeoutMs: 765,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const vectorReadiness = results.find((source) => source.sourceName === "openai-evidence-vector-store");
    expect(openAiEvidenceVectorFetcher).toHaveBeenCalledTimes(2);
    expect(openAiEvidenceVectorFetcher).toHaveBeenCalledWith(
      expect.stringContaining("/vector_stores/"),
      expect.objectContaining({ method: "GET" })
    );
    expect(observedVectorSignal).toBeInstanceOf(AbortSignal);
    expect(vectorReadiness).toMatchObject({
      checkedAtIso: fixedNow.toISOString(),
      sourceMode: "live",
      sourceName: "openai-evidence-vector-store",
      status: "connected"
    });
    expect(JSON.stringify(vectorReadiness)).not.toContain("sk-provider-secret");
    expect(JSON.stringify(vectorReadiness)).not.toContain("vs-provider-secret");
    expect(snapshotStore.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sourceMode: "live",
          sourceName: "openai-evidence-vector-store",
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

function vectorFile(
  lineId: string,
  customerId: string,
  documentType: string,
  recordIds: string[],
  scenarioType: string
) {
  return {
    attributes: {
      customer_id: customerId,
      documentType,
      provenance: "synthetic",
      record_id: lineId,
      recordIds,
      scenario_type: scenarioType,
      source_table: "synthetic_deduction_lines"
    },
    status: "completed"
  };
}

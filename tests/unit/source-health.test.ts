import { describe, expect, it, vi } from "vitest";
import { ALL_TOOLS_DATA_TABLE_NAMES, type SupabaseToolDataSchemaProbe } from "../../src/adapters/connectorRegistry.js";
import {
  buildSourceHealthResultsFromSnapshots,
  buildSourceHealthResults,
  buildSourceHealthResultsWithSnapshots,
  type SourceHealthResult
} from "../../src/services/sourceHealth.js";

const fixedNow = new Date("2026-06-24T10:30:00.000Z");
const basicSapEnv = {
  SAP_ODATA_BASE_URL: "https://sap.example.test",
  SAP_ODATA_CLIENT: "100",
  SAP_ODATA_CLIENT_SECRET: "sap-basic-secret",
  SAP_ODATA_USERID: "sap-readonly-user",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
  SUPABASE_URL: "https://supabase.example.test"
};
const oauthSapEnv = {
  SAP_ODATA_BASE_URL: "https://sap.example.test",
  SAP_ODATA_CLIENT: "100",
  SAP_ODATA_CLIENT_ID: "sap-oauth-client",
  SAP_ODATA_CLIENT_SECRET: "sap-oauth-secret",
  SAP_ODATA_TOKEN_URL: "https://auth.example.test/oauth/token",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
  SUPABASE_URL: "https://supabase.example.test"
};

describe("source health", () => {
  it("probes SAP health through read-only GET metadata calls when Basic auth is configured", async () => {
    const requests: Array<{ method: string | undefined; url: string }> = [];
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher: (input, init) => {
        requests.push({ method: init?.method, url: stringifyFetchInput(input) });
        return Promise.resolve(new Response(sapMetadataXml(), { status: 200 }));
      },
      now: () => fixedNow,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("connected");
    expect(sap.sourceMode).toBe("live");
    expect(sap.checkedAtIso).toBe(fixedNow.toISOString());
    expect(Number.isNaN(Date.parse(sap.checkedAtIso))).toBe(false);
    expect(sap.latencyMs).toBeGreaterThanOrEqual(0);
    expect(sap.proofItems).toEqual(expect.arrayContaining(["read-only metadata probe", "external writes blocked"]));
    expect(sap.recordIds).toEqual(expect.arrayContaining(["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"]));
    expect(sap.lastError).toBeUndefined();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requests.every((request) => request.url.includes("/$metadata"))).toBe(true);
  });

  it("fails closed when a fresh Supabase SAP source-health snapshot cannot be confirmed by a live probe", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("local TLS certificate failure")));
    const snapshotCheckedAt = new Date(fixedNow.getTime() - 14 * 60 * 1000).toISOString();
    const snapshotStore = {
      loadLatest: vi.fn(() =>
        Promise.resolve([
        {
          checkedAtIso: snapshotCheckedAt,
          latencyMs: 128,
          proofItems: ["read-only metadata probe", "credentials present", "external writes blocked"],
          recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
          sourceMode: "live" as const,
          sourceName: "sap-odata",
          status: "connected" as const
        }
        ])
      ),
      upsert: vi.fn()
    };

    const health = await buildSourceHealthResultsWithSnapshots({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher,
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("blocked");
    expect(sap.sourceMode).toBe("unavailable");
    expect(sap.checkedAtIso).toBe(fixedNow.toISOString());
    expect(sap.proofItems).toEqual(expect.arrayContaining(["source probe failed"]));
    expect(sap.proofItems).not.toContain("supabase source-health snapshot");
    expect(sap.recordIds).not.toContain("recoup_source_health_snapshots:sap-odata");
    expect(sap.lastError).toBe("local TLS certificate failure");
    expect(fetcher).toHaveBeenCalled();
    expect(snapshotStore.upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ sourceName: "sap-odata" })]));
  });

  it("loads saved source-health snapshots immediately without probing SAP", async () => {
    const sapFetcher = vi.fn(() => Promise.reject(new Error("SAP probe should not run for snapshot read model.")));
    const snapshotCheckedAt = new Date(fixedNow.getTime() - 2 * 60 * 1000).toISOString();
    const snapshotStore = {
      loadLatest: vi.fn(() =>
        Promise.resolve([
          {
            checkedAtIso: snapshotCheckedAt,
            latencyMs: 128,
            proofItems: ["read-only metadata probe", "credentials present", "external writes blocked"],
            recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
            sourceMode: "live" as const,
            sourceName: "sap-odata",
            status: "connected" as const
          },
          {
            checkedAtIso: snapshotCheckedAt,
            latencyMs: 9,
            proofItems: ["schema probe passed", "external writes blocked", "synthetic labelled"],
            recordIds: ["tpm", "recoup_src_tpm", "promotions", "contracts"],
            sourceMode: "synthetic_static_table" as const,
            sourceName: "tpm",
            status: "connected" as const
          }
        ])
      ),
      upsert: vi.fn()
    };

    const health = await buildSourceHealthResultsFromSnapshots({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher: sapFetcher,
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    const tpm = requiredHealth(health, "tpm");
    expect(sapFetcher).not.toHaveBeenCalled();
    expect(snapshotStore.upsert).not.toHaveBeenCalled();
    expect(sap).toMatchObject({
      checkedAtIso: snapshotCheckedAt,
      sourceMode: "live",
      status: "connected"
    });
    expect(sap.proofItems).toEqual(expect.arrayContaining(["supabase source-health snapshot"]));
    expect(sap.proofItems).not.toContain("source probe failed");
    expect(sap.recordIds).toContain("recoup_source_health_snapshots:sap-odata");
    expect(tpm).toMatchObject({
      sourceMode: "synthetic_static_table",
      status: "connected"
    });
    expect(tpm.proofItems).toEqual(expect.arrayContaining(["supabase source-health snapshot"]));
  });

  it("marks stale saved source-health snapshots as refresh overdue without probing SAP", async () => {
    const sapFetcher = vi.fn(() => Promise.reject(new Error("SAP probe should not run for stale snapshot read model.")));
    const staleCheckedAt = new Date(fixedNow.getTime() - 16 * 60 * 1000).toISOString();
    const snapshotStore = {
      loadLatest: vi.fn(() =>
        Promise.resolve([
          {
            checkedAtIso: staleCheckedAt,
            latencyMs: 128,
            proofItems: ["read-only metadata probe", "credentials present", "external writes blocked"],
            recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
            sourceMode: "live" as const,
            sourceName: "sap-odata",
            status: "connected" as const
          }
        ])
      ),
      upsert: vi.fn()
    };

    const health = await buildSourceHealthResultsFromSnapshots({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher: sapFetcher,
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sapFetcher).not.toHaveBeenCalled();
    expect(snapshotStore.upsert).not.toHaveBeenCalled();
    expect(sap).toMatchObject({
      checkedAtIso: staleCheckedAt,
      sourceMode: "live",
      status: "connected"
    });
    expect(sap.proofItems).toEqual(
      expect.arrayContaining(["supabase source-health snapshot", "source-health refresh overdue"])
    );
    expect(sap.recordIds).toContain("recoup_source_health_snapshots:sap-odata");
  });

  it("returns status-unavailable source health when no saved snapshot exists", async () => {
    const snapshotStore = {
      loadLatest: vi.fn(() => Promise.resolve([])),
      upsert: vi.fn()
    };

    const health = await buildSourceHealthResultsFromSnapshots({
      availableCredentialEnvNames: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      env: {
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://supabase.example.test"
      },
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap).toMatchObject({
      checkedAtIso: fixedNow.toISOString(),
      lastError: "Source health status unavailable until the background refresh stores a snapshot.",
      sourceMode: "unavailable",
      sourceName: "sap-odata",
      status: "blocked"
    });
    expect(sap.proofItems).toEqual(
      expect.arrayContaining(["source-health status unavailable", "external writes blocked"])
    );
    expect(sap.recordIds).toContain("recoup_source_health_snapshots:sap-odata");
    expect(snapshotStore.upsert).not.toHaveBeenCalled();
  });

  it("ignores stale SAP source-health snapshots and fails closed on a failed fresh probe", async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error("local TLS certificate failure")));
    const staleCheckedAt = new Date(fixedNow.getTime() - 16 * 60 * 1000).toISOString();
    const snapshotStore = {
      loadLatest: vi.fn(() =>
        Promise.resolve([
        {
          checkedAtIso: staleCheckedAt,
          latencyMs: 128,
          proofItems: ["read-only metadata probe", "credentials present", "external writes blocked"],
          recordIds: ["sap-odata", "ZUI_BILLINGDOCUMENTFS_0001"],
          sourceMode: "live" as const,
          sourceName: "sap-odata",
          status: "connected" as const
        }
        ])
      ),
      upsert: vi.fn()
    };

    const health = await buildSourceHealthResultsWithSnapshots({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher,
      now: () => fixedNow,
      snapshotStore,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("blocked");
    expect(sap.sourceMode).toBe("unavailable");
    expect(sap.proofItems).toEqual(expect.arrayContaining(["source probe failed"]));
    expect(sap.proofItems).not.toContain("supabase source-health snapshot");
    expect(sap.recordIds).not.toContain("recoup_source_health_snapshots:sap-odata");
    expect(sap.lastError).toBe("local TLS certificate failure");
    expect(fetcher).toHaveBeenCalled();
    expect(snapshotStore.upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ sourceName: "sap-odata" })]));
  });

  it("records sanitized SAP probe cause codes without leaking configured secret values", async () => {
    const error = Object.assign(new TypeError("fetch failed"), { cause: { code: "CERT_HAS_EXPIRED" } });
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher: () => Promise.reject(error),
      now: () => fixedNow,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("blocked");
    expect(sap.lastError).toContain("fetch failed");
    expect(sap.lastError).toContain("CERT_HAS_EXPIRED");
    expect(sap.lastError).not.toContain(basicSapEnv.SAP_ODATA_CLIENT_SECRET);
    expect(sap.lastError).not.toContain(basicSapEnv.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("returns parseable timestamps, latency, proof, records, status, and lastError for failed SAP health", async () => {
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher: () => Promise.resolve(new Response("down", { status: 503 })),
      now: () => fixedNow,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("blocked");
    expect(sap.status).not.toBe("connected");
    expect(sap.sourceMode).toBe("unavailable");
    expect(Number.isNaN(Date.parse(sap.checkedAtIso))).toBe(false);
    expect(sap.latencyMs).toBeGreaterThanOrEqual(0);
    expect(sap.proofItems.length).toBeGreaterThan(0);
    expect(sap.recordIds).toEqual(expect.arrayContaining(["sap-odata"]));
    expect(sap.lastError).toContain("503");
  });

  it("fails closed when the SAP metadata probe exceeds the bounded timeout", async () => {
    const requests: Array<{ method: string | undefined; url: string }> = [];
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: Object.keys(basicSapEnv),
      env: basicSapEnv,
      fetcher: (input, init) => {
        requests.push({ method: init?.method, url: stringifyFetchInput(input) });
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(new Response(sapMetadataXml(), { status: 200 }));
          }, 10);
        });
      },
      now: sequenceNow([fixedNow, new Date(fixedNow.getTime() + 25)]),
      sapMetadataProbeTimeoutMs: 25,
      timeoutAfter: (timeoutMs, label) => Promise.reject(new Error(`${label} timed out after ${String(timeoutMs)}ms.`)),
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("blocked");
    expect(sap.sourceMode).toBe("unavailable");
    expect(sap.checkedAtIso).toBe(fixedNow.toISOString());
    expect(sap.latencyMs).toBe(25);
    expect(sap.lastError).toContain("timed out after 25ms");
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (request === undefined) {
      throw new Error("Expected a SAP metadata request.");
    }
    expect(request.method).toBe("GET");
    expect(request.url).toContain("/$metadata");
  });

  it("allows OAuth token POST only to the token URL while the SAP metadata resource probe remains GET-only", async () => {
    const requests: Array<{ method: string | undefined; url: string }> = [];
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: Object.keys(oauthSapEnv),
      env: oauthSapEnv,
      fetcher: (input, init) => {
        const url = stringifyFetchInput(input);
        requests.push({ method: init?.method, url });
        if (url === oauthSapEnv.SAP_ODATA_TOKEN_URL) {
          return Promise.resolve(
            new Response(JSON.stringify({ access_token: "oauth-access-token" }), {
              headers: { "content-type": "application/json" },
              status: 200
            })
          );
        }

        return Promise.resolve(new Response(sapMetadataXml(), { status: 200 }));
      },
      now: () => fixedNow,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("connected");
    expect(requests).toEqual([
      {
        method: "POST",
        url: oauthSapEnv.SAP_ODATA_TOKEN_URL
      },
      {
        method: "GET",
        url: "https://sap.example.test/sap/opu/odata/sap/UI_BILLINGDOCUMENTFS/$metadata?sap-client=100"
      }
    ]);
    expect(requests.filter((request) => request.method === "POST").every((request) => request.url === oauthSapEnv.SAP_ODATA_TOKEN_URL)).toBe(true);
    expect(requests.filter((request) => request.url.includes("/sap/opu/odata/sap/")).every((request) => request.method === "GET")).toBe(true);
  });

  it("reports missing SAP credentials as blocked/unavailable without a fake connected state", async () => {
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      env: {
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://supabase.example.test"
      },
      fetcher: () => {
        return Promise.reject(new Error("SAP fetch should not run without credentials."));
      },
      now: () => fixedNow,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const sap = requiredHealth(health, "sap-odata");
    expect(sap.status).toBe("blocked");
    expect(sap.status).not.toBe("connected");
    expect(sap.sourceMode).toBe("unavailable");
    expect(sap.checkedAtIso).toBe(fixedNow.toISOString());
    expect(sap.latencyMs).toBeGreaterThanOrEqual(0);
    expect(sap.proofItems).toEqual(expect.arrayContaining(["credentials missing", "external writes blocked"]));
    expect(sap.recordIds).toEqual(expect.arrayContaining(["sap-odata", "SAP_ODATA_USERID"]));
    expect(sap.lastError).toContain("SAP OData credentials are not configured");
  });

  it("derives non-SAP synthetic health from connector readiness and schema probe proof", async () => {
    const health = await buildSourceHealthResults({
      availableCredentialEnvNames: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      env: {
        SUPABASE_SERVICE_ROLE_KEY: "supabase-service-secret",
        SUPABASE_URL: "https://supabase.example.test"
      },
      now: () => fixedNow,
      toolDataSchemaProbe: allTablesAvailableProbe()
    });

    const tpm = requiredHealth(health, "tpm");
    expect(tpm).toMatchObject({
      checkedAtIso: fixedNow.toISOString(),
      sourceMode: "synthetic_static_table",
      sourceName: "tpm",
      status: "connected"
    });
    expect(tpm.latencyMs).toBeGreaterThanOrEqual(0);
    expect(tpm.proofItems).toEqual(expect.arrayContaining(["schema probe passed", "external writes blocked"]));
    expect(tpm.recordIds).toEqual(expect.arrayContaining(["tpm", "recoup_src_tpm", "promotions", "contracts"]));
    expect(tpm.lastError).toBeUndefined();
  });
});

function requiredHealth(results: readonly SourceHealthResult[], sourceName: string): SourceHealthResult {
  const result = results.find((candidate) => candidate.sourceName === sourceName);
  if (result === undefined) {
    throw new Error(`Missing source health for ${sourceName}.`);
  }

  return result;
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

function sequenceNow(values: readonly Date[]): () => Date {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)];
    index += 1;
    if (value === undefined) {
      throw new Error("sequenceNow requires at least one value.");
    }

    return value;
  };
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

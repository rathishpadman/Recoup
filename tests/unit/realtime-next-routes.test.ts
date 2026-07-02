import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postDemoReset } from "../../cockpit/app/api/admin/demo-reset/route.js";
import { POST as postApproval } from "../../cockpit/app/api/approval/route.js";
import { GET as getConnectors } from "../../cockpit/app/api/connectors/route.js";
import { GET as getForensicsEvents } from "../../cockpit/app/api/forensics/events/route.js";
import { GET as getForensics } from "../../cockpit/app/api/forensics/route.js";
import { POST as postForensicsRefresh } from "../../cockpit/app/api/forensics/refresh/route.js";
import { POST as postForensicsQuery } from "../../cockpit/app/api/forensics/query/route.js";
import { GET as getForensicsWorkItem } from "../../cockpit/app/api/forensics/work-items/[lineId]/route.js";
import { POST as postRealtimeClientSecret } from "../../cockpit/app/api/query/realtime-client-secret/route.js";
import { POST as postRealtimeTool } from "../../cockpit/app/api/query/realtime-tool/route.js";
import {
  buildForensicsReadModelBusinessHashes,
  mayaForensicsReadModelKey,
  publishCachedReadModelPayload,
  proxyJsonResponse,
  subscribeForensicsReadModelEvents
} from "../../cockpit/app/api/read-model-cache.js";
import {
  createSignedDemoSessionValue,
  demoSessionCookieName,
  roleAllowedRoutes,
  roleHomeRoute
} from "../../cockpit/app/demo-auth.js";

const envPatch = {
  RECOUP_API_URL: "http://recoup-api.test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead",
  RECOUP_READ_MODEL_CACHE: "disabled"
} as const;
const mayaEnvPatch = {
  ...envPatch,
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret"
} as const;
const mayaSupabaseEnvPatch = {
  ...mayaEnvPatch,
  RECOUP_READ_MODEL_CACHE: "enabled",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-key",
  SUPABASE_URL: "https://recoup.supabase.co"
} as const;
const davidEnvPatch = {
  ...envPatch,
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:david-lead",
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret"
} as const;
const cfoEnvPatch = {
  ...envPatch,
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:cfo-lead",
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret"
} as const;

describe("Realtime Next proxy routes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("exposes a Forensics SSE route for business read-model invalidation", async () => {
    const response = getForensicsEvents(new Request("http://localhost/api/forensics/events"));
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("Expected Forensics SSE route to return a readable stream.");
    }

    const chunk = await reader.read();
    await reader.cancel();
    const text = new TextDecoder().decode(chunk.value);

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-cache");
    expect(text).toContain("event: connected");
    expect(text).toContain('"status":"connected"');
  });

  it("publishes a Forensics invalidation event only when source or receipt fingerprints change", async () => {
    const oldRecordIds = [
      "evidence:docs:S3-L1:EVD-POD-S3-L1:old",
      "receipt:RECON-S3-L1:content:old"
    ];
    const nextRecordIds = [
      "evidence:docs:S3-L1:EVD-POD-S3-L1:new",
      "receipt:RECON-S3-L1:content:new"
    ];
    const events: Array<{ receiptHash: string; sourceHash: string; type: string }> = [];
    const unsubscribe = subscribeForensicsReadModelEvents((event) => {
      if (event.type === "forensics-read-model-invalidated") {
        events.push(event);
      }
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models") && init?.method === "GET") {
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T00:00:00.000Z",
              model_key: mayaForensicsReadModelKey,
              payload_hash: "a".repeat(64),
              payload_json: { surface: "forensics-analyst" },
              persona: "maya",
              source_record_ids_json: oldRecordIds,
              source_refreshed_at: "2026-06-29T00:00:00.000Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }
      if (url.includes("recoup_cockpit_read_models") && init?.method === "POST") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await publishCachedReadModelPayload(mayaSupabaseEnvPatch, {
        modelKey: mayaForensicsReadModelKey,
        payload: { surface: "forensics-analyst" },
        payloadSurface: "forensics-analyst",
        rowSurface: "forensics-analyst",
        sourceRecordIds: nextRecordIds
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "forensics-read-model-invalidated",
        ...buildForensicsReadModelBusinessHashes(nextRecordIds)
      });
      expect(events[0]?.sourceHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(events[0]?.receiptHash).toMatch(/^[a-f0-9]{64}$/u);

      events.length = 0;
      await publishCachedReadModelPayload(mayaSupabaseEnvPatch, {
        modelKey: mayaForensicsReadModelKey,
        payload: { surface: "forensics-analyst" },
        payloadSurface: "forensics-analyst",
        rowSurface: "forensics-analyst",
        sourceRecordIds: oldRecordIds
      });

      expect(events).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  it("publishes a Forensics invalidation event when forwarded backend business hashes change", () => {
    const events: Array<{ receiptHash: string; sourceHash: string; type: string }> = [];
    const unsubscribe = subscribeForensicsReadModelEvents((event) => {
      if (event.type === "forensics-read-model-invalidated") {
        events.push(event);
      }
    });
    try {
      const firstHashes = { receiptHash: "b".repeat(64), sourceHash: "a".repeat(64) };
      const nextHashes = { receiptHash: "d".repeat(64), sourceHash: "c".repeat(64) };
      proxyJsonResponse(upstreamWithBusinessHashes(firstHashes), "{}", "miss");
      events.length = 0;

      proxyJsonResponse(upstreamWithBusinessHashes(firstHashes), "{}", "miss");
      expect(events).toHaveLength(0);

      proxyJsonResponse(upstreamWithBusinessHashes(nextHashes), "{}", "refresh");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "forensics-read-model-invalidated",
        ...nextHashes
      });
    } finally {
      unsubscribe();
    }
  });

  it("rejects client-secret proxy requests without request-bound human auth", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postRealtimeClientSecret(
      new Request("http://localhost/api/query/realtime-client-secret", {
        body: JSON.stringify({ question: "Why is Harbor blocked?" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects connector readiness proxy requests without request-bound human auth", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await getConnectors(
      new Request("http://localhost/api/connectors", {
        method: "GET"
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards connector readiness refreshes through the same-origin backend proxy", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const connectorReadiness = {
      checkedAtIso: "2026-06-24T10:16:00.000Z",
      connectors: [],
      lastRefreshedLabel: "6 source health rows checked at 2026-06-24T10:16:00.000Z",
      provenance: {
        deterministicBasis: "ConnectorReadiness and SourceHealthResult rows",
        recordIds: ["recoup_source_health_snapshots:sap-odata"],
        sourceKind: "supabase",
        sourceName: "connectors"
      },
      sourceHealth: [],
      sourceTiles: [],
      surface: "connector-readiness"
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      if (fetchInputUrl(input).includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([]));
      }
      return Promise.resolve(Response.json(connectorReadiness));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getConnectors(
      new Request("http://localhost/api/connectors", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof connectorReadiness;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual(connectorReadiness);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchInputUrl(fetchMock.mock.calls[0]?.[0])).toContain("recoup_cockpit_read_models");
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("http://recoup-api.test/connectors");
    expect(init).toMatchObject({ cache: "no-store", method: "GET" });
    expect(init?.headers).toMatchObject({
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
  });

  it("refreshes stale cached connector readiness when source-health snapshots are newer", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const staleCachedModel = {
      checkedAtIso: "2026-06-29T07:29:24.995Z",
      connectors: [],
      lastRefreshedLabel: "7 source health rows checked at 2026-06-29T07:29:24.995Z",
      provenance: {
        deterministicBasis: "ConnectorReadiness and SourceHealthResult rows",
        recordIds: ["recoup_source_health_snapshots:sap-odata"],
        sourceKind: "supabase",
        sourceName: "connectors"
      },
      sourceHealth: [
        {
          checkedAtIso: "2026-06-29T07:29:24.995Z",
          proofItems: ["snapshot"],
          recordIds: ["recoup_source_health_snapshots:sap-odata"],
          sourceMode: "live",
          sourceName: "sap-odata",
          status: "blocked"
        }
      ],
      sourceTiles: [],
      surface: "connector-readiness"
    };
    const freshBackendModel = {
      ...staleCachedModel,
      checkedAtIso: "2026-07-01T01:12:16.319Z",
      lastRefreshedLabel: "7 source health rows checked at 2026-07-01T01:12:16.319Z",
      sourceHealth: [
        {
          checkedAtIso: "2026-07-01T01:12:16.319Z",
          proofItems: ["snapshot"],
          recordIds: ["recoup_source_health_snapshots:sap-odata"],
          sourceMode: "live",
          sourceName: "sap-odata",
          status: "blocked"
        }
      ]
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T07:29:24.995Z",
              model_key: "maya:connectors:v1",
              payload_hash: "c".repeat(64),
              payload_json: staleCachedModel,
              persona: "maya",
              source_record_ids_json: ["recoup_source_health_snapshots:sap-odata"],
              source_refreshed_at: "2026-06-29T07:29:24.995Z",
              surface: "connector-readiness"
            }
          ])
        );
      }
      if (url.includes("recoup_source_health_snapshots")) {
        return Promise.resolve(Response.json([{ checked_at: "2026-07-01T01:12:16.319+00:00" }]));
      }

      expect(input).toBe("http://recoup-api.test/connectors");
      expect(init).toMatchObject({ cache: "no-store", method: "GET" });
      return Promise.resolve(
        Response.json(freshBackendModel, {
          headers: { "x-recoup-read-model-cache": "refresh" }
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getConnectors(
      new Request("http://localhost/api/connectors", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof freshBackendModel;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("refresh");
    expect(body.checkedAtIso).toBe("2026-07-01T01:12:16.319Z");
    expect(body).toEqual(freshBackendModel);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchInputUrl(fetchMock.mock.calls[0]?.[0])).toContain("recoup_cockpit_read_models");
    expect(fetchInputUrl(fetchMock.mock.calls[1]?.[0])).toContain("recoup_source_health_snapshots");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("http://recoup-api.test/connectors");
  });

  it("delegates Maya forensics reads to the backend freshness gate instead of serving direct cached read models", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const backendModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("http://recoup-api.test/forensics");
      expect(fetchInputUrl(input)).not.toContain("recoup_cockpit_read_models");
      expect(init).toMatchObject({ cache: "no-store", method: "GET" });
      expect(init?.headers).toMatchObject({
        "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
        "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
      });
      return Promise.resolve(
        Response.json(backendModel, {
          headers: {
            "x-recoup-read-model-cache": "stale",
            "x-recoup-read-model-receipt-hash": "b".repeat(64),
            "x-recoup-read-model-source-hash": "a".repeat(64)
          }
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof backendModel;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("stale");
    expect(response.headers.get("x-recoup-read-model-source-hash")).toBe("a".repeat(64));
    expect(response.headers.get("x-recoup-read-model-receipt-hash")).toBe("b".repeat(64));
    expect(body).toEqual(backendModel);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Render when the Maya forensics read model is absent", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const backendModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (fetchInputUrl(input).includes("recoup_cockpit_read_models")) {
        return Promise.resolve(Response.json([]));
      }

      expect(input).toBe("http://recoup-api.test/forensics");
      expect(init).toMatchObject({ cache: "no-store", method: "GET" });
      return Promise.resolve(Response.json(backendModel));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensics(
      new Request("http://localhost/api/forensics", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      })
    );
    const body = (await response.json()) as typeof backendModel;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("miss");
    expect(body).toEqual(backendModel);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects Forensics work-item proxy requests without request-bound human auth", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves cached Maya work-item detail before triggering a non-blocking Render refresh", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const cachedDetail = {
      lineId: "S6-L1",
      recoveryDraft: {
        actionId: "ACT-S6-L1"
      },
      selected: {
        evidencePack: {
          documents: [
            {
              contentHash: "c".repeat(64),
              documentType: "pod",
              evidenceId: "EVD-POD-S6-L1",
              receiptId: "RECON-S6-L1",
              storageHref: "/api/forensics/evidence-documents/EVD-POD-S6-L1",
              storageUri: "supabase://recoup_evidence_documents/EVD-POD-S6-L1"
            }
          ]
        },
        lineId: "S6-L1"
      },
      surface: "forensics-work-item-detail",
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6-L1" }
    };
    let sawCacheLookup = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models")) {
        sawCacheLookup = true;
        expect(init).toMatchObject({ method: "GET" });
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T00:00:00.000Z",
              model_key: "maya:forensics:work-item:S6-L1:v1",
              payload_hash: "b".repeat(64),
              payload_json: cachedDetail,
              persona: "maya",
              source_record_ids_json: ["S6-L1", "INV-S6-1", "recoup_deduction_lines"],
              source_refreshed_at: "2026-06-29T00:00:00.000Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }
      if (url.includes("recoup_memory_records")) {
        expect(init).toMatchObject({ method: "GET" });
        return Promise.resolve(Response.json([]));
      }

      expect(input).toBe("http://recoup-api.test/forensics/work-items/S6-L1");
      expect(sawCacheLookup).toBe(true);
      expect(init).toMatchObject({ cache: "no-store", method: "GET" });
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as typeof cachedDetail;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("hit");
    expect(body).toEqual(cachedDetail);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bypasses cached Maya work-item detail when approval memory has a newer receipt", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const cachedDetail = {
      lineId: "S6-L1",
      recoveryDraft: {
        actionId: "ACT-S6-L1"
      },
      selected: {
        evidencePack: {
          documents: [
            {
              contentHash: "c".repeat(64),
              documentType: "pod",
              evidenceId: "EVD-POD-S6-L1",
              receiptId: "RECON-S6-L1",
              storageHref: "/api/forensics/evidence-documents/EVD-POD-S6-L1",
              storageUri: "supabase://recoup_evidence_documents/EVD-POD-S6-L1"
            }
          ]
        },
        lineId: "S6-L1"
      },
      surface: "forensics-work-item-detail",
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6-L1" }
    };
    const freshBackendDetail = {
      ...cachedDetail,
      approvalReceipt: {
        actionId: "ACT-S6-L1",
        approverId: "human:maya-lead",
        auditEntryHash: "d".repeat(64),
        decision: "reject",
        recordIds: ["ACT-S6-L1", "S6-L1"],
        status: "human_decided"
      }
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models") && init?.method === "GET") {
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T00:00:00.000Z",
              model_key: "maya:forensics:work-item:S6-L1:v1",
              payload_hash: "b".repeat(64),
              payload_json: cachedDetail,
              persona: "maya",
              source_record_ids_json: ["S6-L1", "recoup_deduction_lines"],
              source_refreshed_at: "2026-06-29T00:00:00.000Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }
      if (url.includes("recoup_memory_records")) {
        return Promise.resolve(
          Response.json([
            {
              category: "approval_records",
              id: "approval:ACT-S6-L1",
              payload_json: {
                actionId: "ACT-S6-L1",
                approverId: "human:maya-lead",
                auditEntryHash: "d".repeat(64),
                decision: "reject",
                status: "human_decided"
              },
              scope: "approval:ACT-S6-L1",
              trust_level: "trusted"
            }
          ])
        );
      }
      if (url === "http://recoup-api.test/forensics/work-items/S6-L1") {
        return Promise.resolve(Response.json(freshBackendDetail));
      }
      if (url.includes("recoup_cockpit_read_models") && init?.method === "POST") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as typeof freshBackendDetail;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("miss");
    expect(body.approvalReceipt.auditEntryHash).toBe("d".repeat(64));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("bypasses cached Maya work-item detail when a cached receipt has been reset", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const cachedDetail = {
      approvalReceipt: {
        actionId: "ACT-S6-L1",
        approverId: "human:maya-lead",
        auditEntryHash: "d".repeat(64),
        decision: "reject",
        recordIds: ["ACT-S6-L1", "S6-L1"],
        status: "human_decided"
      },
      lineId: "S6-L1",
      recoveryDraft: {
        actionId: "ACT-S6-L1"
      },
      selected: {
        evidencePack: {
          documents: [
            {
              contentHash: "c".repeat(64),
              documentType: "pod",
              evidenceId: "EVD-POD-S6-L1",
              receiptId: "RECON-S6-L1",
              storageHref: "/api/forensics/evidence-documents/EVD-POD-S6-L1",
              storageUri: "supabase://recoup_evidence_documents/EVD-POD-S6-L1"
            }
          ]
        },
        lineId: "S6-L1"
      },
      surface: "forensics-work-item-detail",
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6-L1" }
    };
    const freshBackendDetail = {
      lineId: "S6-L1",
      recoveryDraft: {
        actionId: "ACT-S6-L1"
      },
      selected: cachedDetail.selected,
      surface: "forensics-work-item-detail",
      workItem: cachedDetail.workItem
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models") && init?.method === "GET") {
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T00:00:00.000Z",
              model_key: "maya:forensics:work-item:S6-L1:v1",
              payload_hash: "b".repeat(64),
              payload_json: cachedDetail,
              persona: "maya",
              source_record_ids_json: ["S6-L1", "recoup_deduction_lines"],
              source_refreshed_at: "2026-06-29T00:00:00.000Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }
      if (url.includes("recoup_memory_records")) {
        return Promise.resolve(Response.json([]));
      }
      if (url === "http://recoup-api.test/forensics/work-items/S6-L1") {
        return Promise.resolve(Response.json(freshBackendDetail));
      }
      if (url.includes("recoup_cockpit_read_models") && init?.method === "POST") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as typeof freshBackendDetail & { approvalReceipt?: unknown };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("miss");
    expect(body.approvalReceipt).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("bypasses stale cached Maya work-item detail when cached identity does not match the requested line", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const staleCachedDetail = {
      lineId: "S6-L1",
      selected: { lineId: "S6-L1" },
      surface: "forensics-work-item-detail",
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6" }
    };
    const freshBackendDetail = {
      ...staleCachedDetail,
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6-L1" }
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models") && init?.method === "GET") {
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T00:00:00.000Z",
              model_key: "maya:forensics:work-item:S6-L1:v1",
              payload_hash: "b".repeat(64),
              payload_json: staleCachedDetail,
              persona: "maya",
              source_record_ids_json: ["S6-L1", "recoup_deduction_lines"],
              source_refreshed_at: "2026-06-29T00:00:00.000Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }
      if (url === "http://recoup-api.test/forensics/work-items/S6-L1") {
        return Promise.resolve(Response.json(freshBackendDetail));
      }
      if (url.includes("recoup_cockpit_read_models") && init?.method === "POST") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as typeof freshBackendDetail;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("miss");
    expect(body.workItem.workItemId).toBe("S6-L1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bypasses cached Maya work-item detail when canonical evidence proof fields are missing", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const staleCachedDetail = {
      lineId: "S6-L1",
      selected: {
        evidencePack: {
          documents: [
            {
              documentType: "pod",
              documentId: "DOC-POD-S6-L1"
            }
          ]
        },
        lineId: "S6-L1"
      },
      surface: "forensics-work-item-detail",
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6-L1" }
    };
    const freshBackendDetail = {
      ...staleCachedDetail,
      selected: {
        evidencePack: {
          documents: [
            {
              contentHash: "c".repeat(64),
              documentType: "pod",
              evidenceId: "EVD-POD-S6-L1",
              receiptId: "RECON-S6-L1",
              storageUri: "supabase://recoup_evidence_documents/EVD-POD-S6-L1"
            }
          ]
        },
        lineId: "S6-L1"
      }
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models") && init?.method === "GET") {
        return Promise.resolve(
          Response.json([
            {
              generated_at: "2026-06-29T00:00:00.000Z",
              model_key: "maya:forensics:work-item:S6-L1:v1",
              payload_hash: "b".repeat(64),
              payload_json: staleCachedDetail,
              persona: "maya",
              source_record_ids_json: ["S6-L1", "recoup_deduction_lines"],
              source_refreshed_at: "2026-06-29T00:00:00.000Z",
              surface: "forensics-analyst"
            }
          ])
        );
      }
      if (url === "http://recoup-api.test/forensics/work-items/S6-L1") {
        return Promise.resolve(Response.json(freshBackendDetail));
      }
      if (url.includes("recoup_cockpit_read_models") && init?.method === "POST") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as typeof freshBackendDetail;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("miss");
    expect(body.selected.evidencePack.documents[0]?.evidenceId).toBe("EVD-POD-S6-L1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects Forensics force-refresh proxy requests without request-bound human auth", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postForensicsRefresh(
      new Request("http://localhost/api/forensics/refresh", {
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Maya force-refresh requests through the same-origin backend proxy", async () => {
    stubRouteEnv(mayaEnvPatch);
    const refreshModel = {
      selected: { lineId: "S6-L1" },
      surface: "forensics-analyst",
      worklist: [{ lineId: "S6-L1" }]
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json(refreshModel));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await postForensicsRefresh(
      new Request("http://localhost/api/forensics/refresh", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "POST"
      })
    );
    const body = (await response.json()) as typeof refreshModel;

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual(refreshModel);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/forensics/refresh");
    expect(init).toMatchObject({ cache: "no-store", method: "POST" });
    expect(init?.headers).toMatchObject({
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
  });

  it("forwards Forensics work-item detail requests from a valid Maya demo-session cookie", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json({ lineId: "S6-L1", surface: "forensics-work-item-detail" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as { lineId: string; surface: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ lineId: "S6-L1", surface: "forensics-work-item-detail" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/forensics/work-items/S6-L1");
    expect(init).toMatchObject({ cache: "no-store", method: "GET" });
    expect(init?.headers).toMatchObject({
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
  });

  it("publishes source-derived work-item detail cache after a Render detail miss", async () => {
    stubRouteEnv(mayaSupabaseEnvPatch);
    const backendDetail = {
      lineId: "S6-L1",
      selected: { lineId: "S6-L1" },
      surface: "forensics-work-item-detail",
      workItem: { lineId: "S6-L1", lineIds: ["S6-L1"], workItemId: "S6-L1" }
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchInputUrl(input);
      if (url.includes("recoup_cockpit_read_models") && init?.method === "GET") {
        return Promise.resolve(Response.json([]));
      }
      if (url === "http://recoup-api.test/forensics/work-items/S6-L1") {
        return Promise.resolve(Response.json(backendDetail));
      }
      if (url.includes("recoup_cockpit_read_models") && init?.method === "POST") {
        if (typeof init.body !== "string") {
          throw new Error("Expected read-model cache publish to send a JSON string body.");
        }
        const body = JSON.parse(init.body) as Array<{
          model_key: string;
          payload_json: { surface?: string };
          source_record_ids_json: string[];
          surface: string;
        }>;

        expect(body).toMatchObject([
          {
            model_key: "maya:forensics:work-item:S6-L1:v1",
            payload_json: { surface: "forensics-work-item-detail" },
            source_record_ids_json: ["S6-L1"],
            surface: "forensics-analyst"
          }
        ]);
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as typeof backendDetail;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-recoup-read-model-cache")).toBe("miss");
    expect(body).toEqual(backendDetail);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("preserves Forensics work-item upstream JSON error status and content type", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Forensics work item not found.", lineId: "NO-SUCH-LINE" }), {
          headers: { "content-type": "application/json; charset=utf-8" },
          status: 404
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/NO-SUCH-LINE", {
        headers: {
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "GET"
      }),
      { params: { lineId: "NO-SUCH-LINE" } }
    );
    const body = (await response.json()) as { error: string; lineId: string };

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(body).toEqual({ error: "Forensics work item not found.", lineId: "NO-SUCH-LINE" });
  });

  it("preserves Forensics work-item upstream fail-closed 503 JSON status", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        Response.json(
          {
            correlationId: "test-correlation",
            error: "Supabase settlement source rows are unavailable or failed validation.",
            missingSource: "supabase-settlement-source-rows"
          },
          { status: 503 }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as { correlationId: string; error: string; missingSource: string };

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      correlationId: "test-correlation",
      error: "Supabase settlement source rows are unavailable or failed validation.",
      missingSource: "supabase-settlement-source-rows"
    });
  });

  it("returns 502 when the Forensics work-item upstream service is unavailable", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await getForensicsWorkItem(
      new Request("http://localhost/api/forensics/work-items/S6-L1", {
        headers: {
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "GET"
      }),
      { params: { lineId: "S6-L1" } }
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ error: "Forensics work item detail service unavailable." });
  });

  it("rejects Forensics query proxy requests without request-bound human auth", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postForensicsQuery(
      new Request("http://localhost/api/forensics/query", {
        body: JSON.stringify({ question: "Why is this recoverable?", recordIds: ["S6-L1"], selectedLineId: "S6-L1" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards Forensics query requests from a valid Maya demo-session cookie", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        Response.json({
          answer: "Backend generated cited answer text",
          citations: [
            {
              deterministicBasis: "runForensicsInvestigation + evidence source reads + deterministic hook audit trace",
              recordId: "S6-L1"
            }
          ],
          deterministicBasis: "runForensicsInvestigation + evidence source reads + deterministic hook audit trace",
          trace: []
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();
    const requestBody = { question: "Why is this recoverable?", recordIds: ["INV-S6-1"], selectedLineId: "S6-L1" };

    const response = await postForensicsQuery(
      new Request("http://localhost/api/forensics/query", {
        body: JSON.stringify(requestBody),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );
    const body = (await response.json()) as { answer: string; status?: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.answer).toBe("Backend generated cited answer text");
    expect(body.status).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/forensics/query");
    expect(init).toMatchObject({ body: JSON.stringify(requestBody), cache: "no-store", method: "POST" });
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
  });

  it("preserves Forensics query upstream status and content type", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Forensics query selected line not found.", lineId: "NO-SUCH-LINE" }), {
          headers: { "content-type": "application/json; charset=utf-8" },
          status: 404
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await postForensicsQuery(
      new Request("http://localhost/api/forensics/query", {
        body: JSON.stringify({ question: "Why?", recordIds: ["NO-SUCH-LINE"], selectedLineId: "NO-SUCH-LINE" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );
    const body = (await response.json()) as { error: string; lineId: string };

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(body).toEqual({ error: "Forensics query selected line not found.", lineId: "NO-SUCH-LINE" });
  });

  it("returns 502 when the Forensics query upstream service is unavailable", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await postForensicsQuery(
      new Request("http://localhost/api/forensics/query", {
        body: JSON.stringify({ question: "Why is this recoverable?", recordIds: ["S6-L1"], selectedLineId: "S6-L1" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ error: "Forensics query service unavailable." });
  });

  it("forwards only a verified request-bound human principal to the client-secret service", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json({ status: "issued" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await postRealtimeClientSecret(
      new Request("http://localhost/api/query/realtime-client-secret", {
        body: JSON.stringify({ question: "Why is Harbor blocked?" }),
        headers: {
          "content-type": "application/json",
          "x-recoup-human-principal": "human:maya-lead",
          "x-recoup-human-token": "test-human-token"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/query/realtime-client-secret");
    expect(init?.headers).toMatchObject({
      "x-recoup-human-principal": "human:maya-lead",
      "x-recoup-human-token": "test-human-token"
    });
  });

  it("forwards Realtime client-secret requests from a valid Maya demo-session cookie", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json({ status: "issued" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await postRealtimeClientSecret(
      new Request("http://localhost/api/query/realtime-client-secret", {
        body: JSON.stringify({ question: "Which evidence supports S3-L1?" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/query/realtime-client-secret");
    expect(init?.headers).toMatchObject({
      "x-recoup-demo-role": "maya",
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
    expect(headerValue(init?.headers, "x-recoup-demo-proof")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(headerValue(init?.headers, "x-recoup-demo-issued-at")).toBeDefined();
    expect(headerValue(init?.headers, "x-recoup-demo-nonce")).toBeDefined();
    expect(headerValue(init?.headers, "x-recoup-demo-body-sha256")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects Realtime tool proxy requests without request-bound human auth", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postRealtimeTool(
      new Request("http://localhost/api/query/realtime-tool", {
        body: JSON.stringify({ argumentsJson: "{}", name: "query.answer" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only a verified request-bound human principal to the Realtime tool service", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json({ status: "tool_result" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await postRealtimeTool(
      new Request("http://localhost/api/query/realtime-tool", {
        body: JSON.stringify({ argumentsJson: "{}", name: "query.answer" }),
        headers: {
          "content-type": "application/json",
          "x-recoup-human-principal": "human:maya-lead",
          "x-recoup-human-token": "test-human-token"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/query/realtime-tool");
    expect(init?.headers).toMatchObject({
      "x-recoup-human-principal": "human:maya-lead",
      "x-recoup-human-token": "test-human-token"
    });
  });

  it("forwards Realtime tool requests from a valid Maya demo-session cookie", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(Response.json({ status: "tool_result" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createMayaSessionCookie();

    const response = await postRealtimeTool(
      new Request("http://localhost/api/query/realtime-tool", {
        body: JSON.stringify({ argumentsJson: "{}", name: "query.answer" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/query/realtime-tool");
    expect(init?.headers).toMatchObject({
      "x-recoup-demo-role": "maya",
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
    expect(headerValue(init?.headers, "x-recoup-demo-proof")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(headerValue(init?.headers, "x-recoup-demo-issued-at")).toBeDefined();
    expect(headerValue(init?.headers, "x-recoup-demo-nonce")).toBeDefined();
    expect(headerValue(init?.headers, "x-recoup-demo-body-sha256")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("also rejects approval proxy requests without request-bound human auth", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postApproval(
      new Request("http://localhost/api/approval", {
        body: JSON.stringify({ actionId: "act-1", decision: "approve" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards approval requests from a valid David demo-session cookie without direct human auth headers", async () => {
    stubRouteEnv(davidEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void input;
      void init;
      return Promise.resolve(Response.json({ status: "human_decided" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("david"),
        defaultRoute: roleHomeRoute("david"),
        displayName: "David Kim",
        loginId: "david",
        role: "david"
      },
      davidEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postApproval(
      new Request("http://localhost/api/approval", {
        body: JSON.stringify({ actionId: "propose-hold:6534", decision: "approve" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedCall = fetchMock.mock.calls[0];
    expect(forwardedCall?.[0]).toBe("http://recoup-api.test/approval");
    expect(forwardedCall?.[1]?.headers).toMatchObject({
      "x-recoup-demo-role": "david",
      "x-recoup-human-principal": davidEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": davidEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-proof")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-issued-at")).toBeDefined();
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-nonce")).toBeDefined();
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-body-sha256")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("forwards approval requests from a David demo session as the David human principal while the default cockpit principal remains Maya", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void input;
      void init;
      return Promise.resolve(Response.json({ status: "human_decided" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("david"),
        defaultRoute: roleHomeRoute("david"),
        displayName: "David Kim",
        loginId: "david",
        role: "david"
      },
      mayaEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postApproval(
      new Request("http://localhost/api/approval", {
        body: JSON.stringify({ actionId: "propose-hold:6534", decision: "approve" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedCall = fetchMock.mock.calls[0];
    expect(forwardedCall?.[1]?.headers).toMatchObject({
      "x-recoup-demo-role": "david",
      "x-recoup-human-principal": "human:david-lead",
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-proof")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-issued-at")).toBeDefined();
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-nonce")).toBeDefined();
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-body-sha256")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not sign demo proxy auth with the human bearer token as fallback secret", async () => {
    stubRouteEnv(envPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("david"),
        defaultRoute: roleHomeRoute("david"),
        displayName: "David Kim",
        loginId: "david",
        role: "david"
      },
      envPatch.RECOUP_COCKPIT_AUTH_TOKEN
    );

    const response = await postApproval(
      new Request("http://localhost/api/approval", {
        body: JSON.stringify({ actionId: "propose-hold:6534", decision: "approve" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use CFO demo-session cookies to authorize approval proxy requests", async () => {
    stubRouteEnv(cfoEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("cfo"),
        defaultRoute: roleHomeRoute("cfo"),
        displayName: "CFO",
        loginId: "CFO",
        role: "cfo"
      },
      cfoEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postApproval(
      new Request("http://localhost/api/approval", {
        body: JSON.stringify({ actionId: "propose-hold:6534", decision: "approve" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards admin demo reset requests only from a valid CFO demo-session cookie", async () => {
    stubRouteEnv(cfoEnvPatch);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void input;
      void init;
      return Promise.resolve(
        Response.json({
          actionId: "route-billing:S1-L1",
          deletedRecordCount: 1,
          resetScope: "approval:route-billing:S1-L1",
          status: "reset_recorded"
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("cfo"),
        defaultRoute: roleHomeRoute("cfo"),
        displayName: "CFO",
        loginId: "CFO",
        role: "cfo"
      },
      cfoEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );
    const body = JSON.stringify({ actionId: "route-billing:S1-L1", reason: "Prepare judge demo rerun" });

    const response = await postDemoReset(
      new Request("http://localhost/api/admin/demo-reset", {
        body,
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedCall = fetchMock.mock.calls[0];
    expect(forwardedCall?.[0]).toBe("http://recoup-api.test/admin/demo-reset");
    expect(forwardedCall?.[1]?.headers).toMatchObject({
      "x-recoup-demo-role": "cfo",
      "x-recoup-human-principal": "human:cfo-lead",
      "x-recoup-human-token": cfoEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-proof")).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-issued-at")).toBeDefined();
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-nonce")).toBeDefined();
    expect(headerValue(forwardedCall?.[1]?.headers, "x-recoup-demo-body-sha256")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects admin demo reset proxy requests from a Maya demo-session cookie", async () => {
    stubRouteEnv(mayaEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postDemoReset(
      new Request("http://localhost/api/admin/demo-reset", {
        body: JSON.stringify({ actionId: "route-billing:S1-L1", reason: "Prepare judge demo rerun" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${createMayaSessionCookie()}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use David demo-session cookies to authorize Realtime proxy requests", async () => {
    stubRouteEnv(davidEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("david"),
        defaultRoute: roleHomeRoute("david"),
        displayName: "David Kim",
        loginId: "david",
        role: "david"
      },
      davidEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postRealtimeClientSecret(
      new Request("http://localhost/api/query/realtime-client-secret", {
        body: JSON.stringify({ question: "Why is Harbor blocked?" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use David demo-session cookies to authorize Realtime tool proxy requests", async () => {
    stubRouteEnv(davidEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("david"),
        defaultRoute: roleHomeRoute("david"),
        displayName: "David Kim",
        loginId: "david",
        role: "david"
      },
      davidEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postRealtimeTool(
      new Request("http://localhost/api/query/realtime-tool", {
        body: JSON.stringify({ argumentsJson: "{}", name: "query.answer" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use CFO demo-session cookies to authorize Realtime client-secret proxy requests", async () => {
    stubRouteEnv(cfoEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("cfo"),
        defaultRoute: roleHomeRoute("cfo"),
        displayName: "CFO",
        loginId: "CFO",
        role: "cfo"
      },
      cfoEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postRealtimeClientSecret(
      new Request("http://localhost/api/query/realtime-client-secret", {
        body: JSON.stringify({ question: "What is the recovery posture?" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not use CFO demo-session cookies to authorize Realtime tool proxy requests", async () => {
    stubRouteEnv(cfoEnvPatch);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const signedSession = createSignedDemoSessionValue(
      {
        allowedRoutes: roleAllowedRoutes("cfo"),
        defaultRoute: roleHomeRoute("cfo"),
        displayName: "CFO",
        loginId: "CFO",
        role: "cfo"
      },
      cfoEnvPatch.RECOUP_DEMO_SESSION_SECRET
    );

    const response = await postRealtimeTool(
      new Request("http://localhost/api/query/realtime-tool", {
        body: JSON.stringify({ argumentsJson: "{}", name: "query.answer" }),
        headers: {
          "content-type": "application/json",
          cookie: `${demoSessionCookieName}=${signedSession}`
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a clean 401 for malformed human auth cookies", async () => {
    stubRouteEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await postApproval(
      new Request("http://localhost/api/approval", {
        body: JSON.stringify({ actionId: "act-1", decision: "approve" }),
        headers: {
          "content-type": "application/json",
          cookie: "recoup_human_principal=human%3Amaya-lead; recoup_human_token=%E0%A4%A"
        },
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function stubRouteEnv(env: Partial<Record<string, string>> = envPatch): void {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
}

function createMayaSessionCookie(): string {
  return createSignedDemoSessionValue(
    {
      allowedRoutes: roleAllowedRoutes("maya"),
      defaultRoute: roleHomeRoute("maya"),
      displayName: "Maya Patel",
      loginId: "Maya",
      role: "maya"
    },
    mayaEnvPatch.RECOUP_DEMO_SESSION_SECRET
  );
}

function headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (headers === undefined) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    return headers.find(([candidate]) => candidate.toLowerCase() === name.toLowerCase())?.[1];
  }

  return headers[name];
}

function upstreamWithBusinessHashes(hashes: { receiptHash: string; sourceHash: string }): Response {
  return Response.json(
    { surface: "forensics-analyst" },
    {
      headers: {
        "x-recoup-read-model-receipt-hash": hashes.receiptHash,
        "x-recoup-read-model-source-hash": hashes.sourceHash
      }
    }
  );
}

function fetchInputUrl(input: RequestInfo | URL | undefined): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }

  return input?.url ?? "";
}

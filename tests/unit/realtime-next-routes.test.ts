import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postApproval } from "../../cockpit/app/api/approval/route.js";
import { GET as getConnectors } from "../../cockpit/app/api/connectors/route.js";
import { POST as postForensicsQuery } from "../../cockpit/app/api/forensics/query/route.js";
import { GET as getForensicsWorkItem } from "../../cockpit/app/api/forensics/work-items/[lineId]/route.js";
import { POST as postRealtimeClientSecret } from "../../cockpit/app/api/query/realtime-client-secret/route.js";
import { POST as postRealtimeTool } from "../../cockpit/app/api/query/realtime-tool/route.js";
import {
  createSignedDemoSessionValue,
  demoSessionCookieName,
  roleAllowedRoutes,
  roleHomeRoute
} from "../../cockpit/app/demo-auth.js";

const envPatch = {
  RECOUP_API_URL: "http://recoup-api.test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
} as const;
const mayaEnvPatch = {
  ...envPatch,
  RECOUP_DEMO_SESSION_SECRET: "test-demo-session-secret"
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
    stubRouteEnv(mayaEnvPatch);
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
      void input;
      void init;
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://recoup-api.test/connectors");
    expect(init).toMatchObject({ cache: "no-store", method: "GET" });
    expect(init?.headers).toMatchObject({
      "x-recoup-human-principal": mayaEnvPatch.RECOUP_COCKPIT_HUMAN_PRINCIPAL,
      "x-recoup-human-token": mayaEnvPatch.RECOUP_COCKPIT_AUTH_TOKEN
    });
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

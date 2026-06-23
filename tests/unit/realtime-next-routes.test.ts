import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postApproval } from "../../cockpit/app/api/approval/route.js";
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

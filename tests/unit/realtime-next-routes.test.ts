import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as postApproval } from "../../cockpit/app/api/approval/route.js";
import { POST as postRealtimeClientSecret } from "../../cockpit/app/api/query/realtime-client-secret/route.js";
import { POST as postRealtimeTool } from "../../cockpit/app/api/query/realtime-tool/route.js";

const envPatch = {
  RECOUP_API_URL: "http://recoup-api.test",
  RECOUP_COCKPIT_AUTH_TOKEN: "test-human-token",
  RECOUP_COCKPIT_HUMAN_PRINCIPAL: "human:maya-lead"
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
});

function stubRouteEnv(): void {
  for (const [key, value] of Object.entries(envPatch)) {
    vi.stubEnv(key, value);
  }
}

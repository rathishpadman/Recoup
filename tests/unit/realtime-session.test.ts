import { describe, expect, it } from "vitest";
import { buildRealtimeSessionPolicy, requestRealtimeClientSecret } from "../../src/services/realtimeSession.js";

describe("Realtime session policy", () => {
  it("fails closed without an OpenAI API key", async () => {
    const result = await requestRealtimeClientSecret({
      env: {},
      fetcher: () => Promise.reject(new Error("fetch should not be called without credentials")),
      safetyIdentifier: "human-cfo"
    });

    expect(result.status).toBe("blocked_missing_credentials");
    expect(result.auditPolicy.recordIds).toContain("OPENAI-REALTIME-POLICY");
    expect(result.auditPolicy.allowedTools).toEqual(["audit.read", "query.answer"]);
    expect(result.auditPolicy.forbiddenPersistence).toEqual(["raw_audio", "uncited_transcript", "uncited_model_output"]);
    expect(result.deterministicBasis).toContain("runtime credential gate");
  });

  it("uses server credentials only for the upstream call and never returns the API key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await requestRealtimeClientSecret({
      env: { OPENAI_API_KEY: "sk-live-secret" },
      fetcher: (url, init) => {
        calls.push({ url: stringifyRequestUrl(url), init: init ?? {} });
        return Promise.resolve(
          new Response(JSON.stringify({ value: "ek_test_client_secret" }), {
            headers: { "content-type": "application/json" },
            status: 200
          })
        );
      },
      question: "why is harbor blocked",
      safetyIdentifier: "human-cfo"
    });

    expect(result.status).toBe("issued");
    if (result.status !== "issued") {
      throw new Error("Expected issued Realtime client secret.");
    }
    expect(result.clientSecret).toEqual({ value: "ek_test_client_secret" });
    expect(JSON.stringify(result)).not.toContain("sk-live-secret");
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    const upstreamRequestBody = calls[0]?.init.body;
    if (typeof upstreamRequestBody !== "string") {
      throw new Error("Expected Realtime upstream body to be a JSON string.");
    }
    const upstreamBody = JSON.parse(upstreamRequestBody) as {
      session: { instructions?: string; model: string; type: string };
    };
    expect(upstreamRequestBody).not.toContain("why is harbor blocked");
    expect(upstreamBody.session.instructions).toContain("cite deterministic Recoup recordIds");
    expect(upstreamBody.session.instructions).toContain("External actions are forbidden");
    expect(upstreamBody.session.instructions).toContain("Allowed tools: audit.read and query.answer");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: "Bearer sk-live-secret",
      "OpenAI-Safety-Identifier": "human-cfo"
    });
  });

  it("does not validate unrelated connector credentials before issuing a guarded client secret", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await requestRealtimeClientSecret({
      env: {
        OPENAI_API_KEY: "sk-live-secret",
        SAP_ODATA_BASE_URL: "sap-sandbox-host"
      },
      fetcher: (url, init) => {
        calls.push({ url: stringifyRequestUrl(url), init: init ?? {} });
        return Promise.resolve(
          new Response(JSON.stringify({ value: "ek_test_client_secret" }), {
            headers: { "content-type": "application/json" },
            status: 200
          })
        );
      },
      safetyIdentifier: "human-cfo"
    });

    expect(result.status).toBe("issued");
    expect(calls).toHaveLength(1);
  });

  it("declares the audit policy and planned model without making a network call", () => {
    const policy = buildRealtimeSessionPolicy({ OPENAI_API_KEY: "sk-live-secret" });

    expect(policy.status).toBe("ready_for_client_secret_request");
    expect(policy.model).toBe("gpt-realtime-2");
    expect(policy.auditPolicy.externalActions).toBe("none");
    expect(policy.auditPolicy.allowedTools).toEqual(["audit.read", "query.answer"]);
    expect(policy.auditPolicy.forbiddenPersistence).toContain("raw_audio");
    expect(policy.auditPolicy.retention).toContain("no raw audio");
  });
});

function stringifyRequestUrl(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }

  if (url instanceof URL) {
    return url.href;
  }

  return url.url;
}

import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import {
  buildRealtimeSessionPolicy,
  buildRealtimeToolManifest,
  handleRealtimeToolCall,
  requestRealtimeClientSecret
} from "../../src/services/realtimeSession.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { invokeServiceTool, serviceToolMetadata } from "../../src/services/serviceLayer.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });
const selectedQueryScope = {
  recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1", "SAP-INV-S3-1", "DOC-S3-L1"],
  selectedLineId: "S3-L1"
};

describe("Realtime session policy", () => {
  it("fails closed without an OpenAI API key", async () => {
    const result = await requestRealtimeClientSecret({
      env: {},
      fetcher: () => Promise.reject(new Error("fetch should not be called without credentials")),
      ...selectedQueryScope,
      safetyIdentifier: "human-cfo"
    });

    expect(result.status).toBe("blocked_missing_credentials");
    expect(result.auditPolicy.recordIds).toEqual(selectedQueryScope.recordIds);
    expect(result.auditPolicy.queryScope).toContain(selectedQueryScope.selectedLineId);
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
      ...selectedQueryScope,
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
      session: { instructions?: string; model: string; tools?: Array<{ name: string }>; type: string };
    };
    expect(upstreamRequestBody).not.toContain("why is harbor blocked");
    expect(upstreamRequestBody).toContain(selectedQueryScope.selectedLineId);
    expect(upstreamBody.session.instructions).toContain("cite deterministic Recoup recordIds");
    expect(upstreamBody.session.instructions).toContain(selectedQueryScope.selectedLineId);
    expect(upstreamBody.session.instructions).toContain("External actions are forbidden");
    expect(upstreamBody.session.instructions).toContain("Allowed tools: audit.read and query.answer");
    expect(upstreamBody.session.tools?.map((tool) => tool.name)).toEqual(["audit.read", "query.answer"]);
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
      ...selectedQueryScope,
      safetyIdentifier: "human-cfo"
    });

    expect(result.status).toBe("issued");
    expect(calls).toHaveLength(1);
  });

  it("declares the audit policy and planned model without making a network call", () => {
    const policy = buildRealtimeSessionPolicy({ OPENAI_API_KEY: "sk-live-secret" }, selectedQueryScope);

    expect(policy.status).toBe("ready_for_client_secret_request");
    expect(policy.model).toBe("gpt-realtime-2");
    expect(policy.auditPolicy.externalActions).toBe("none");
    expect(policy.auditPolicy.allowedTools).toEqual(["audit.read", "query.answer"]);
    expect(policy.auditPolicy.recordIds).toEqual(selectedQueryScope.recordIds);
    expect(policy.auditPolicy.queryScope).toContain(selectedQueryScope.selectedLineId);
    expect(policy.auditPolicy.forbiddenPersistence).toContain("raw_audio");
    expect(policy.auditPolicy.retention).toContain("no raw audio");
  });

  it("declares Realtime tools as a read-only deterministic subset of service tools", () => {
    const allowedTools = buildRealtimeSessionPolicy().auditPolicy.allowedTools;

    expect(allowedTools).toEqual(["audit.read", "query.answer"]);
    for (const toolName of allowedTools) {
      expect(serviceToolMetadata[toolName]).toMatchObject({
        riskClass: "read_only",
        sideEffectClass: "none"
      });
    }
    expect(allowedTools.some((toolName) => toolName.startsWith("actions."))).toBe(false);
    expect(allowedTools.some((toolName) => toolName.startsWith("approvals."))).toBe(false);
  });

  it("builds a browser-safe Realtime tool manifest without action or write-capable tools", () => {
    const manifest = buildRealtimeToolManifest();
    const serialized = JSON.stringify(manifest);
    const queryAnswerTool = manifest.find((tool) => tool.name === "query.answer");

    expect(manifest.map((tool) => tool.name)).toEqual(["audit.read", "query.answer"]);
    expect(queryAnswerTool?.parameters.required).toEqual(["question", "selectedLineId", "recordIds"]);
    expect(serialized).not.toMatch(/draft|approve|rebill|hold|terms|routeBilling|erp|write/iu);
  });

  it("blocks Realtime tool calls outside the deterministic query allowlist", () => {
    const result = handleRealtimeToolCall({
      argumentsJson: "{}",
      name: "actions.draftRebill"
    });

    expect(result).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_tool"
    });
    expect(result.deterministicBasis).toContain("Realtime tool allowlist");
  });

  it("returns query.answer output with voice/text citation parity", () => {
    const result = handleRealtimeToolCall({
      argumentsJson: JSON.stringify({ question: "Which selected evidence supports this deduction?", ...selectedQueryScope }),
      name: "query.answer"
    }, (name, input) => invokeServiceTool(name, input, { governedConfig, source }));

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected query.answer to be allowed.");
    }

    const output = result.output as {
      citationParity?: {
        parity: string;
        textRecordIds: string[];
        voiceRecordIds: string[];
      };
      recordIds?: string[];
    };

    expect(output.recordIds).toEqual(result.recordIds);
    expect(output.citationParity).toEqual({
      textRecordIds: result.recordIds,
      voiceRecordIds: result.recordIds,
      parity: "same_record_ids"
    });
    expect(output.recordIds).toEqual(selectedQueryScope.recordIds);
  });

  it("blocks query.answer calls that omit selected evidence scope", () => {
    const result = handleRealtimeToolCall({
      argumentsJson: JSON.stringify({ question: "Which selected evidence supports this deduction?" }),
      name: "query.answer"
    }, (name, input) => invokeServiceTool(name, input, { governedConfig, source }));

    expect(result).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_tool",
      toolName: "query.answer"
    });
    expect(result.deterministicBasis).toContain("selected evidence scope");
  });

  it("blocks query.answer output missing citation parity at the Realtime boundary", () => {
    const result = handleRealtimeToolCall({
      argumentsJson: JSON.stringify({ question: "Why is Harbor blocked?" }),
      name: "query.answer"
    }, () => ({
      answer: "Harbor is blocked from cited deterministic state.",
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"]
    }));

    expect(result).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_tool",
      toolName: "query.answer"
    });
    expect(result.deterministicBasis).toContain("citation parity");
  });

  it("blocks query.answer output with mismatched voice/text/record citations at the Realtime boundary", () => {
    const result = handleRealtimeToolCall({
      argumentsJson: JSON.stringify({ question: "Why is Harbor blocked?" }),
      name: "query.answer"
    }, () => ({
      answer: "Harbor is blocked from cited deterministic state.",
      citationParity: {
        textRecordIds: ["CUST-HARBOR"],
        voiceRecordIds: ["6534"],
        parity: "same_record_ids"
      },
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"]
    }));

    expect(result).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_tool",
      toolName: "query.answer"
    });
    expect(result.deterministicBasis).toContain("citation parity");
  });

  it("blocks query.answer output with malformed citation parity arrays at the Realtime boundary", () => {
    const result = handleRealtimeToolCall({
      argumentsJson: JSON.stringify({ question: "Why is Harbor blocked?" }),
      name: "query.answer"
    }, () => ({
      answer: "Harbor is blocked from cited deterministic state.",
      citationParity: {
        textRecordIds: ["CUST-HARBOR", 7],
        voiceRecordIds: ["CUST-HARBOR"],
        parity: "same_record_ids"
      },
      deterministicBasis: "query.answer + cited records",
      recordIds: ["CUST-HARBOR"]
    }));

    expect(result).toMatchObject({
      recordIds: ["OPENAI-REALTIME-POLICY"],
      status: "blocked_tool",
      toolName: "query.answer"
    });
    expect(result.deterministicBasis).toContain("citation parity");
  });

  it("rejects upstream client-secret responses that are not ephemeral keys", async () => {
    await expect(
      requestRealtimeClientSecret({
        env: { OPENAI_API_KEY: "sk-live-secret" },
        fetcher: () =>
          Promise.resolve(
            new Response(JSON.stringify({ value: "sk-leaked-server-key" }), {
              headers: { "content-type": "application/json" },
            status: 200
          })
        ),
        ...selectedQueryScope,
        safetyIdentifier: "human-cfo"
      })
    ).rejects.toThrow();
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

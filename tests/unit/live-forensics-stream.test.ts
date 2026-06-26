import { describe, expect, it } from "vitest";
import {
  runOpenAIForensicsAgentStream,
  streamLiveForensicsTraceEvents,
  type LiveForensicsOpenAiRunner,
  type LiveForensicsMcpGateway,
  type LiveForensicsStreamRunner
} from "../../src/agents/liveForensicsStream.js";
import type { RunStreamEvent } from "../../src/agents/openAiAgentsSdk.js";
import type { AgentHookAuditReceipt } from "../../src/services/conductor.js";

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }

  return collected;
}

describe("live forensics Agents SDK stream", () => {
  it("skips the live runner when OPENAI_API_KEY is not configured", async () => {
    let runnerCalled = false;
    const runner: LiveForensicsStreamRunner = () => {
      runnerCalled = true;
      throw new Error("The live runner must not be called without OPENAI_API_KEY.");
    };

    const events = await collect(streamLiveForensicsTraceEvents({ env: {}, runner }));

    expect(runnerCalled).toBe(false);
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "model-context",
          text: "Live Agents SDK stream skipped: OPENAI_API_KEY is not configured."
        }
      }
    ]);
  });

  it("maps streamed SDK events into non-decision forensics status events", async () => {
    const runner: LiveForensicsStreamRunner = async function* () {
      await Promise.resolve();
      yield {
        type: "raw_model_stream_event",
        data: {
          type: "response.output_text.delta",
          delta: "Live model is reviewing evidence references."
        }
      };
      yield {
        type: "raw_model_stream_event",
        data: {
          type: "output_text_delta",
          delta: " Local SDK normalized delta."
        }
      };
      yield {
        type: "agent_updated_stream_event",
        agent: {
          name: "Recovery Drafter"
        }
      };
      yield {
        type: "run_item_stream_event",
        name: "handoff_occurred",
        item: {}
      };
      yield {
        type: "raw_model_stream_event",
        data: {
          type: "response.output_text.delta",
          delta: " Never use $123.45 as a decision amount."
        }
      };
    };

    const events = await collect(
      streamLiveForensicsTraceEvents({ env: { OPENAI_API_KEY: "sk-test-secret" }, maxTurns: 7, retryCap: 0, runner })
    );
    const body = JSON.stringify(events);

    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream started for Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "model-text-delta",
          text: "Live model text delta received; content suppressed by Recoup output guard."
        }
      },
      {
        type: "status",
        payload: {
          kind: "model-text-delta",
          text: "Live model text delta received; content suppressed by Recoup output guard."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK active agent: Recovery Drafter."
        }
      },
      {
        type: "status",
        payload: {
          kind: "handoff",
          text: "Live Agents SDK handoff occurred."
        }
      },
      {
        type: "status",
        payload: {
          kind: "model-text-delta",
          text: "Live model text delta received; content suppressed by Recoup output guard."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream completed."
        }
      }
    ]);
    expect(body).not.toContain("sk-test-secret");
    expect(body).not.toContain("Live model is reviewing evidence references.");
    expect(body).not.toContain("Local SDK normalized delta.");
    expect(body).not.toContain("$123.45");
  });

  it("fails closed instead of defaulting live maxTurns when run-control is absent", async () => {
    let runnerCalled = false;
    const runner: LiveForensicsStreamRunner = () => {
      runnerCalled = true;
      return emptyStreamEvents;
    };

    const events = await collect(streamLiveForensicsTraceEvents({ env: { OPENAI_API_KEY: "sk-test-secret" }, runner }));

    expect(runnerCalled).toBe(false);
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream started for Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream failed closed; DB-backed run-control maxTurns is not configured."
        }
      }
    ]);
  });

  it("fails closed instead of defaulting live retryCap when run-control is absent", async () => {
    let runnerCalled = false;
    const runner: LiveForensicsStreamRunner = () => {
      runnerCalled = true;
      return emptyStreamEvents;
    };

    const events = await collect(
      streamLiveForensicsTraceEvents({ env: { OPENAI_API_KEY: "sk-test-secret" }, maxTurns: 7, runner })
    );

    expect(runnerCalled).toBe(false);
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream started for Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream failed closed; DB-backed run-control retryCap is not configured."
        }
      }
    ]);
  });

  it("records live token usage deltas only from explicit SDK usage metadata", async () => {
    const tokenDeltas: number[] = [];
    const runner: LiveForensicsStreamRunner = async function* () {
      await Promise.resolve();
      yield {
        type: "raw_model_stream_event",
        data: {
          response: {
            usage: {
              total_tokens: 10
            }
          },
          type: "response.completed"
        }
      };
      yield {
        type: "raw_model_stream_event",
        data: {
          response: {
            usage: {
              input_tokens: 8,
              output_tokens: 7
            }
          },
          type: "response.completed"
        }
      };
      yield {
        type: "raw_model_stream_event",
        data: {
          response: {
            usage: {
              total_tokens: 15
            }
          },
          type: "response.completed"
        }
      };
    };

    await collect(
      streamLiveForensicsTraceEvents({
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        retryCap: 1,
        onTokenUsage: (tokens) => tokenDeltas.push(tokens),
        runner
      })
    );

    expect(tokenDeltas).toEqual([10, 5]);
  });

  it("records and uses DB-backed live retry caps for recoverable stream failures", async () => {
    let runnerCalls = 0;
    let retryCount = 0;
    const runner: LiveForensicsStreamRunner = async function* () {
      runnerCalls += 1;
      await Promise.resolve();
      if (runnerCalls === 1) {
        throw new Error("temporary live stream failure");
      }
      yield {
        type: "raw_model_stream_event",
        data: {
          type: "response.output_text.delta",
          delta: "Recovered live model stream."
        }
      };
    };

    const events = await collect(
      streamLiveForensicsTraceEvents({
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        onRetry: () => {
          retryCount += 1;
        },
        retryCap: 1,
        runner
      })
    );

    expect(runnerCalls).toBe(2);
    expect(retryCount).toBe(1);
    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream started for Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream retrying after recoverable failure."
        }
      },
      {
        type: "status",
        payload: {
          kind: "model-text-delta",
          text: "Live model text delta received; content suppressed by Recoup output guard."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream completed."
        }
      }
    ]);
    expect(JSON.stringify(events)).not.toContain("Recovered live model stream.");
  });

  it("suppresses decision-like raw model deltas before they reach trace output", async () => {
    const runner: LiveForensicsStreamRunner = async function* () {
      await Promise.resolve();
      yield {
        type: "raw_model_stream_event",
        data: {
          type: "response.output_text.delta",
          delta: "S4 is invalid; pursue recovery; route billing; $123."
        }
      };
    };

    const events = await collect(
      streamLiveForensicsTraceEvents({ env: { OPENAI_API_KEY: "sk-test-secret" }, maxTurns: 7, retryCap: 0, runner })
    );
    const body = JSON.stringify(events);

    expect(body).toContain("Live model text delta received; content suppressed by Recoup output guard.");
    expect(body).not.toContain("invalid");
    expect(body).not.toContain("pursue recovery");
    expect(body).not.toContain("route billing");
    expect(body).not.toContain("$123");
  });

  it("passes cited record ids into live runner hook receipts without exposing hook outputs", async () => {
    const runner: LiveForensicsStreamRunner = async function* (request) {
      await Promise.resolve();
      request.agentHookAudit?.onReceipt({
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        eventType: "AgentHookAuditReceipt",
        hook: "agent_end",
        recordIds: request.agentHookAudit.recordIds
      });
      yield {
        type: "raw_model_stream_event",
        data: {
          type: "response.output_text.delta",
          delta: "Live hook stream stayed non-decision."
        }
      };
    };

    const events = await collect(
      streamLiveForensicsTraceEvents({
        agentHookRecordIds: ["S1-L1", "S1-L1", "S2-L3"],
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        retryCap: 1,
        runner
      })
    );

    expect(events).toContainEqual({
      type: "status",
      payload: {
        kind: "agent-boundary",
        text: "Agent hook audit receipt recorded: agent_end Forensics Investigator."
      }
    });
    expect(JSON.stringify(events)).not.toContain("sk-test-secret");
  });

  it("registers AgentHooks on the actual OpenAI runner before starting the streamed run", async () => {
    const receipts: AgentHookAuditReceipt[] = [];
    const fakeRunner = new FakeOpenAiRunner();

    await runOpenAIForensicsAgentStream(
      {
        agentHookAudit: {
          onReceipt: (receipt) => receipts.push(receipt),
          recordIds: ["S4-L2"]
        },
        apiKey: "sk-test-secret",
        input: "status only",
        maxTurns: 7
      },
      fakeRunner
    );

    expect(fakeRunner.listenerNames()).toEqual([
      "agent_start",
      "agent_end",
      "agent_handoff",
      "agent_tool_start",
      "agent_tool_end"
    ]);
    expect(receipts).toContainEqual({
      agentName: "Forensics Investigator",
      deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
      eventType: "AgentHookAuditReceipt",
      hook: "agent_start",
      recordIds: ["S4-L2"]
    });
    expect(fakeRunner.lastRunOptions?.maxTurns).toBe(7);
    expect(JSON.stringify(receipts)).not.toContain("secret final output");
  });

  it("connects MCP before the live OpenAI run and closes it after the stream is consumed", async () => {
    const receipts: AgentHookAuditReceipt[] = [];
    const fakeRunner = new FakeOpenAiRunner();
    const mcpServer = { name: "recoup-governed-data-plane" } as LiveForensicsMcpGateway["mcpServers"][number];
    const calls: string[] = [];
    const gateway: LiveForensicsMcpGateway = {
      mcpServers: [mcpServer],
      close() {
        calls.push("close");
        return Promise.resolve();
      },
      connect() {
        calls.push("connect");
        return Promise.resolve();
      }
    };

    const stream = await runOpenAIForensicsAgentStream(
      {
        agentHookAudit: {
          onReceipt: (receipt) => receipts.push(receipt),
          recordIds: ["S6-L1", "INV-S6-1"]
        },
        apiKey: "sk-test-secret",
        input: "status only",
        maxTurns: 7
      },
      fakeRunner,
      {
        mcpGatewayFactory: () => Promise.resolve(gateway)
      }
    );

    expect(calls).toEqual(["connect"]);
    expect(fakeRunner.lastAgent?.name).toBe("Forensics Investigator");
    expect(fakeRunner.lastAgent?.mcpServers).toBe(gateway.mcpServers);
    expect(fakeRunner.lastAgent?.modelSettings).toEqual({
      reasoning: { effort: "high" },
      text: { verbosity: "low" }
    });
    expect(receipts.some((receipt) => receipt.hook === "agent_start")).toBe(true);

    await collect(stream);

    expect(calls).toEqual(["connect", "close"]);
  });

  it("records governed MCP source receipts from SDK tool run-item events", async () => {
    const runner: LiveForensicsStreamRunner = async function* () {
      await Promise.resolve();
      yield sdkToolEvent("tool_called", "query_answer", "Forensics Investigator");
      yield sdkToolEvent("tool_output", "query_answer", "Forensics Investigator");
    };

    const events = await collect(
      streamLiveForensicsTraceEvents({
        agentHookRecordIds: ["S6-L1", "INV-S6-1"],
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        retryCap: 0,
        runner
      })
    );

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "status",
          payload: {
            kind: "agent-boundary",
            text: "Agent hook audit receipt recorded: agent_tool_start Forensics Investigator."
          }
        },
        {
          type: "status",
          payload: {
            kind: "agent-boundary",
            text: "Agent hook audit receipt recorded: agent_tool_end Forensics Investigator."
          }
        }
      ])
    );
  });

  it("records selected-evidence proof metadata from SDK query.answer input and output", async () => {
    const receipts: AgentHookAuditReceipt[] = [];
    const selectedRecordIds = ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"];
    const runner: LiveForensicsStreamRunner = async function* () {
      await Promise.resolve();
      yield sdkToolEvent("tool_called", "query_answer", "Forensics Investigator", {
        arguments: {
          question: "Why is this recoverable?",
          recordIds: selectedRecordIds,
          selectedLineId: "S6-L1"
        }
      });
      yield sdkToolEvent("tool_output", "query_answer", "Forensics Investigator", {
        output: {
          text: JSON.stringify({
            sourceReadStatus: "source_backed_selected_scope",
            sourceReads: {
              canonicalModel: "EvidenceDocument",
              primarySourceLabel: "SAP OData",
              primarySourceSystem: "sap_odata",
              sapEvidence: [
                {
                  documentId: "SAP-INV-S6-1",
                  documentType: "invoice",
                  recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
                  source: "sap",
                  summary: "Supabase SAP source row for S6 invoice."
                }
              ],
              selectedLineId: "S6-L1",
              selectedRecordIds,
              sourceFreshness: "snapshot",
              transportLabel: "Governed canonical snapshot",
              transportLayer: "supabase_canonical_snapshot"
            }
          }),
          type: "text"
        }
      });
    };

    await collect(
      streamLiveForensicsTraceEvents({
        agentHookRecordIds: selectedRecordIds,
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        onAgentHookReceipt: (receipt) => receipts.push(receipt),
        retryCap: 0,
        runner
      })
    );

    const toolEndReceipt = receipts.find((receipt) => receipt.hook === "agent_tool_end");
    expect(toolEndReceipt).toMatchObject({
      toolInputRecordIds: selectedRecordIds,
      toolInputSelectedLineId: "S6-L1",
      toolName: "query.answer",
      toolOutputCanonicalModel: "EvidenceDocument",
      toolOutputPrimarySourceLabel: "SAP OData",
      toolOutputPrimarySourceSystem: "sap_odata",
      toolOutputSapEvidenceRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
      toolOutputSelectedLineId: "S6-L1",
      toolOutputSelectedRecordIds: selectedRecordIds,
      toolOutputSourceFreshness: "snapshot",
      toolOutputSourceReadStatus: "source_backed_selected_scope",
      toolOutputTransportLabel: "Governed canonical snapshot",
      toolOutputTransportLayer: "supabase_canonical_snapshot"
    });
  });

  it("preserves selected-evidence input proof when SDK tool output omits the call id", async () => {
    const receipts: AgentHookAuditReceipt[] = [];
    const selectedRecordIds = ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"];
    const runner: LiveForensicsStreamRunner = async function* () {
      await Promise.resolve();
      yield sdkToolEvent("tool_called", "query_answer", "Forensics Investigator", {
        arguments: {
          recordIds: selectedRecordIds,
          selectedLineId: "S6-L1"
        },
        call_id: "query-answer-call-1"
      });
      yield sdkToolEvent("tool_output", "query_answer", "Forensics Investigator", {
        output: {
          text: JSON.stringify({
            sourceReadStatus: "source_backed_selected_scope",
            sourceReads: {
              canonicalModel: "EvidenceDocument",
              sapEvidence: [
                {
                  recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
                  source: "sap"
                }
              ],
              selectedLineId: "S6-L1",
              selectedRecordIds
            }
          }),
          type: "text"
        }
      });
    };

    await collect(
      streamLiveForensicsTraceEvents({
        agentHookRecordIds: selectedRecordIds,
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        onAgentHookReceipt: (receipt) => receipts.push(receipt),
        retryCap: 0,
        runner
      })
    );

    expect(receipts.find((receipt) => receipt.hook === "agent_tool_end")).toMatchObject({
      toolInputRecordIds: selectedRecordIds,
      toolInputSelectedLineId: "S6-L1",
      toolName: "query.answer",
      toolOutputCanonicalModel: "EvidenceDocument",
      toolOutputSapEvidenceRecordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
      toolOutputSelectedLineId: "S6-L1",
      toolOutputSelectedRecordIds: selectedRecordIds,
      toolOutputSourceReadStatus: "source_backed_selected_scope"
    });
  });

  it("does not treat a direct pre-run MCP call as a live SDK tool receipt", async () => {
    const receipts: AgentHookAuditReceipt[] = [];
    const fakeRunner = new FakeOpenAiRunner();
    const toolCalls: Array<{ args: Record<string, unknown> | null; toolName: string }> = [];
    const mcpServer = {
      name: "recoup-governed-data-plane",
      callTool(toolName: string, args: Record<string, unknown> | null) {
        toolCalls.push({ args, toolName });
        return Promise.resolve([{ text: "{\"status\":\"disabled_offline_safe\"}", type: "text" }]);
      },
      close: () => Promise.resolve(),
      connect: () => Promise.resolve(),
      invalidateToolsCache: () => Promise.resolve(),
      listTools: () => Promise.resolve([])
    } as unknown as LiveForensicsMcpGateway["mcpServers"][number];
    const gateway: LiveForensicsMcpGateway = {
      mcpServers: [mcpServer],
      close: () => Promise.resolve(),
      connect: () => Promise.resolve()
    };

    await runOpenAIForensicsAgentStream(
      {
        agentHookAudit: {
          onReceipt: (receipt) => receipts.push(receipt),
          recordIds: ["S6-L1", "INV-S6-1"]
        },
        apiKey: "sk-test-secret",
        input: "status only",
        maxTurns: 7
      },
      fakeRunner,
      {
        mcpGatewayFactory: () => Promise.resolve(gateway)
      }
    );

    expect(toolCalls).toEqual([]);
    expect(receipts.map((receipt) => [receipt.hook, receipt.toolName])).not.toEqual(
      expect.arrayContaining([["agent_tool_end", "query.answer"]])
    );
  });

  it("fails closed to deterministic run status when the live runner throws", async () => {
    const runner: LiveForensicsStreamRunner = () => Promise.reject(new Error("network secret sk-should-not-leak"));

    const events = await collect(
      streamLiveForensicsTraceEvents({ env: { OPENAI_API_KEY: "sk-test-secret" }, maxTurns: 7, retryCap: 0, runner })
    );

    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream started for Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream failed closed; deterministic forensics run continued."
        }
      }
    ]);
    expect(JSON.stringify(events)).not.toContain("sk-should-not-leak");
  });

  it("flushes buffered AgentHook receipts before a failed live stream closes", async () => {
    const runner: LiveForensicsStreamRunner = (request) => ({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            await Promise.resolve();
            request.agentHookAudit?.onReceipt({
              agentName: "Forensics Investigator",
              deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
              eventType: "AgentHookAuditReceipt",
              hook: "agent_start",
              recordIds: request.agentHookAudit.recordIds
            });
            throw new Error("network secret sk-should-not-leak");
          }
        };
      }
    });

    const events = await collect(
      streamLiveForensicsTraceEvents({
        agentHookRecordIds: ["S4-L2"],
        env: { OPENAI_API_KEY: "sk-test-secret" },
        maxTurns: 7,
        retryCap: 0,
        runner
      })
    );

    expect(events).toEqual([
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream started for Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Agent hook audit receipt recorded: agent_start Forensics Investigator."
        }
      },
      {
        type: "status",
        payload: {
          kind: "agent-boundary",
          text: "Live Agents SDK stream failed closed; deterministic forensics run continued."
        }
      }
    ]);
    expect(JSON.stringify(events)).not.toContain("sk-should-not-leak");
  });
});

type Listener = (...args: unknown[]) => void;

class FakeOpenAiRunner implements LiveForensicsOpenAiRunner {
  private readonly listeners = new Map<string, Listener>();
  lastAgent?: Parameters<LiveForensicsOpenAiRunner["run"]>[0];
  lastRunOptions?: { maxTurns: number; signal?: AbortSignal; stream: true };

  listenerNames(): string[] {
    return [...this.listeners.keys()];
  }

  on(type: string, listener: Listener): this {
    this.listeners.set(type, listener);
    return this;
  }

  run(
    agent: Parameters<LiveForensicsOpenAiRunner["run"]>[0],
    _input: string,
    options: { maxTurns: number; signal?: AbortSignal; stream: true }
  ): Promise<AsyncIterable<RunStreamEvent>> {
    this.lastAgent = agent;
    this.lastRunOptions = options;
    this.listeners.get("agent_start")?.({}, { name: "Forensics Investigator" });
    this.listeners.get("agent_end")?.({}, { name: "Forensics Investigator" }, "secret final output");

    return Promise.resolve(emptyStreamEvents);
  }
}

const emptyStreamEvents: AsyncIterable<RunStreamEvent> = {
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.resolve({ done: true, value: undefined })
    };
  }
};

function sdkToolEvent(
  name: "tool_called" | "tool_output",
  toolName: string,
  agentName: string,
  rawItemOverrides: Record<string, unknown> = {}
): RunStreamEvent {
  return {
    item: {
      agent: { name: agentName },
      rawItem: {
        ...rawItemOverrides,
        name: toolName,
        type: name === "tool_called" ? "function_call" : "function_call_result"
      }
    },
    name,
    type: "run_item_stream_event"
  } as unknown as RunStreamEvent;
}

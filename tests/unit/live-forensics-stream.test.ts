import { describe, expect, it } from "vitest";
import {
  runOpenAIForensicsAgentStream,
  streamLiveForensicsTraceEvents,
  type LiveForensicsOpenAiRunner,
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
  lastRunOptions?: { maxTurns: number; signal?: AbortSignal; stream: true };

  listenerNames(): string[] {
    return [...this.listeners.keys()];
  }

  on(type: string, listener: Listener): this {
    this.listeners.set(type, listener);
    return this;
  }

  run(
    _agent: Parameters<LiveForensicsOpenAiRunner["run"]>[0],
    _input: string,
    options: { maxTurns: number; signal?: AbortSignal; stream: true }
  ): Promise<AsyncIterable<RunStreamEvent>> {
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

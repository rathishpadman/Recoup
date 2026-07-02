import { describe, expect, it, vi } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { runForensicsInvestigation } from "../../src/agents/forensics.js";
import type { LiveForensicsStreamRunner } from "../../src/agents/liveForensicsStream.js";
import {
  createAgentHookAuditReceipt,
  liveSdkAgentHookDeterministicBasis
} from "../../src/services/conductor.js";
import { invokeServiceTool } from "../../src/services/serviceLayer.js";
import {
  ForensicsQueryLineNotFoundError,
  forensicsQueryDeterministicBasis,
  runForensicsQuerySessionWithLiveAgents,
  runForensicsQuerySession,
  type ForensicsQueryTracePhase
} from "../../src/services/forensicsQuerySession.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const validS6SubmittedRecordIds = ["INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"] as const;
const validS6HookRecordIds = ["S6-L1", ...validS6SubmittedRecordIds] as const;

function buildServiceInput(overrides: Partial<Parameters<typeof runForensicsQuerySession>[0]> = {}) {
  const source = new SyntheticSource({ seed: 42 });

  return {
    governedConfig,
    question: "Why is this recoverable?",
    recordIds: [...validS6SubmittedRecordIds],
    selectedLineId: "S6-L1",
    serviceContext: fixtureForensicsServiceContext,
    source,
    ...overrides
  };
}

function runForensicsFromServiceInput(overrides: Partial<Parameters<typeof runForensicsQuerySession>[0]> = {}) {
  const input = buildServiceInput(overrides);

  return runForensicsInvestigation({
    governedConfig: input.governedConfig,
    ...(input.reconciliation === undefined ? {} : { reconciliation: input.reconciliation }),
    serviceContext: input.serviceContext,
    source: input.source
  });
}

describe("forensics query session", () => {
  it("adds live OpenAI Agents SDK handoff trace before returning a live-agent-backed Maya query answer", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      expect(request.input).toContain("Selected Maya forensics query");
      expect(request.input).toContain("query_answer");
      expect(request.input).toContain("Recoup service query.answer");
      expect(request.input).toContain("Do not call query_answer again");
      expect(request.input).toContain("transfer_to_Recovery_Drafter");
      expect(request.input).toContain("hand off to Recovery Drafter");
      expect(request.agentHookAudit?.recordIds).toEqual([...validS6HookRecordIds]);
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit?.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkSelectedEvidenceToolEvent("tool_called", "query_answer", "Forensics Investigator");
        yield sdkSelectedEvidenceToolEvent("tool_output", "query_answer", "Forensics Investigator");
        yield {
          data: {
            delta: "Live answer candidate received and suppressed by the Recoup answer guard.",
            type: "output_text_delta"
          },
          type: "raw_model_stream_event"
        };
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    expect(liveRunner).toHaveBeenCalledTimes(1);
    expect(result.modelExecution).toMatchObject({
      agentNames: ["Forensics Investigator", "Recovery Drafter"],
      deterministicBasis: "OpenAI Agents SDK live trace + Recoup deterministic query answer guard",
      handoffCount: 1,
      mode: "live_openai_agents",
      rawModelTextPolicy: "suppressed"
    });
    expect(result.answer).toContain("S6-L1");
    expect(result.answer).not.toContain("$");
    expect(result.trace.some((event) => event.hook === "agent_handoff" && event.nextAgentName === "Recovery Drafter")).toBe(true);
    expect(result.trace.some((event) => event.agentName === "Recovery Drafter")).toBe(true);
    expect(result.trace.every((event) => event.recordIds.includes("S6-L1"))).toBe(true);
    expect(result.trace.some((event) => event.receiptDeterministicBasis === liveSdkAgentHookDeterministicBasis)).toBe(true);
    expect(
      result.trace.find(
        (event) =>
          event.hook === "agent_tool_end" &&
          event.toolName === "query.answer" &&
          event.receiptDeterministicBasis === liveSdkAgentHookDeterministicBasis
      )
    ).toMatchObject({
      retrievalSource: "sap_odata",
      sourceFreshness: "snapshot",
      sourceKind: "sap_odata",
      transportLabel: "Governed canonical snapshot",
      transportLayer: "supabase_canonical_snapshot"
    });
  });

  it("keeps proof-rich SAP source metadata when a duplicate proofless live receipt arrives first", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_tool_end",
          recordIds: request.agentHookAudit.recordIds,
          toolName: "query_answer"
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkSelectedEvidenceToolEvent("tool_called", "query_answer", "Forensics Investigator");
        yield sdkSelectedEvidenceToolEvent("tool_output", "query_answer", "Forensics Investigator");
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );
    const queryAnswerTrace = result.trace.find(
      (event) =>
        event.hook === "agent_tool_end" &&
        event.toolName === "query.answer" &&
        event.receiptDeterministicBasis === liveSdkAgentHookDeterministicBasis
    );

    expect(queryAnswerTrace).toMatchObject({
      retrievalSource: "sap_odata",
      sourceFreshness: "snapshot",
      sourceKind: "sap_odata",
      transportLabel: "Governed canonical snapshot",
      transportLayer: "supabase_canonical_snapshot"
    });
  });

  it("accepts SDK-sanitized MCP tool hook names and renders Recoup service tool names in trace", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkSelectedEvidenceToolEvent("tool_called", "query_answer", "Forensics Investigator");
        yield sdkSelectedEvidenceToolEvent("tool_output", "query_answer", "Forensics Investigator");
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    expect(result.modelExecution).toBeDefined();
    expect(result.modelExecution?.mode).toBe("live_openai_agents");
    expect(result.trace.some((event) => event.hook === "agent_tool_end" && event.toolName === "query.answer")).toBe(
      true
    );
  });

  it("blocks live Maya query answers when MCP proof is only a manufactured hook receipt", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_tool_end",
          recordIds: request.agentHookAudit.recordIds,
          toolName: "query.answer"
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return emptyLiveQueryStream();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    expect(liveRunner).toHaveBeenCalledTimes(1);
    expect(result.modelExecution).toMatchObject({
      deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
      mode: "blocked_live_agent_trace"
    });
    expect(result.answer).toBeUndefined();
  });

  it("blocks live Maya query answers when SDK query.answer output lacks selected evidence source proof", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkToolEvent("tool_called", "query_answer", "Forensics Investigator");
        yield sdkToolEvent("tool_output", "query_answer", "Forensics Investigator");
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    expect(result.modelExecution).toMatchObject({
      deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
      mode: "blocked_live_agent_trace"
    });
    expect(result.citations).toEqual([]);
  });

  it("deduplicates SDK hook and stream-item receipts for the same MCP source call", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_tool_start",
          recordIds: request.agentHookAudit.recordIds,
          toolName: "query_answer"
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_tool_end",
          recordIds: request.agentHookAudit.recordIds,
          toolName: "query_answer"
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkSelectedEvidenceToolEvent("tool_called", "query_answer", "Forensics Investigator");
        yield sdkSelectedEvidenceToolEvent("tool_output", "query_answer", "Forensics Investigator");
        yield {
          data: {
            delta: "Live answer candidate received and suppressed by the Recoup answer guard.",
            type: "output_text_delta"
          },
          type: "raw_model_stream_event"
        };
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    const liveMcpToolRows = result.trace.filter(
      (event) =>
        event.receiptDeterministicBasis === liveSdkAgentHookDeterministicBasis && event.toolName === "query.answer"
    );

    expect(liveMcpToolRows.map((event) => event.hook)).toEqual(["agent_tool_start", "agent_tool_end"]);
  });

  it("fails closed instead of returning a cited answer when live agent execution is unavailable", async () => {
    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: {},
          maxTurns: 2,
          retryCap: 0
        }
      })
    );

    expect(result).toEqual({
      citations: [],
      modelExecution: {
        deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
        mode: "blocked_missing_credentials",
        reason: "OPENAI_API_KEY is not configured"
      },
      trace: []
    });
  });

  it("fails closed when the live handoff is not from Forensics Investigator to Recovery Drafter", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Risk-Mesh Supervisor",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield {
          data: {
            delta: "Wrong-source live handoff candidate suppressed.",
            type: "output_text_delta"
          },
          type: "raw_model_stream_event"
        };
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    expect(result).toEqual({
      citations: [],
      modelExecution: {
        deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
        mode: "blocked_live_agent_trace",
        reason: "Live Agents SDK trace did not include the required Forensics-to-Recovery handoff."
      },
      trace: []
    });
  });

  it("fails closed when live Maya trace has a handoff but no governed MCP source tool receipt", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield {
          data: {
            delta: "Handoff-only live trace candidate suppressed.",
            type: "output_text_delta"
          },
          type: "raw_model_stream_event"
        };
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        }
      })
    );

    expect(result).toEqual({
      citations: [],
      modelExecution: {
        deterministicBasis: "OpenAI Agents SDK live trace required for Maya query answers.",
        mode: "blocked_live_agent_trace",
        reason: "Live Agents SDK trace did not include a successful selected-evidence MCP query.answer source read."
      },
      trace: []
    });
  });

  it("requires a selected line and scoped record IDs without requiring selectedLineId duplication", () => {
    expect(() =>
      runForensicsQuerySession(buildServiceInput({ selectedLineId: " " }))
    ).toThrow("Forensics query requires selectedLineId.");

    expect(() => runForensicsQuerySession(buildServiceInput({ recordIds: [] }))).toThrow(
      "Forensics query requires selected recordIds."
    );

    const result = runForensicsQuerySession(buildServiceInput({ recordIds: ["INV-S6-1", "SAP-INV-S6-1"] }));
    expect(result.answer).toContain("S6-L1");
    expect(result.citations.map((citation) => citation.recordId)).toEqual(
      expect.arrayContaining(["S6-L1", "INV-S6-1", "SAP-INV-S6-1"])
    );
  });

  it("invokes backend forensic orchestration, emits hook-receipt-backed query trace phases, and cites evidence records", () => {
    const orchestration = vi.fn(runForensicsInvestigation);
    const result = runForensicsQuerySession(buildServiceInput({ runForensics: orchestration }));
    const phases = result.trace.map((event) => event.phase);
    const keys = Object.keys(result).sort();

    expect(orchestration).toHaveBeenCalledTimes(1);
    expect(orchestration).toHaveBeenCalledWith(
      expect.objectContaining({
        agentHookRecordIds: [...validS6HookRecordIds]
      })
    );
    expect(keys).toEqual(["answer", "citations", "deterministicBasis", "trace"]);
    expect(result.answer).toContain("S6-L1");
    expect(result.answer).toContain("record IDs");
    expect(phases).toEqual(["supervisor", "query", "retrieval", "decision"] satisfies ForensicsQueryTracePhase[]);
    expect(result.trace.every((event) => event.recordIds.includes("S6-L1"))).toBe(true);
    expect(result.trace.every((event) => event.deterministicBasis === forensicsQueryDeterministicBasis)).toBe(true);
    expect(result.trace.map((event) => event.hook)).toEqual(["agent_start", "agent_tool_start", "agent_tool_end", "agent_end"]);
    expect(result.citations.map((citation) => citation.recordId)).toEqual(
      expect.arrayContaining(["S6-L1", "INV-S6-1", "SAP-INV-S6-1"])
    );
    expect(result.deterministicBasis).toBe("runForensicsInvestigation + evidence source reads + deterministic hook audit trace");
    expect(result.trace.every((event) => event.receiptDeterministicBasis === "Recoup deterministic forensics hook audit event")).toBe(true);
  });

  it("accepts canonical reconciliation receipt and evidence IDs for the selected line query scope", () => {
    const result = runForensicsQuerySession(
      buildServiceInput({
        reconciliation: buildCanonicalS6Reconciliation(),
        recordIds: ["INV-S6-1", "RECON-S6-L1", "EVD-SAP-S6-L1", "SAP-CANON-S6-L1"]
      })
    );

    expect(result.answer).toContain("S6-L1");
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordId: "RECON-S6-L1", source: "supabase" }),
        expect.objectContaining({ documentId: "EVD-SAP-S6-L1", recordId: "EVD-SAP-S6-L1", source: "sap" }),
        expect.objectContaining({ documentId: "EVD-SAP-S6-L1", recordId: "SAP-CANON-S6-L1", source: "sap" })
      ])
    );
  });

  it("accepts live selected canonical evidence proof without SAP evidence when SAP is degraded", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkCanonicalSelectedEvidenceToolEvent("tool_called", "query_answer", "Forensics Investigator");
        yield sdkCanonicalSelectedEvidenceToolEvent("tool_output", "query_answer", "Forensics Investigator");
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        },
        reconciliation: buildCanonicalS6NonSapReconciliation(),
        recordIds: ["INV-S6-1", "RECON-S6-L1", "EVD-POD-S6-L1", "POD-S6-L1", "EVD-REMIT-S6-L1"]
      })
    );
    const queryAnswerTrace = result.trace.find(
      (event) =>
        event.hook === "agent_tool_end" &&
        event.toolName === "query.answer" &&
        event.receiptDeterministicBasis === liveSdkAgentHookDeterministicBasis
    );

    expect(result.modelExecution?.mode).toBe("live_openai_agents");
    expect(queryAnswerTrace).toMatchObject({
      retrievalSource: "supabase",
      sourceFreshness: "snapshot",
      sourceKind: "supabase",
      transportLabel: "Governed canonical snapshot",
      transportLayer: "supabase_canonical_snapshot"
    });
    expect(result.trace.some((event) => event.retrievalSource === "sap_odata")).toBe(false);
  });

  it("passes top-level reconciliation into the live MCP query.answer service context", async () => {
    const liveRunner = vi.fn<LiveForensicsStreamRunner>((request) => {
      if (request.agentHookAudit === undefined) {
        throw new Error("Expected live query agent hook audit.");
      }

      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Forensics Investigator",
          hook: "agent_handoff",
          nextAgentName: "Recovery Drafter",
          recordIds: request.agentHookAudit.recordIds
        })
      );
      request.agentHookAudit.onReceipt(
        createAgentHookAuditReceipt({
          agentName: "Recovery Drafter",
          hook: "agent_start",
          recordIds: request.agentHookAudit.recordIds
        })
      );

      const selectedRecordIds = ["S6-L1", "INV-S6-1", "RECON-S6-L1", "EVD-POD-S6-L1", "POD-S6-L1", "EVD-REMIT-S6-L1"];
      const toolOutput = invokeServiceTool(
        "query.answer",
        {
          question: "Why is this recoverable?",
          recordIds: selectedRecordIds,
          selectedLineId: "S6-L1"
        },
        {
          ...request.mcpServiceContext,
          requireSupabaseSapEvidence: true,
          sapEvidenceSource: {
            readEvidence() {
              return [];
            }
          }
        }
      );

      return (async function* stream() {
        await Promise.resolve();
        yield sdkToolEvent("tool_called", "query_answer", "Forensics Investigator", {
          arguments: {
            question: "Why is this recoverable?",
            recordIds: selectedRecordIds,
            selectedLineId: "S6-L1"
          }
        });
        yield sdkToolEvent("tool_output", "query_answer", "Forensics Investigator", {
          output: toolOutput
        });
      })();
    });

    const result = await runForensicsQuerySessionWithLiveAgents(
      buildServiceInput({
        liveAgentTrace: {
          env: { OPENAI_API_KEY: "sk-test-live-query" },
          maxTurns: 2,
          retryCap: 0,
          runner: liveRunner
        },
        reconciliation: buildCanonicalS6NonSapReconciliation(),
        recordIds: ["INV-S6-1", "RECON-S6-L1", "EVD-POD-S6-L1", "POD-S6-L1", "EVD-REMIT-S6-L1"],
        serviceContext: {
          ...fixtureForensicsServiceContext,
          governedConfig,
          source: new SyntheticSource({ seed: 42 })
        }
      })
    );

    expect(result.modelExecution?.mode).toBe("live_openai_agents");
    expect(
      result.trace.find(
        (event) =>
          event.hook === "agent_tool_end" &&
          event.toolName === "query.answer" &&
          event.receiptDeterministicBasis === liveSdkAgentHookDeterministicBasis
      )
    ).toMatchObject({
      retrievalSource: "supabase",
      sourceKind: "supabase"
    });
  });

  it("returns no answer when agent hook receipts are missing", () => {
    const run = runForensicsFromServiceInput();
    const result = runForensicsQuerySession(
      buildServiceInput({
        runForensics: () => ({
          ...run,
          agentHookReceipts: []
        })
      })
    );

    expect(Object.keys(result).sort()).toEqual(["citations", "trace"]);
    expect(result.answer).toBeUndefined();
    expect(result.citations).toEqual([]);
    expect(result.trace).toEqual([]);
  });

  it("returns no answer when submitted evidence record IDs do not match the selected decision", () => {
    const result = runForensicsQuerySession(buildServiceInput({ recordIds: ["NOT-A-REAL-RECORD"] }));

    expect(Object.keys(result).sort()).toEqual(["citations", "trace"]);
    expect(result.answer).toBeUndefined();
    expect(result.deterministicBasis).toBeUndefined();
    expect(result.citations).toEqual([]);
    expect(result.trace).toEqual([]);
  });

  it("returns no answer when any submitted evidence record ID is stale", () => {
    const result = runForensicsQuerySession(buildServiceInput({ recordIds: ["INV-S6-1", "STALE-ID"] }));

    expect(Object.keys(result).sort()).toEqual(["citations", "trace"]);
    expect(result.answer).toBeUndefined();
    expect(result.deterministicBasis).toBeUndefined();
    expect(result.citations).toEqual([]);
    expect(result.trace).toEqual([]);
  });

  it("returns no answer when deterministic forensics orchestration trace is missing", () => {
    const run = runForensicsFromServiceInput();
    const result = runForensicsQuerySession(
      buildServiceInput({
        runForensics: () => ({
          ...run,
          agentHookReceipts: buildQueryHookReceipts([...validS6HookRecordIds]),
          trace: []
        })
      })
    );

    expect(Object.keys(result).sort()).toEqual(["citations", "trace"]);
    expect(result.answer).toBeUndefined();
    expect(result.deterministicBasis).toBeUndefined();
    expect(result.citations).toEqual([]);
    expect(result.trace).toEqual([]);
  });

  it("returns no answer when deterministic basis is missing", () => {
    const run = runForensicsFromServiceInput();
    const result = runForensicsQuerySession(
      buildServiceInput({
        runForensics: () =>
          ({
            ...run,
            decisions: run.decisions.map((decision) =>
              decision.lineId === "S6-L1"
                ? {
                    ...decision,
                    deterministicBasis: undefined
                  }
                : decision
            ),
            agentHookReceipts: buildQueryHookReceipts([...validS6HookRecordIds])
          }) as unknown as ReturnType<typeof runForensicsInvestigation>
      })
    );

    expect(Object.keys(result).sort()).toEqual(["citations", "trace"]);
    expect(result.answer).toBeUndefined();
    expect(result.citations).toEqual([]);
  });

  it("surfaces a typed not-found error for unknown selected lines", () => {
    expect(() =>
      runForensicsQuerySession(buildServiceInput({ recordIds: ["INV-S6-1"], selectedLineId: "NO-SUCH-LINE" }))
    ).toThrow(ForensicsQueryLineNotFoundError);
  });
});

function buildQueryHookReceipts(recordIds: string[]) {
  return [
    createAgentHookAuditReceipt({
      agentName: "Forensics Supervisor",
      deterministicBasis: "Recoup deterministic forensics hook audit event",
      hook: "agent_start",
      recordIds
    }),
    createAgentHookAuditReceipt({
      agentName: "Forensics Query",
      deterministicBasis: "Recoup deterministic forensics hook audit event",
      hook: "agent_tool_start",
      recordIds,
      toolName: "query.answer"
    }),
    createAgentHookAuditReceipt({
      agentName: "Forensics Retrieval",
      deterministicBasis: "Recoup deterministic forensics hook audit event",
      hook: "agent_tool_end",
      recordIds,
      toolName: "retrieval.evidence"
    }),
    createAgentHookAuditReceipt({
      agentName: "Forensics Decision",
      deterministicBasis: "Recoup deterministic forensics hook audit event",
      hook: "agent_end",
      recordIds
    })
  ];
}

function buildCanonicalS6Reconciliation(): NonNullable<Parameters<typeof runForensicsQuerySession>[0]["reconciliation"]> {
  return {
    evidenceDataset: {
      claims: [],
      documents: [
        {
          contentHash: "a".repeat(64),
          customerId: "CUST-S6",
          documentType: "sap_invoice",
          evidenceId: "EVD-SAP-S6-L1",
          payload: { lineId: "S6-L1" },
          provenance: "sap_odata",
          retrievedAt: "2026-07-01T00:00:00.000Z",
          sourceRecordId: "SAP-CANON-S6-L1",
          sourceSystem: "sap_odata"
        }
      ],
      links: []
    },
    receipts: [
      {
        claimId: "CLAIM-S6-L1",
        confidenceFactors: {},
        contentHash: "b".repeat(64),
        derivedRuleInput: {
          claimedAmount: "10.00",
          lineId: "S6-L1",
          period: "2026-07",
          recordIds: ["S6-L1", "EVD-SAP-S6-L1"],
          ruleId: "pricing-below-contract"
        },
        deterministicBasis: {},
        evidenceIds: ["EVD-SAP-S6-L1"],
        lineId: "S6-L1",
        receiptId: "RECON-S6-L1",
        ruleId: "pricing-below-contract"
      }
    ]
  };
}

function buildCanonicalS6NonSapReconciliation(): NonNullable<Parameters<typeof runForensicsQuerySession>[0]["reconciliation"]> {
  return {
    evidenceDataset: {
      claims: [],
      documents: [
        {
          contentHash: "c".repeat(64),
          customerId: "CUST-S6",
          documentType: "pod",
          evidenceId: "EVD-POD-S6-L1",
          payload: { lineId: "S6-L1" },
          provenance: "source_generated",
          retrievedAt: "2026-07-01T00:00:00.000Z",
          sourceRecordId: "POD-S6-L1",
          sourceSystem: "three_pl"
        },
        {
          contentHash: "d".repeat(64),
          customerId: "CUST-S6",
          documentType: "remittance_advice",
          evidenceId: "EVD-REMIT-S6-L1",
          payload: { lineId: "S6-L1" },
          provenance: "source_generated",
          retrievedAt: "2026-07-01T00:00:00.000Z",
          sourceRecordId: "REMIT-S6-L1",
          sourceSystem: "remittance"
        }
      ],
      links: []
    },
    receipts: [
      {
        claimId: "CLAIM-S6-L1",
        confidenceFactors: {},
        contentHash: "e".repeat(64),
        derivedRuleInput: {
          claimedAmount: "10.00",
          lineId: "S6-L1",
          period: "2026-07",
          recordIds: ["S6-L1", "EVD-POD-S6-L1", "EVD-REMIT-S6-L1"],
          ruleId: "pricing-below-contract"
        },
        deterministicBasis: {},
        evidenceIds: ["EVD-POD-S6-L1", "EVD-REMIT-S6-L1"],
        lineId: "S6-L1",
        receiptId: "RECON-S6-L1",
        ruleId: "pricing-below-contract"
      }
    ]
  };
}

function sdkToolEvent(
  name: "tool_called" | "tool_output",
  toolName: string,
  agentName: string,
  rawItemOverrides: Record<string, unknown> = {}
) {
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
  };
}

function sdkSelectedEvidenceToolEvent(
  name: "tool_called" | "tool_output",
  toolName: string,
  agentName: string
) {
  if (name === "tool_called") {
    return sdkToolEvent(name, toolName, agentName, {
      arguments: {
        question: "Why is this recoverable?",
        recordIds: [...validS6HookRecordIds],
        selectedLineId: "S6-L1"
      }
    });
  }

  return sdkToolEvent(name, toolName, agentName, {
    output: {
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
            summary: "Test SAP source row for INV-S6-1."
          }
        ],
        selectedLineId: "S6-L1",
        selectedRecordIds: [...validS6HookRecordIds],
        sourceFreshness: "snapshot",
        transportLabel: "Governed canonical snapshot",
        transportLayer: "supabase_canonical_snapshot"
      }
    }
  });
}

function sdkCanonicalSelectedEvidenceToolEvent(
  name: "tool_called" | "tool_output",
  toolName: string,
  agentName: string
) {
  const selectedRecordIds = ["S6-L1", "INV-S6-1", "RECON-S6-L1", "EVD-POD-S6-L1", "POD-S6-L1", "EVD-REMIT-S6-L1"];
  if (name === "tool_called") {
    return sdkToolEvent(name, toolName, agentName, {
      arguments: {
        question: "Why is this recoverable?",
        recordIds: selectedRecordIds,
        selectedLineId: "S6-L1"
      }
    });
  }

  return sdkToolEvent(name, toolName, agentName, {
    output: {
      sourceReadStatus: "source_backed_selected_scope",
      sourceReads: {
        canonicalModel: "EvidenceDocument",
        selectedEvidence: [
          {
            documentId: "EVD-POD-S6-L1",
            documentType: "pod",
            recordIds: ["S6-L1", "RECON-S6-L1", "EVD-POD-S6-L1", "POD-S6-L1"],
            source: "supabase",
            summary: "POD evidence from three_pl."
          },
          {
            documentId: "EVD-REMIT-S6-L1",
            documentType: "remittance_advice",
            recordIds: ["S6-L1", "RECON-S6-L1", "EVD-REMIT-S6-L1"],
            source: "supabase",
            summary: "Remittance evidence from remittance."
          }
        ],
        selectedLineId: "S6-L1",
        selectedRecordIds,
        sourceFreshness: "snapshot",
        transportLabel: "Governed canonical snapshot",
        transportLayer: "supabase_canonical_snapshot"
      }
    }
  });
}

async function* emptyLiveQueryStream(): AsyncIterable<unknown> {
  await Promise.resolve();
  if (Date.now() < 0) {
    yield undefined;
  }
}

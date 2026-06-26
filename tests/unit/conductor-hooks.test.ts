import { describe, expect, it } from "vitest";
import {
  createAgentHookAuditReceipt,
  registerRunHookAuditReceipts,
  supportedAgentHookEvents,
  type AgentHookAuditReceipt
} from "../../src/services/conductor.js";

type Listener = (...args: unknown[]) => void;

class FakeRunHooks {
  readonly listeners = new Map<string, Listener>();

  on(type: string, listener: Listener): this {
    this.listeners.set(type, listener);
    return this;
  }

  emit(type: string, ...args: unknown[]): void {
    this.listeners.get(type)?.(...args);
  }
}

describe("conductor AgentHooks audit receipts", () => {
  it("declares the SDK lifecycle events Recoup records for agent-to-agent runs", () => {
    expect(supportedAgentHookEvents).toEqual([
      "agent_start",
      "agent_end",
      "agent_handoff",
      "agent_tool_start",
      "agent_tool_end"
    ]);
  });

  it("registers run hooks as secret-free audit receipts", () => {
    const hooks = new FakeRunHooks();
    const receipts: AgentHookAuditReceipt[] = [];

    registerRunHookAuditReceipts(hooks, (receipt) => receipts.push(receipt), {
      recordIds: ["6534"]
    });
    hooks.emit("agent_start", {}, { name: "Risk-Mesh Supervisor" });
    hooks.emit("agent_handoff", {}, { name: "Forensics Investigator" }, { name: "Recovery Drafter" });
    hooks.emit("agent_tool_start", {}, { name: "Risk-Mesh Supervisor" }, { name: "agent_tool_sentinel_position" }, {});
    hooks.emit("agent_tool_end", {}, { name: "Risk-Mesh Supervisor" }, { name: "agent_tool_sentinel_position" }, "secret", {});
    hooks.emit("agent_end", {}, { name: "Risk-Mesh Supervisor" }, "secret final output");

    expect(receipts).toEqual([
      {
        agentName: "Risk-Mesh Supervisor",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        eventType: "AgentHookAuditReceipt",
        hook: "agent_start",
        recordIds: ["6534"]
      },
      {
        agentName: "Forensics Investigator",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        eventType: "AgentHookAuditReceipt",
        hook: "agent_handoff",
        nextAgentName: "Recovery Drafter",
        recordIds: ["6534"]
      },
      {
        agentName: "Risk-Mesh Supervisor",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        eventType: "AgentHookAuditReceipt",
        hook: "agent_tool_start",
        recordIds: ["6534"],
        toolName: "agent_tool_sentinel_position"
      },
      {
        agentName: "Risk-Mesh Supervisor",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        eventType: "AgentHookAuditReceipt",
        hook: "agent_tool_end",
        recordIds: ["6534"],
        toolName: "agent_tool_sentinel_position"
      },
      {
        agentName: "Risk-Mesh Supervisor",
        deterministicBasis: "OpenAI Agents SDK RunHooks lifecycle event",
        eventType: "AgentHookAuditReceipt",
        hook: "agent_end",
        recordIds: ["6534"]
      }
    ]);
    expect(JSON.stringify(receipts)).not.toContain("secret");
  });

  it("records selected-evidence MCP proof from SDK tool hook details and result", () => {
    const hooks = new FakeRunHooks();
    const receipts: AgentHookAuditReceipt[] = [];
    const selectedRecordIds = ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"];
    const toolCallDetails = {
      toolCall: {
        arguments: JSON.stringify({
          question: "Why is this recoverable?",
          recordIds: selectedRecordIds,
          selectedLineId: "S6-L1"
        })
      }
    };
    const toolResult = JSON.stringify({
      text: JSON.stringify({
        sourceReadStatus: "source_backed_selected_scope",
        sourceReads: {
          canonicalModel: "EvidenceDocument",
          primarySourceLabel: "SAP OData",
          primarySourceSystem: "sap_odata",
          sapEvidence: [
            {
              recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"],
              source: "sap"
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
    });

    registerRunHookAuditReceipts(hooks, (receipt) => receipts.push(receipt), {
      recordIds: selectedRecordIds
    });
    hooks.emit("agent_tool_start", {}, { name: "Forensics Investigator" }, { name: "query_answer" }, toolCallDetails);
    hooks.emit("agent_tool_end", {}, { name: "Forensics Investigator" }, { name: "query_answer" }, toolResult, toolCallDetails);

    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({
      hook: "agent_tool_start",
      toolInputRecordIds: selectedRecordIds,
      toolInputSelectedLineId: "S6-L1",
      toolName: "query_answer"
    });
    expect(receipts[1]).toMatchObject({
      hook: "agent_tool_end",
      toolInputRecordIds: selectedRecordIds,
      toolInputSelectedLineId: "S6-L1",
      toolName: "query_answer",
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
    expect(JSON.stringify(receipts)).not.toContain("Why is this recoverable?");
  });

  it("reads selected-evidence MCP proof from SDK tool-call prototype properties", () => {
    const hooks = new FakeRunHooks();
    const receipts: AgentHookAuditReceipt[] = [];
    const selectedRecordIds = ["S6-L1", "INV-S6-1", "SAP-INV-S6-1", "PRICE-CLAUSE-1"];
    const toolCall = Object.create({
      arguments: JSON.stringify({
        recordIds: selectedRecordIds,
        selectedLineId: "S6-L1"
      })
    }) as Record<string, unknown>;
    const toolCallDetails = { toolCall };
    const toolResult = JSON.stringify({
      text: JSON.stringify({
        sourceReadStatus: "source_backed_selected_scope",
        sourceReads: {
          canonicalModel: "EvidenceDocument",
          sapEvidence: [{ recordIds: ["S6-L1", "INV-S6-1", "SAP-INV-S6-1"] }],
          selectedLineId: "S6-L1",
          selectedRecordIds
        }
      }),
      type: "text"
    });

    registerRunHookAuditReceipts(hooks, (receipt) => receipts.push(receipt), {
      recordIds: selectedRecordIds
    });
    hooks.emit("agent_tool_end", {}, { name: "Forensics Investigator" }, { name: "query_answer" }, toolResult, toolCallDetails);

    expect(receipts[0]).toMatchObject({
      hook: "agent_tool_end",
      toolInputRecordIds: selectedRecordIds,
      toolInputSelectedLineId: "S6-L1",
      toolOutputCanonicalModel: "EvidenceDocument",
      toolOutputSourceReadStatus: "source_backed_selected_scope"
    });
  });

  it("rejects hook audit receipts without cited record ids", () => {
    expect(() =>
      createAgentHookAuditReceipt({
        agentName: "Risk-Mesh Supervisor",
        hook: "agent_start",
        recordIds: []
      })
    ).toThrow("Agent hook audit receipt requires cited recordIds.");
  });

  it("can mark deterministic backend hook audit receipts without changing live SDK defaults", () => {
    const receipt = createAgentHookAuditReceipt({
      agentName: "Forensics Query",
      deterministicBasis: "Recoup deterministic forensics hook audit event",
      hook: "agent_tool_start",
      recordIds: ["S6-L1"],
      toolName: "query.answer"
    });

    expect(receipt).toMatchObject({
      deterministicBasis: "Recoup deterministic forensics hook audit event",
      hook: "agent_tool_start",
      recordIds: ["S6-L1"],
      toolName: "query.answer"
    });
  });
});

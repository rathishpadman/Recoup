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

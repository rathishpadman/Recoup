import { describe, expect, it } from "vitest";
import { recoupHandoffGraph } from "../../src/agents/handoffGraph.js";
import { AgentHandoffPacketSchema, createAgentHandoffPacket } from "../../src/agents/messages.js";

describe("agent handoff packets", () => {
  it("declares explicit runtime wiring for every graph edge", () => {
    const allowedWirings = ["sdk-handoff", "deterministic-service", "agents-as-tools", "tool"];

    expect(recoupHandoffGraph).toEqual([
      {
        from: "Forensics Investigator",
        to: "Recovery Drafter",
        mode: "handoff",
        wiring: "sdk-handoff"
      },
      {
        from: "Forensics Investigator",
        to: "Containment / Intent",
        mode: "handoff",
        wiring: "deterministic-service"
      },
      {
        from: "Risk-Mesh Supervisor",
        to: "Sentinel",
        mode: "agents-as-tools",
        wiring: "agents-as-tools"
      },
      {
        from: "Risk-Mesh Supervisor",
        to: "Containment / Intent",
        mode: "agents-as-tools",
        wiring: "agents-as-tools"
      },
      {
        from: "Conversational Query",
        to: "Audit Read",
        mode: "tool",
        wiring: "tool"
      }
    ]);

    for (const edge of recoupHandoffGraph) {
      expect(edge).toHaveProperty("wiring");
      expect(allowedWirings).toContain(edge.wiring);
    }
  });

  it("creates cited work packets for agent-to-agent communication", () => {
    const packet = createAgentHandoffPacket({
      packetId: "packet-1",
      fromAgent: "Risk-Mesh Supervisor",
      toAgent: "Sentinel",
      capability: "C",
      caseId: "ARB-HARBOR-ORDER-640K",
      recordIds: ["CUST-HARBOR", "6534"],
      deterministicBasis: "recoupHandoffGraph + audit.read",
      intent: "request-credit-position",
      status: "created"
    });

    expect(() => AgentHandoffPacketSchema.parse(packet)).not.toThrow();
  });

  it("rejects handoff packets outside the declared graph", () => {
    expect(() =>
      createAgentHandoffPacket({
        packetId: "packet-invalid",
        fromAgent: "Recovery Drafter",
        toAgent: "Sentinel",
        capability: "C",
        caseId: "ARB-HARBOR-ORDER-640K",
        recordIds: ["CUST-HARBOR"],
        deterministicBasis: "not-in-graph",
        intent: "invalid-cross-hop",
        status: "created"
      })
    ).toThrow("Agent handoff edge is not declared.");
  });
});

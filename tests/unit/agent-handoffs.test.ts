import { describe, expect, it } from "vitest";
import { recoupHandoffGraph } from "../../src/agents/handoffGraph.js";
import { AgentHandoffPacketSchema, createAgentHandoffPacket } from "../../src/agents/messages.js";

describe("agent handoff packets", () => {
  it("declares SDD handoff and agents-as-tools edges", () => {
    expect(recoupHandoffGraph).toEqual([
      { from: "Forensics Investigator", to: "Recovery Drafter", mode: "handoff" },
      { from: "Forensics Investigator", to: "Containment / Intent", mode: "handoff" },
      { from: "Risk-Mesh Supervisor", to: "Sentinel", mode: "agents-as-tools" },
      { from: "Risk-Mesh Supervisor", to: "Containment / Intent", mode: "agents-as-tools" },
      { from: "Conversational Query", to: "Audit Read", mode: "tool" }
    ]);
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

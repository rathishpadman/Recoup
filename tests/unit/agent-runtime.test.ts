import { describe, expect, it } from "vitest";
import { recoupAgentRoster, s4AgentBoundary } from "../../src/agents/agentRuntime.js";

describe("agent runtime roster", () => {
  it("declares the full Recoup multi-agent roster with pinned offline-safe boundaries", () => {
    expect(recoupAgentRoster.map((agent) => agent.name)).toEqual([
      "Forensics Investigator",
      "Recovery Drafter",
      "Risk-Mesh Supervisor",
      "Sentinel",
      "Containment / Intent",
      "Conversational Query"
    ]);
    expect(recoupAgentRoster.map((agent) => agent.modelExecution)).toEqual([
      "blocked: offline build does not invoke live model calls",
      "blocked: offline build does not invoke live model calls",
      "blocked: offline build does not invoke live model calls",
      "blocked: offline build does not invoke live model calls",
      "blocked: offline build does not invoke live model calls",
      "blocked: offline build does not invoke live model calls"
    ]);
    expect(recoupAgentRoster.map((agent) => agent.model)).toEqual([
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.4",
      "gpt-realtime-2"
    ]);
  });

  it("keeps the implemented S4 handoff explicit", () => {
    expect(s4AgentBoundary.handoff).toEqual({
      from: "Forensics Investigator",
      to: "Recovery Drafter"
    });
  });
});

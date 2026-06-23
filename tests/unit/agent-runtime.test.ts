import { describe, expect, it } from "vitest";
import { recoupAgentRoster, riskMeshAgentTools, riskMeshSupervisorAgent, s4AgentBoundary } from "../../src/agents/agentRuntime.js";
import { agentPromptFileNames, loadAgentPrompt } from "../../src/agents/prompts.js";

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
    expect(recoupAgentRoster.map((agent) => agent.promptFile)).toEqual([
      "forensics-investigator.md",
      "recovery-drafter.md",
      "risk-mesh-supervisor.md",
      "sentinel.md",
      "containment-intent.md",
      "conversational-query.md"
    ]);
  });

  it("keeps the implemented S4 handoff explicit", () => {
    expect(s4AgentBoundary.handoff).toEqual({
      from: "Forensics Investigator",
      to: "Recovery Drafter"
    });
  });

  it("exposes Risk-Mesh downstream agents as SDK tools without action authority", () => {
    expect(riskMeshAgentTools.map((tool) => tool.name)).toEqual([
      "agent_tool_sentinel_position",
      "agent_tool_containment_intent_position"
    ]);
    expect(riskMeshAgentTools.every((tool) => typeof tool.invoke === "function")).toBe(true);
    expect(riskMeshAgentTools.every((tool) => tool.description.includes("advisory-only"))).toBe(true);
    expect(riskMeshSupervisorAgent.tools.map((tool) => tool.name)).toEqual(riskMeshAgentTools.map((tool) => tool.name));
  });

  it("loads every agent instruction from src/prompts/*.md", () => {
    expect(agentPromptFileNames).toEqual([
      "forensics-investigator.md",
      "recovery-drafter.md",
      "risk-mesh-supervisor.md",
      "sentinel.md",
      "containment-intent.md",
      "conversational-query.md"
    ]);

    for (const promptFile of agentPromptFileNames) {
      const prompt = loadAgentPrompt(promptFile);

      expect(prompt.length).toBeGreaterThan(40);
      expect(prompt).not.toContain("TODO");
    }
  });
});

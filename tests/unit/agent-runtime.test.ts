import { describe, expect, it } from "vitest";
import {
  containmentIntentAgent,
  conversationalQueryAgent,
  createForensicsInvestigatorAgent,
  createRecoveryDrafterAgent,
  forensicsInvestigatorAgent,
  recoupAgentRoster,
  recoveryDrafterAgent,
  riskMeshAgentTools,
  riskMeshSupervisorAgent,
  s4AgentBoundary,
  sentinelAgent
} from "../../src/agents/agentRuntime.js";
import type { MCPServer } from "../../src/agents/openAiAgentsSdk.js";
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

  it("applies explicit reasoning effort settings to SDK agents", () => {
    expect(forensicsInvestigatorAgent.modelSettings).toEqual({
      reasoning: { effort: "high" },
      text: { verbosity: "low" }
    });
    expect(riskMeshSupervisorAgent.modelSettings).toEqual({
      reasoning: { effort: "low" },
      text: { verbosity: "low" }
    });
    expect(recoveryDrafterAgent.modelSettings).toEqual({
      reasoning: { effort: "low" },
      text: { verbosity: "low" }
    });
    expect(sentinelAgent.modelSettings).toEqual({
      reasoning: { effort: "low" },
      text: { verbosity: "low" }
    });
    expect(containmentIntentAgent.modelSettings).toEqual({
      reasoning: { effort: "low" },
      text: { verbosity: "low" }
    });
    expect(conversationalQueryAgent.modelSettings).toEqual({});
  });

  it("constructs live Maya agents with governed MCP servers without mutating offline singletons", () => {
    const mcpServers = [{ name: "recoup-governed-data-plane" }] as unknown as MCPServer[];
    const recoveryAgent = createRecoveryDrafterAgent({ mcpServers });
    const forensicsAgent = createForensicsInvestigatorAgent({ mcpServers });

    expect(recoveryAgent.mcpServers).toBe(mcpServers);
    expect(forensicsAgent.mcpServers).toBe(mcpServers);
    expect(forensicsAgent.handoffs).toHaveLength(1);
    expect(forensicsAgent.modelSettings).toEqual({
      reasoning: { effort: "high" },
      text: { verbosity: "low" }
    });
    expect(recoveryDrafterAgent.mcpServers).toEqual([]);
    expect(forensicsInvestigatorAgent.mcpServers).toEqual([]);
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

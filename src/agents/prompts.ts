import { readFileSync } from "node:fs";

export const agentPromptFileNames = [
  "forensics-investigator.md",
  "recovery-drafter.md",
  "risk-mesh-supervisor.md",
  "sentinel.md",
  "containment-intent.md",
  "conversational-query.md"
] as const;

export type AgentPromptFileName = (typeof agentPromptFileNames)[number];

const promptDirectoryUrl = new URL("../prompts/", import.meta.url);

export function loadAgentPrompt(fileName: AgentPromptFileName): string {
  const prompt = readFileSync(new URL(fileName, promptDirectoryUrl), "utf8").trim();

  if (prompt.length === 0) {
    throw new Error(`Agent prompt file ${fileName} is empty.`);
  }

  return prompt;
}

import { describe, expect, it } from "vitest";
import {
  openAiPromptCacheCapabilities,
  openAiPromptCacheConfig
} from "../../config/openaiPromptCache.js";
import { assembleRecoupPrompt } from "../../src/agents/promptAssembly.js";

describe("OpenAI prompt cache contract", () => {
  it("declares capability-scoped static cache keys for every Recoup agent family", () => {
    expect(openAiPromptCacheCapabilities).toEqual(["deduction_forensics", "credit_risk", "risk_mesh", "containment"]);

    for (const capability of openAiPromptCacheCapabilities) {
      const config = openAiPromptCacheConfig[capability];

      expect(config.promptCacheKey).toMatch(/^recoup:v2:[a-z-]+:v\d+$/u);
      expect(config.promptPrefixVersion).toMatch(/^v\d+$/u);
      expect(config.promptCacheKey).not.toMatch(/S\d+-L\d+|INV-|SAP-|USCU_|question|customer|invoice/iu);
    }
  });

  it("assembles prompts with stable governance and capability prefixes before dynamic case data", () => {
    const assembly = assembleRecoupPrompt({
      agentPrompt: "Existing agent-specific instruction block.",
      capability: "deduction_forensics",
      dynamicPayload: "Question: Why is S6-L1 recoverable?\nSelected record IDs: S6-L1, INV-S6-1."
    });

    const sharedPrefixIndex = assembly.prompt.indexOf("Recoup shared governance prefix");
    const capabilityPrefixIndex = assembly.prompt.indexOf("Capability prefix: deduction_forensics");
    const agentPromptIndex = assembly.prompt.indexOf("Existing agent-specific instruction block.");
    const dynamicPayloadIndex = assembly.prompt.indexOf("Question: Why is S6-L1 recoverable?");

    expect(sharedPrefixIndex).toBeGreaterThanOrEqual(0);
    expect(capabilityPrefixIndex).toBeGreaterThan(sharedPrefixIndex);
    expect(agentPromptIndex).toBeGreaterThan(capabilityPrefixIndex);
    expect(dynamicPayloadIndex).toBeGreaterThan(agentPromptIndex);
    expect(assembly.cache).toEqual({
      capability: "deduction_forensics",
      promptCacheKey: "recoup:v2:deduction-forensics:v1",
      promptPrefixVersion: "v1"
    });
  });
});

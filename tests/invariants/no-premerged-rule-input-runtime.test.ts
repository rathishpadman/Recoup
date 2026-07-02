import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Forensics runtime avoids pre-merged rule input", () => {
  it("derives authoritative rule input from reconciliation receipts", () => {
    const source = readFileSync("src/agents/forensics.ts", "utf8");

    expect(source).not.toContain("Supabase rule_input_json required");
    expect(source).toContain("reconcileDeductionClaim");
    expect(source).toContain("derivedRuleInput");
    expect(source).not.toMatch(/\bscenario_id\b|\bscenarioId\b|\bgold_scenario_id\b|\bgoldScenarioId\b/u);
  });
});

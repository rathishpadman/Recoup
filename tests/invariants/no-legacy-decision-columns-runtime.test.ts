import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtimeFiles = [
  "src/agents/forensics.ts",
  "src/services/cockpitApi.ts",
  "src/services/cockpitModel.ts",
  "src/services/legacyForensicsPath.ts",
  "src/services/serviceLayer.ts",
  "src/adapters/legacySupabaseSettlementRunReader.ts",
  "src/adapters/supabaseSyntheticSource.ts",
  "cockpit/app/api/forensics/route.ts",
  "cockpit/app/api/read-model-cache.ts"
] as const;

describe("legacy deduction decision columns are not runtime decision inputs", () => {
  it.each(runtimeFiles)("%s does not use seeded labels as decision sources", (file) => {
    const source = readFileSync(file, "utf8");

    if (
      file === "src/services/legacyForensicsPath.ts" ||
      file === "src/adapters/legacySupabaseSettlementRunReader.ts"
    ) {
      expect(source).toContain("rollback only");
      return;
    }

    expect(source).not.toMatch(/recoup_deduction_lines\.(verdict|routing|rule_id|rule_input_json|scenario_id)/u);
    expect(source).not.toMatch(/\bline\.(verdict|routing|ruleId|ruleInput|scenarioId)\b/u);
    expect(source).not.toMatch(/\brow\.(verdict|routing|rule_id|rule_input_json|scenario_id)\b/u);
    expect(source).not.toMatch(/\bparsed\.(verdict|routing|rule_id|rule_input_json|scenario_id)\b/u);
    expect(source).not.toMatch(/\bsettlementLine\.(verdict|routing|ruleId|ruleInput|scenarioId)\b/u);
  });

  it("does not expose scenario-named fields in the cockpit worklist display contract", () => {
    const source = readFileSync("src/services/cockpitModel.ts", "utf8");

    expect(source).not.toMatch(/\bscenarioIds\b|\bscenarioId\b|\bscenarioLabel\b/u);
    expect(source).toContain("workItemId");
    expect(source).toContain("workItemLabel");
    expect(source).toContain("deductionReason");
  });
});

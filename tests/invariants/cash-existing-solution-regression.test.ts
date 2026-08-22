import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { governedConfigKeys } from "../../config/governed.js";
import { loadApprovedAllocationPolicy } from "../../config/cashAllocationPolicy.js";
import { loadApprovedReasonMap } from "../../config/cashReasonMap.js";
import { createWorkflowWorker } from "../../src/services/workflowWorker.js";

/**
 * Specification 12, existing-solution regression matrix.
 *
 * The cash work is additive. These assertions prove the protected capabilities
 * are unchanged, and that every cash surface is inert with the flags off, which
 * is the state every baseline and protected route runs in.
 */

describe("cash flags off leaves every cash surface inert", () => {
  it("returns no allocation policy without the demo flag", () => {
    expect(loadApprovedAllocationPolicy({})).toBeUndefined();
    expect(loadApprovedAllocationPolicy({ RECOUP_CASH_DEMO_POLICY_ENABLED: "false" })).toBeUndefined();
  });

  it("returns no reason map without the demo flag", () => {
    expect(loadApprovedReasonMap({})).toBeUndefined();
  });

  it("constructs no worker without the worker flag", () => {
    const result = createWorkflowWorker({
      env: {},
      loadCashRunControl: () => ({ enabled: true, maxAttempts: 5, maxWaitSeconds: 60 })
    });
    expect(result.status).toBe("refused");
  });
});

describe("S1-S8 gold set is untouched", () => {
  it("keeps the scenario enum at eight members", () => {
    const entities = readFileSync("src/types/entities.ts", "utf8");
    const claims = readFileSync("src/types/claims.ts", "utf8");
    const combined = `${entities}\n${claims}`;

    for (const scenario of ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"]) {
      expect(combined).toContain(scenario);
    }
    expect(combined).not.toContain("S9");
    expect(combined).not.toContain("S10");
  });

  it("adds no cash import to the shared entity types", () => {
    const entities = readFileSync("src/types/entities.ts", "utf8");
    expect(entities).not.toMatch(/cashApplication|LiveDeductionCase|workflow\.js/u);
  });
});

describe("run control stays a strict six-phase contract", () => {
  it("adds no cash key to the governed config key list", () => {
    expect(governedConfigKeys).not.toContain("cash_run_control");
  });

  it("keeps cash_run_control optional and separate from run_control", () => {
    const worker = readFileSync("src/services/workflowWorker.ts", "utf8");
    expect(worker).toContain("cash_run_control");
    // The worker must never read or mutate the protected six-phase row.
    expect(worker).not.toMatch(/["']run_control["']/u);
  });
});

describe("existing remittance sources never become write authority", () => {
  it("adds no write path to the legacy remittance tables", () => {
    for (const file of [
      "src/services/remittanceIntake.ts",
      "src/services/remittanceMapper.ts",
      "src/services/cashApplicationRun.ts"
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("remittance_headers");
      expect(source).not.toContain("remittance_lines");
      expect(source).not.toContain("recoup_src_remittance");
    }
  });

  it("leaves the legacy tables out of the new schema entirely", () => {
    const schema = readFileSync("docs/supabase-cash-application-schema.sql", "utf8");
    expect(schema).not.toMatch(/ALTER TABLE recoup_src_remittance/u);
    expect(schema).not.toMatch(/ALTER TABLE remittance_headers/u);
    expect(schema).not.toMatch(/ALTER TABLE remittance_lines/u);
  });
});

describe("no ERP write and draft-only", () => {
  it("introduces no write-capable ERP client anywhere in the cash slice", () => {
    for (const file of [
      "src/adapters/cashReceipt.ts",
      "src/adapters/rehearsalCashReceipt.ts",
      "src/core/cashApplication/allocate.ts",
      "src/core/cashApplication/match.ts",
      "src/core/cashApplication/reason.ts",
      "src/services/cashApplicationPipeline.ts",
      "src/services/cashApplicationRun.ts",
      "src/agents/cashApplication.ts"
    ]) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//gu, "")
        .replace(/\/\/.*$/gmu, "");

      expect(code, `${file} must not post`).not.toMatch(/\bPOST\b|\bPATCH\b|\bPUT\b/u);
      expect(code, `${file} must not call an ERP`).not.toMatch(/sapOData|erpClient/u);
    }
  });

  it("keeps the allocation receipt explicitly non-posting", () => {
    const allocate = readFileSync("src/core/cashApplication/allocate.ts", "utf8");
    expect(allocate).toContain("does not write to any ERP");
  });
});

describe("connector readiness is unchanged", () => {
  it("adds no synthetic provider or source table to the connector registry", () => {
    const registry = readFileSync("src/adapters/connectorRegistry.ts", "utf8");
    expect(registry).not.toMatch(/rehearsal|cash_application|cashReceipt/u);
  });
});

describe("cockpit business-logic boundary is unchanged", () => {
  it("leaves the existing invariant file untouched by this work", () => {
    const source = readFileSync("tests/invariants/cockpit-no-business-logic.test.ts", "utf8");
    expect(source).not.toMatch(/agent-operations|upstream-cash-origin/u);
  });
});

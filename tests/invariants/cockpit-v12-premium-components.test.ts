import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cockpit v1.2 premium component contract", () => {
  it("defines the five named premium components as reusable cockpit primitives", () => {
    expect(existsSync("cockpit/app/premium-components.tsx")).toBe(true);

    const components = readFileSync("cockpit/app/premium-components.tsx", "utf8");
    for (const componentName of [
      "ToolStatusRail",
      "MultimodalDock",
      "AgentTraceVisualizer",
      "NegotiationGraph",
      "AuditVerifyChip"
    ]) {
      expect(components).toContain(`function ${componentName}`);
    }

    expect(components).toContain("source.statusTone");
    expect(components).toContain("connectors.sourceTiles");
    expect(components).toContain("connectors.lastRefreshedLabel");
    expect(components).toContain("dock.subAgents");
    expect(components).toContain("dock.modeOptions");
    expect(components).toContain("provenance");
    expect(components).toContain("Source readiness");

    const model = readFileSync("src/services/cockpitModel.ts", "utf8");
    expect(model).toContain("statusTone");
    expect(model).toContain("Synthetic");
    expect(model).toContain("POD-Retriever");
    expect(model).toContain("Contract-Reader");
    expect(model).toContain("TPM-Matcher");
  });

  it("wires premium components into Maya, David, and CFO runtime routes", () => {
    const forensics = readFileSync("cockpit/app/forensics/page.tsx", "utf8");
    const run = readFileSync("cockpit/app/run/page.tsx", "utf8");
    const credit = readFileSync("cockpit/app/credit/page.tsx", "utf8");
    const cfo = readFileSync("cockpit/app/cfo/page.tsx", "utf8");

    expect(forensics).toContain("<ToolStatusRail");
    expect(forensics).toContain("<MultimodalDock");
    expect(forensics).toContain("<AuditVerifyChip");
    expect(run).toContain("<ToolStatusRail");
    expect(run).toContain("<AgentTraceVisualizer");
    expect(credit).toContain("<NegotiationGraph");
    expect(credit).toContain("<AuditVerifyChip");
    expect(credit).toContain("account-360-panel");
    expect(cfo).toContain("board-metric-ledger");
    expect(cfo).toContain("cfo-provenance-footer");
  });
});

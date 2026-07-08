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
    const davidSurface = readFileSync("cockpit/components/david/david-risk-review-surface.tsx", "utf8");
    const davidShell = readFileSync("cockpit/components/david/david-workspace-shell.tsx", "utf8");
    const davidPacket = readFileSync("cockpit/components/david/david-action-packet.tsx", "utf8");
    const davidSources = readFileSync("cockpit/components/david/david-sources-drawer.tsx", "utf8");
    const davidRecords = readFileSync("cockpit/components/david/david-record-disclosure.tsx", "utf8");
    const cfo = readFileSync("cockpit/app/cfo/page.tsx", "utf8");

    expect(forensics).toContain("<ToolStatusRail");
    expect(forensics).toContain("<MultimodalDock");
    expect(forensics).toContain("<AuditVerifyChip");
    expect(run).toContain("<ToolStatusRail");
    expect(run).toContain("<AgentTraceVisualizer");
    expect(credit).toContain("<DavidRiskReviewSurface");
    expect(credit).toContain("fetchCreditRiskReviewModel");
    expect(credit).not.toContain("<NegotiationGraph");
    expect(credit).not.toContain("<AuditVerifyChip");
    expect(credit).not.toContain("account-360-panel");
    expect(davidSurface).toContain("DavidAccountQueue");
    expect(davidSurface).toContain("DavidAccountDossier");
    expect(davidSurface).toContain("DavidActionPacketsOutbox");
    expect(davidSurface).toContain("DavidBehaviouralWatchlist");
    expect(davidShell).toContain('data-testid="david-shadcn-workbench"');
    expect(davidPacket).toContain("<DavidApprovalGateDialog");
    expect(davidSources).toContain("DavidRecordDisclosure");
    expect(davidRecords).toContain("<details");
    expect(cfo).toContain("board-metric-ledger");
    expect(cfo).toContain("cfo-provenance-footer");
  });
});

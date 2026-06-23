import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const requiredMayaComponentFiles = [
  "maya-workspace-shell.tsx",
  "maya-run-kpi-strip.tsx",
  "source-readiness-strip.tsx",
  "deduction-worklist-table.tsx",
  "recommended-action-cell.tsx",
  "deduction-case-workspace.tsx",
  "evidence-dossier.tsx",
  "query-evidence-dock.tsx",
  "agent-trace-panel.tsx",
  "cited-answer-card.tsx",
  "recovery-draft-review.tsx",
  "approval-gate-dialog.tsx",
  "audit-confirmation-panel.tsx",
  "maya-empty-state.tsx",
  "maya-forensics-surface.tsx",
  "types.ts"
] as const;

const obviousBusinessLiteralPatterns = [
  {
    label: "dollar-like literals",
    pattern: /["'`][^"'`]*\$\s?\d[\d,]*(?:\.\d{2})?[^"'`]*["'`]/u
  },
  {
    label: "demo customer names",
    pattern: /\b(?:Crestline|Harbor|Greenleaf|ValuMart|NorthBay)\b/u
  },
  {
    label: "fixture-like evidence IDs",
    pattern: /["'`](?:POD|TPM|PRICE|CLAUSE|BUREAU|FIN|DOC|EVIDENCE)-[A-Z0-9][A-Z0-9:_-]*["'`]/u
  },
  {
    label: "fixture-like action or audit IDs",
    pattern: /["'`](?:ACTION|APPROVAL|AUDIT|HASH|REBILL|RECOVERY|CUST|INV)-[A-Z0-9][A-Z0-9:_-]*["'`]/u
  },
  {
    label: "scenario line fixture IDs",
    pattern: /["'`]S[1-8]-L\d+["'`]/u
  }
] as const;

function readTree(root: string): string {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
        files.push(path);
      }
    }
  }

  walk(root);
  return files.sort().map((path) => readFileSync(path, "utf8")).join("\n");
}

function readMayaSourceFiles(): Array<{ path: string; source: string }> {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".tsx") || path.endsWith(".ts")) {
        files.push(path);
      }
    }
  }

  walk("cockpit/components/maya");
  return files.sort().map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

describe("Maya shadcn cockpit boundary", () => {
  it("keeps the Phase 4 Maya workbench decomposed into shadcn-only components", () => {
    expect(existsSync("cockpit/components/maya")).toBe(true);

    for (const fileName of requiredMayaComponentFiles) {
      expect(existsSync(join("cockpit/components/maya", fileName))).toBe(true);
    }

    const sources = readTree("cockpit/components/maya");

    for (const requiredImport of [
      "@/components/ui/card",
      "@/components/ui/table",
      "@/components/ui/badge",
      "@/components/ui/tabs",
      "@/components/ui/sheet",
      "@/components/ui/alert-dialog",
      "@/components/ui/alert",
      "@/components/ui/accordion",
      "@/components/ui/scroll-area",
      "@/components/ui/separator",
      "@/components/ui/button",
      "@/components/ui/empty",
      "@/components/ui/tooltip"
    ]) {
      expect(sources).toContain(requiredImport);
    }
  });

  it("renders through a dedicated review route backed by canonical read models", () => {
    const route = readFileSync("cockpit/app/forensics/shadcn/page.tsx", "utf8");

    expect(route).toMatch(/requireRouteAccess\(\s*["']\/forensics\/shadcn["']\s*\)/u);
    expect(route).toMatch(/\bfetchForensicsModel\s*\(\s*\)/u);
    expect(route).toMatch(/\bfetchConnectorReadinessModel\s*\(\s*\)/u);
    expect(route).toMatch(/<MayaForensicsSurface\b/u);
  });

  it("keeps the Maya shadcn surface free of old bespoke UI and business logic", () => {
    expect(existsSync("cockpit/components/maya")).toBe(true);
    const sources = `${readFileSync("cockpit/app/forensics/shadcn/page.tsx", "utf8")}\n${readTree(
      "cockpit/components/maya"
    )}`;

    for (const forbidden of [
      "cockpit-shell",
      "premium-components",
      "@phosphor-icons",
      "phosphor-react",
      "decimal.js",
      "src/core",
      "src/services",
      "evaluateRule",
      "runForensicsInvestigation"
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });

  it("keeps Maya components backed by read-model props instead of local business fixtures", () => {
    const sources = readTree("cockpit/components/maya");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(types).toMatch(/\bmodel\s*:\s*ForensicsCockpitModel\b/u);
    expect(types).toMatch(/\bconnectors\s*:\s*ConnectorReadinessCockpitModel\b/u);
    expect(types).toMatch(/\bsession\s*:\s*DemoSession\b/u);
    expect(surface).toMatch(/\bMayaForensicsSurface\b/u);
    expect(surface).toMatch(/\bMayaForensicsSurfaceProps\b/u);
    expect(surface).toMatch(/\bmodel\.worklist\b/u);
    expect(surface).toContain("connectors={connectors}");
    expect(surface).toContain("session={session}");

    const recommendedActionCellPath = "cockpit/components/maya/recommended-action-cell.tsx";
    expect(existsSync(recommendedActionCellPath)).toBe(true);
    if (existsSync(recommendedActionCellPath)) {
      expect(readFileSync(recommendedActionCellPath, "utf8")).toContain("recommendedActionLabel");
    }

    for (const forbidden of [
      "const kpiStrip = [",
      "const worklist = [",
      "const evidencePack =",
      "const approvalActions = [",
      "const actionInbox = [",
      "const mayaJourney = [",
      "const mock",
      "mockData",
      "sampleData",
      "fixture",
      "Crestline Foods",
      "POD-Retriever",
      "human:maya-lead",
      "human:david-lead",
      "human:cfo-lead"
    ]) {
      expect(sources).not.toContain(forbidden);
    }

    for (const { label, pattern } of obviousBusinessLiteralPatterns) {
      expect(sources, `Maya components must not contain ${label}.`).not.toMatch(pattern);
    }
  });

  it("wires query narrative through the Realtime browser helper and cited answer guard", () => {
    const sources = readTree("cockpit/components/maya");
    const queryDock = readFileSync("cockpit/components/maya/query-evidence-dock.tsx", "utf8");
    const citedAnswer = readFileSync("cockpit/components/maya/cited-answer-card.tsx", "utf8");

    for (const forbidden of [
      "/api/query/realtime-tool",
      "/api/query/realtime-client-secret",
      "https://api.openai.com",
      "OPENAI_API_KEY",
      "RECOUP_COCKPIT_AUTH_TOKEN",
      "x-recoup-human-token",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "decimal.js",
      "src/core",
      "src/services"
    ]) {
      expect(queryDock).not.toContain(forbidden);
    }

    expect(sources).not.toContain("https://api.openai.com");
    expect(queryDock).toContain("startRealtimeBrowserSession");
    expect(queryDock).toContain("../../app/realtime-browser-session");
    expect(queryDock).toContain("sessionTokenRef");
    expect(queryDock).toContain("abortControllerRef");
    expect(queryDock).toContain("closeActiveSession");
    expect(queryDock).toContain("abortController?.abort()");
    expect(queryDock).toContain("previousAbortController?.abort()");
    expect(queryDock).toContain("onOpenChange={handleOpenChange}");
    expect(queryDock).toContain("sessionRef.current = null");
    expect(queryDock).toContain("publishForToken");
    expect(queryDock).toContain("isCurrentSession");
    expect(queryDock).toContain("<InputGroupTextarea");
    expect(queryDock).toContain("aria-live");
    expect(queryDock).toContain("CitedAnswerCard");
    expect(queryDock).toContain("AgentTracePanel");
    expect(queryDock).toContain('snapshot.status === "answered"');
    expect(queryDock).toContain("snapshot.deterministicBasis");
    expect(queryDock).toContain("recordIds");
    expect(queryDock).toContain("signal: abortController.signal");
    expect(queryDock).toContain("selectedLineId: selectedLine");
    expect(queryDock).toContain("onChange=");
    expect(queryDock).toContain("disabled={isRunning || question.trim().length === 0}");
    expect(citedAnswer).toContain("response.answer !== undefined");
    expect(citedAnswer).toContain("response.deterministicBasis !== undefined");
    expect(citedAnswer).toContain("response.recordIds.length > 0");
  });

  it("wires approval dialog through supplied actions and the existing HITL API", () => {
    const approvalDialog = readFileSync("cockpit/components/maya/approval-gate-dialog.tsx", "utf8");
    const auditPanel = readFileSync("cockpit/components/maya/audit-confirmation-panel.tsx", "utf8");
    const types = readFileSync("cockpit/components/maya/types.ts", "utf8");

    expect(approvalDialog).toContain("/api/approval");
    expect(approvalDialog).toContain("fetch(");
    expect(approvalDialog).toContain("actions.map");
    expect(approvalDialog).toContain("actionId");
    expect(approvalDialog).toContain("decision");
    expect(approvalDialog).toContain("requiresReason");
    expect(approvalDialog).toContain("reason.trim");
    expect(approvalDialog).toContain("useId");
    expect(approvalDialog).toContain("htmlFor={reasonTextareaId}");
    expect(approvalDialog).toContain("id={reasonTextareaId}");
    expect(approvalDialog).toContain("auditEntryHash");
    expect(approvalDialog).toContain("result.actionId !== actionId");
    expect(approvalDialog).toContain('result.status !== "human_decided"');
    expect(approvalDialog).toContain("onResponse");
    expect(approvalDialog).toContain("disabled={submitting");
    expect(approvalDialog).not.toContain("fallbackActions");
    expect(approvalDialog).not.toContain("human:maya-lead");
    expect(approvalDialog).not.toContain("human:david-lead");
    expect(approvalDialog).not.toContain("human:cfo-lead");
    expect(auditPanel).toContain("response?.auditEntryHash");
    expect(auditPanel).toContain("response?.status");
    expect(types).toMatch(/interface ApprovalGateResponse\s*\{[^}]*actionId:\s*string;/su);
  });

  it("keeps Beat 2 row selection as UI state over fetched worklist records", () => {
    const sources = readTree("cockpit/components/maya");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");

    expect(surface).not.toContain("model.worklist[0]");
    expect(surface).toContain("<MayaEmptyState");
    expect(surface).toContain("Select a deduction to open its work item");
    expect(surface).toContain("selectedWorklistItem");
    expect(surface).toContain("setSelectedWorklistItem");
    expect(surface).not.toContain("<DeductionCaseWorkspace");
    expect(surface).not.toContain("activeLineId=");
    expect(table).toContain("onSelectItem");
    expect(table).toContain("selectedLineId");
    expect(table).toContain("item.lineId");
    expect(sources).toContain("Backend fixed selected record");
    expect(sources).not.toContain("setSelectedLineId");
    expect(sources).not.toMatch(/useState[^;]*selectedLineId/su);
    expect(sources).not.toMatch(/onClick=\{[^}]*setSelectedLineId/su);
    expect(sources).not.toContain("Select ${");
  });

  it("keeps Beat 2 priority gaps inside the KPI strip instead of a separate alert", () => {
    const kpiStrip = readFileSync("cockpit/components/maya/maya-run-kpi-strip.tsx", "utf8");

    expect(kpiStrip).toContain("Needs priority field");
    expect(kpiStrip).toContain("High-priority items");
    expect(kpiStrip).toContain("recoveryTracker");
    expect(kpiStrip).toContain("actionInbox");
    expect(kpiStrip).not.toContain("@/components/ui/alert");
    expect(kpiStrip).not.toMatch(/<Alert(?:\s|>)/u);
    expect(kpiStrip).not.toContain("maya-priority-contract-gap");
  });

  it("keeps source readiness as a slim backend-wired strip", () => {
    const sourceStrip = readFileSync("cockpit/components/maya/source-readiness-strip.tsx", "utf8");

    expect(sourceStrip).toContain("connectors.sourceTiles.slice");
    expect(sourceStrip).toContain("connectors.lastRefreshedLabel");
    expect(sourceStrip).toContain("source.modeLabel");
    expect(sourceStrip).toContain("source.stateLabel");
    expect(sourceStrip).not.toContain("View all sources");
    expect(sourceStrip).not.toContain("lg:grid-cols-7");
    expect(sourceStrip).not.toContain("connectors.connectors.map");
  });

  it("keeps the Beat 2 worklist table-led with mockup-like controls and no fake columns", () => {
    const table = readFileSync("cockpit/components/maya/deduction-worklist-table.tsx", "utf8");

    expect(table).toContain("Deduction Worklist");
    expect(table).toContain("items.length");
    expect(table).toContain("InputGroup");
    expect(table).toContain("Search by scenario, customer, or line ID");
    expect(table).toContain("Save view");
    expect(table).toContain("More filters");
    expect(table).toContain("Recommended action");
    expect(table).not.toContain("Priority");
    expect(table).not.toContain("Owner");
    expect(table).not.toContain("Age");
  });

  it("keeps lucide icons accessible or explicitly decorative", () => {
    for (const { path, source } of readMayaSourceFiles()) {
      const lucideImports = [...source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"lucide-react"/gu)].flatMap((match) =>
        (match[1] ?? "")
          .split(",")
          .map((name) => name.trim().split(/\s+as\s+/u).pop() ?? "")
          .filter(Boolean)
      );

      for (const iconName of lucideImports) {
        const iconUsages = [...source.matchAll(new RegExp(`<${iconName}\\b([^>]*)>`, "gu"))];
        if (iconUsages.length === 0 && source.includes(`icon: ${iconName}`)) {
          expect(
            source,
            `${path} maps ${iconName} through an icon object and must render it through the shared NavIcon control.`
          ).toMatch(/<NavIcon\b[^>]*data-icon=/u);
          continue;
        }
        expect(iconUsages.length, `${path} imports ${iconName} but does not render it.`).toBeGreaterThan(0);
        for (const usage of iconUsages) {
          const attributes = usage[1] ?? "";
          expect(
            attributes,
            `${path} ${iconName} must include data-icon for controls or aria-hidden for decoration.`
          ).toMatch(/\b(?:data-icon|aria-hidden)=/u);
        }
      }
    }
  });
});

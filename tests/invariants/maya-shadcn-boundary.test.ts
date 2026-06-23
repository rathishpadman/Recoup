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

    expect(route).toMatch(/requireRouteAccess\(\s*["']\/forensics["']\s*\)/u);
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
    expect(surface).toMatch(/\bmodel\.selected\b/u);
    expect(surface).toMatch(/\bmodel\.selected\.lineId\b/u);
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

  it("keeps Phase 4 query and approval shells offline until later wiring phases", () => {
    const sources = readTree("cockpit/components/maya");
    const queryDock = readFileSync("cockpit/components/maya/query-evidence-dock.tsx", "utf8");

    for (const forbidden of [
      "fetch(",
      "startRealtimeBrowserSession",
      "/api/query/realtime-tool",
      "/api/query/realtime-client-secret",
      "/api/approval",
      "method: \"POST\"",
      "method: 'POST'"
    ]) {
      expect(sources).not.toContain(forbidden);
    }

    expect(queryDock).toContain("<InputGroupTextarea");
    expect(queryDock).toMatch(/\bdisabled\b/u);
    expect(queryDock).toMatch(/\breadOnly\b/u);
    expect(queryDock).not.toContain("useState");
    expect(queryDock).not.toContain("onChange=");
  });

  it("does not expose row switching while details are fixed to model.selected", () => {
    const sources = readTree("cockpit/components/maya");
    const surface = readFileSync("cockpit/components/maya/maya-forensics-surface.tsx", "utf8");

    expect(surface).toMatch(/\bmodel\.selected\.lineId\b/u);
    expect(surface).not.toContain("model.worklist[0]");
    expect(surface).toContain("<MayaEmptyState");
    expect(sources).not.toContain("selectedLineId");
    expect(sources).not.toContain("setSelectedLineId");
    expect(sources).not.toMatch(/onClick=\{[^}]*setSelectedLineId/su);
    expect(sources).not.toContain("Select ${");
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

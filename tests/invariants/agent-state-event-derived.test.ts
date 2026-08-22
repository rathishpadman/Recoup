import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPEC-CA-009 and the cockpit business-logic boundary.
 *
 * Agent Operations shows state derived from durable backend events. These
 * assertions keep the cockpit a presentation layer: no arithmetic, no money
 * formatting, no status invented in the browser.
 */

function readTree(root: string): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name).replace(/\\/gu, "/");
      if (entry.isDirectory()) {
        walk(path);
      } else if (path.endsWith(".ts") || path.endsWith(".tsx")) {
        files.push({ path, source: readFileSync(path, "utf8") });
      }
    }
  }

  walk(root);
  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
}

const agentOperationsFiles = readTree("cockpit/components/agent-operations");
const upstreamOrigin = {
  path: "cockpit/components/maya/upstream-cash-origin.tsx",
  source: readFileSync("cockpit/components/maya/upstream-cash-origin.tsx", "utf8")
};
const surfaceFiles = [...agentOperationsFiles, upstreamOrigin];

describe("agent operations is a presentation layer", () => {
  it("ships the documented component set", () => {
    const names = agentOperationsFiles.map((file) => file.path.split("/").at(-1));
    expect(names).toContain("agent-operations-workspace.tsx");
    expect(names).toContain("run-table.tsx");
    expect(names).toContain("activity-ledger.tsx");
    expect(names).toContain("types.ts");
  });

  it.each(surfaceFiles.map((file) => file.path))("performs no arithmetic in %s", (path) => {
    const file = surfaceFiles.find((candidate) => candidate.path === path);
    const code = stripComments(file?.source ?? "");

    expect(code).not.toMatch(/Decimal/u);
    expect(code).not.toMatch(/parseFloat|parseInt|Number\(/u);
    expect(code).not.toMatch(/toFixed|toLocaleString/u);
    expect(code).not.toMatch(/\b\w*[Aa]mount\w*\s*[+\-*/]\s*\w/u);
  });

  it.each(surfaceFiles.map((file) => file.path))("reads no database or adapter in %s", (path) => {
    const file = surfaceFiles.find((candidate) => candidate.path === path);
    const code = stripComments(file?.source ?? "");

    expect(code).not.toMatch(/supabase|Supabase/u);
    expect(code).not.toMatch(/src\/adapters|src\/core|src\/services/u);
    expect(code).not.toMatch(/process\.env/u);
  });

  it("derives run state from backend fields rather than inventing it", () => {
    const runTable = agentOperationsFiles.find((file) => file.path.endsWith("run-table.tsx"));
    const code = stripComments(runTable?.source ?? "");

    // The component may map a backend state onto a badge variant, but it must
    // not decide that a run is blocked from anything other than the flag the
    // read model set.
    expect(code).toMatch(/row\.blocked/u);
    expect(code).not.toMatch(/lastEventAt\s*[<>]/u);
    expect(code).not.toMatch(/Date\.now\(\)/u);
  });

  it("renders events in backend order without reordering or merging", () => {
    const ledger = agentOperationsFiles.find((file) => file.path.endsWith("activity-ledger.tsx"));
    const code = stripComments(ledger?.source ?? "");

    expect(code).not.toMatch(/\.sort\(/u);
    expect(code).not.toMatch(/\.reverse\(/u);
    expect(code).not.toMatch(/\.reduce\(/u);
  });

  it("shows the rehearsal and assumed-policy warnings on the Maya surface", () => {
    expect(upstreamOrigin.source).toContain("upstream-cash-rehearsal-warning");
    expect(upstreamOrigin.source).toContain("upstream-cash-assumed-policy-warning");
    expect(upstreamOrigin.source).toContain("not live cash");
  });

  it("gates both warnings on backend-decided flags, not on local inference", () => {
    const code = stripComments(upstreamOrigin.source);
    expect(code).toMatch(/origin\.rehearsalOnly/u);
    expect(code).toMatch(/origin\.assumedPolicy/u);
    expect(code).not.toMatch(/includes\("ASSUMED"\)/u);
    expect(code).not.toMatch(/includes\("rehearsal"\)/u);
  });

  it("carries a testid on every surface a browser test needs", () => {
    for (const testId of [
      "agent-operations-workspace",
      "agent-operations-run-table",
      "agent-operations-activity-ledger",
      "maya-upstream-cash-origin",
      "upstream-cash-short-payment",
      "upstream-cash-validated-reason"
    ]) {
      const found = surfaceFiles.some((file) => file.source.includes(testId));
      expect(found, `missing data-testid ${testId}`).toBe(true);
    }
  });

  it("exposes no scenario id on the live-case surface", () => {
    for (const file of surfaceFiles) {
      expect(file.source).not.toMatch(/scenarioId|ScenarioId/u);
    }
  });
});

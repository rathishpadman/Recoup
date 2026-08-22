import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DESIGN_TARGETS.md "Design Rules", scored against the cash surfaces.
 *
 * Agent Operations is a new screen and is not in the M1-M6 / D1-D5 / CFO
 * inventory, so no ImageGen cue exists to compare it against. The raster cues
 * are look-and-feel references and the file is explicit that implementation
 * must not be pixel-diffed against them, so their absence blocks the
 * mockup-vs-build score and nothing else.
 *
 * The Design Rules themselves are checkable without a cue, and they are the
 * part that protects the build: tokens only, light-first, no model-computed
 * dollars, synthetic sources rendered as synthetic, no nested cards.
 */

function surfaceFiles(): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];

  for (const entry of readdirSync("cockpit/components/agent-operations")) {
    if (entry.endsWith(".tsx")) {
      const path = join("cockpit/components/agent-operations", entry).replace(/\\/gu, "/");
      files.push({ path, source: readFileSync(path, "utf8") });
    }
  }

  files.push({
    path: "cockpit/components/maya/upstream-cash-origin.tsx",
    source: readFileSync("cockpit/components/maya/upstream-cash-origin.tsx", "utf8")
  });

  return files;
}

const files = surfaceFiles();
const upstreamOrigin =
  files.find((file) => file.path.endsWith("upstream-cash-origin.tsx"))?.source ?? "";

describe("Design Rule: tokens only", () => {
  it.each(files.map((file) => file.path))("uses no raw hex colour in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    // tokens.css and tokens.json are the palette source. A literal hex in a
    // component is a second palette that will drift from the first.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/u);
  });

  it.each(files.map((file) => file.path))("uses no inline rgb or hsl in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    expect(source).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/u);
  });
});

describe("Design Rule: light-first, dark scoped to D5 only", () => {
  it.each(files.map((file) => file.path))("declares no dark-mode variant in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    expect(source).not.toMatch(/\bdark:/u);
  });
});

describe("Design Rule: no model-computed dollars", () => {
  it.each(files.map((file) => file.path))("performs no arithmetic in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

    expect(code).not.toMatch(/Decimal/u);
    expect(code).not.toMatch(/parseFloat|parseInt|Number\(/u);
    expect(code).not.toMatch(/toFixed|toLocaleString/u);
  });
});

describe("Design Rule: synthetic sources render as synthetic, never live", () => {
  it("shows a rehearsal warning on the Maya origin surface", () => {
    expect(upstreamOrigin).toContain("upstream-cash-rehearsal-warning");
    expect(upstreamOrigin).toMatch(/not live cash/iu);
  });

  it("shows the unratified policy warning alongside it", () => {
    expect(upstreamOrigin).toContain("upstream-cash-assumed-policy-warning");
  });

  it("gates both warnings on backend flags rather than local inference", () => {
    const code = upstreamOrigin.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
    expect(code).toMatch(/origin\.rehearsalOnly/u);
    expect(code).toMatch(/origin\.assumedPolicy/u);
    expect(code).not.toMatch(/includes\(["']ASSUMED["']\)/u);
  });

  it("renders provenance on the surface rather than hiding it", () => {
    expect(upstreamOrigin).toContain("upstream-cash-provenance");
  });
});

describe("Design Rule: cards are per panel, never nested", () => {
  it.each(files.map((file) => file.path))("opens at most one Card in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    // <Card> opens a panel; <CardHeader>, <CardTitle> and <CardContent> are
    // parts of it. More than one opening <Card> in a component means a nested
    // or sibling card that the rule forbids inside a panel.
    const cardOpens = source.match(/<Card(?![A-Za-z])/gu) ?? [];
    expect(cardOpens.length).toBeLessThanOrEqual(1);
  });

  it("composes panels as siblings in the workspace, not as nested cards", () => {
    const workspace =
      files.find((file) => file.path.endsWith("agent-operations-workspace.tsx"))?.source ?? "";
    expect(workspace).not.toMatch(/<Card(?![A-Za-z])/u);
  });
});

describe("Design Rule: no scenario identity on a live-case surface", () => {
  it.each(files.map((file) => file.path))("exposes no scenario id in %s", (path) => {
    const source = files.find((file) => file.path === path)?.source ?? "";
    expect(source).not.toMatch(/scenarioId|ScenarioId/u);
  });
});

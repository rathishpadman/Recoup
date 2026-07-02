import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface BaselineCapture {
  liveRoute?: boolean;
  name?: string;
  screenshot?: string;
}

interface BaselineManifest {
  captures?: BaselineCapture[];
}

describe("real evidence comparison doc", () => {
  it("has one explicit pending comparison row for every Phase 0 live route", () => {
    const manifest = JSON.parse(
      readFileSync("docs/audit/real-evidence-baseline/2026-07-01/manifest.json", "utf8")
    ) as BaselineManifest;
    const comparison = readFileSync("docs/audit/real-evidence-comparison/2026-07-01.md", "utf8");
    const rows = comparison
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("| ") && !line.startsWith("|---") && !line.includes("Route / state"));
    const rowsByRoute = new Map(
      rows.map((row) => {
        const columns = row
          .split("|")
          .slice(1, -1)
          .map((column) => column.trim());

        return [columns[0] ?? "", columns] as const;
      })
    );
    const expectedCaptures = manifest.captures?.filter(
      (capture): capture is Required<Pick<BaselineCapture, "name" | "screenshot">> & BaselineCapture =>
        capture.liveRoute === true && typeof capture.name === "string" && typeof capture.screenshot === "string"
    );

    expect(expectedCaptures?.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(expectedCaptures?.length ?? 0);
    expect(comparison).not.toContain("CFO / Credit / Trace / Evals");
    expect(comparison).not.toContain("new console failures");
    expect(comparison).not.toContain("additional console failures");
    expect(comparison).not.toContain("does not introduce new failures beyond recorded baseline");
    expect(comparison).toContain("browser console/page errors in the post-capture manifest");

    for (const capture of expectedCaptures ?? []) {
      const columns = rowsByRoute.get(capture.name);
      expect(columns, `missing comparison row for ${capture.name}`).toBeDefined();
      expect(columns?.[1]).toBe(`\`../real-evidence-baseline/2026-07-01/screenshots/${capture.screenshot}\``);
      expect(columns?.[2]).toBe(`\`../real-evidence-post-implementation/2026-07-01/screenshots/${capture.screenshot}\``);
      expect(columns?.[5]).toBe("pending");
    }

    for (const row of rows) {
      const automatedPassColumn = row
        .split("|")
        .slice(1, -1)
        .map((column) => column.trim())[5];
      expect(automatedPassColumn).toBe("pending");
      expect(automatedPassColumn).not.toMatch(/\b(?:pass|complete|yes)\b/iu);
    }
  });
});

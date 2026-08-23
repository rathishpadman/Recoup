import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * BRD FR-OPS-04 and FR-OPS-06, scored against what the panels actually render.
 *
 * Both are Must requirements and both were substantially unmet: the ledger
 * showed two of its seven required fields, and run details showed none of the
 * six items FR-OPS-06 names. The values asserted here already travel in the
 * snapshot payload, so the gap was presentation, not data.
 */

function source(file: string): string {
  return readFileSync(`cockpit/components/agent-operations/${file}`, "utf8");
}

describe("agent operations required fields", () => {
  it("cites the case the run created (FR-OPS-06)", () => {
    const detail = source("run-detail.tsx");

    expect(detail).toContain("detail.caseId");
    expect(detail).toContain("run-detail-case-id");
  });

  it("shows the phase each event belongs to (FR-OPS-04)", () => {
    const ledger = source("activity-ledger.tsx");

    expect(ledger).toContain("event.phase");
  });

  it("cites the record IDs behind each event (FR-OPS-04)", () => {
    const ledger = source("activity-ledger.tsx");

    expect(ledger).toContain("event.recordIds");
  });

  it("keeps the case ID on the detail contract", () => {
    const types = source("types.ts");
    const detailBlock = types.slice(types.indexOf("export interface RunDetail"));

    expect(detailBlock.slice(0, detailBlock.indexOf("}"))).toContain("caseId");
  });
});

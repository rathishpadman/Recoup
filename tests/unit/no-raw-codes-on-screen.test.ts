import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  readableSpecialist,
  readableValidatedReason
} from "../../cockpit/components/agent-operations/display.ts";

/**
 * Codes the machine uses should not be the words the reader gets.
 *
 * Two of them survived onto the production screen after the ledger and the
 * detail panel were made readable:
 *
 *  - the Runs table printed `cash_application` in its Agent column, while the
 *    roster two panels above it called the same agent "Cash Application";
 *  - "Validated reason: DEP" told a reader nothing. DEP is the deposit
 *    deduction category the first release is scoped to, and it is the only
 *    validated code the reason map can produce.
 *
 * The code stays visible in the reason, because it is the governed value a
 * reviewer checks against policy. What was missing was its meaning.
 */

const DIR = "cockpit/components/agent-operations";

describe("the Runs table names the agent the way the roster does", () => {
  it("does not print the specialist key", () => {
    const table = readFileSync(`${DIR}/run-table.tsx`, "utf8");

    expect(table).toContain("readableSpecialist(row.agent)");
  });

  it("resolves the key the backend sends", () => {
    expect(readableSpecialist("cash_application")).toBe("Cash Application");
  });
});

describe("a validated reason carries its meaning", () => {
  it("says what DEP is", () => {
    expect(readableValidatedReason("DEP").toLowerCase()).toContain("deposit");
  });

  it("keeps the governed code on screen for a reviewer", () => {
    expect(readableValidatedReason("DEP")).toContain("DEP");
  });

  it("shows an unmapped code as itself rather than blank", () => {
    // A missing label should look like a gap in the list, not like a reason
    // that was never validated.
    expect(readableValidatedReason("XYZ")).toBe("XYZ");
  });

  it("is what the detail panel renders", () => {
    const detail = readFileSync(`${DIR}/run-detail.tsx`, "utf8");

    expect(detail).toContain("readableValidatedReason(detail.evidence.validatedReason)");
  });
});

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

/**
 * Why the cash pipeline does not write into Maya's deduction work list.
 *
 * It tried. A completed short payment wrote a row into
 * recoup_deduction_claims, and the row was accepted: the columns matched, the
 * foreign key to recoup_evidence_documents was satisfied, the money kept its
 * cents. Every check passed.
 *
 * Then Maya's whole workspace returned 503.
 *
 * recoup_deduction_claims is not a work list. It is one half of a validated
 * pair, and the loader that builds her surface requires the other half:
 *
 *     const receipt = receiptsByClaimId.get(claim.claimId);
 *     if (receipt === undefined || receipt.lineId !== claim.lineId) {
 *       throw new Error(`Supabase reconciliation receipt missing for ...`);
 *     }
 *
 * Every claim must have a matching recoup_reconciliation_receipts row carrying
 * a ruleId and a derivedRuleInput that a rules engine produced. One unpaired
 * claim throws, the throw is caught as a missing source, and the entire
 * forensics surface fails closed — not just the new row, all twenty of the
 * existing ones with it.
 *
 * The cash pipeline cannot supply that half. It produces an allocation and a
 * validated reason code; it does not run the reconciliation rules. Writing a
 * receipt to satisfy the check would mean inventing a rule input and a verdict
 * for a deduction nothing has evaluated, which is the one thing this system is
 * built not to do.
 *
 * So the handover stops at the case, and the gap is recorded here rather than
 * papered over. Closing it properly needs the reconciliation rules to run over
 * a live case — real work, and a decision about what it is allowed to conclude.
 */

describe("the cash pipeline leaves Maya's claim table alone", () => {
  const run = readFileSync("src/services/cashApplicationRun.ts", "utf8");
  const store = readFileSync("src/adapters/remittanceEvidenceStore.ts", "utf8");

  it("writes no deduction claim", () => {
    // A claim without its reconciliation receipt takes the whole surface down.
    expect(run).not.toContain("insertDeductionClaim");
  });

  it("writes no canonical evidence document", () => {
    // Same dataset, same validation pass. The remittance evidence lives in the
    // cash tables, which nothing else parses.
    expect(store).not.toContain("recoup_evidence_documents");
  });

  it("still records the case, which is as far as the handover honestly goes", () => {
    expect(run).toContain("upsertCase");
  });

  it("still keeps the remittance evidence chain intact", () => {
    for (const table of [
      "recoup_cash_inbox",
      "recoup_cash_remittances",
      "recoup_cash_remittance_lines"
    ]) {
      expect(store).toContain(table);
    }
  });
});

describe("why no amount of evidence closes this", () => {
  const loader = readFileSync("src/adapters/supabaseSyntheticSource.ts", "utf8");

  it("is forbidden by SA-CA-03, not merely unimplemented", () => {
    /**
     * The signed SDD states it directly:
     *
     *   SA-CA-03 | Live cases never alter S1-S8 storage, enums or gold totals
     *
     * S1-S8 is the gold dataset the parity tests measure against. A live case
     * joining it would move gold totals, which is the one thing that dataset
     * exists to hold still. tests/invariants/live-case-gold-isolation.ts
     * enforces it and the schema comments repeat it.
     *
     * So the handover stopping at the case is the design, not a gap. The
     * destination for a live cash case is the operations case view, which is
     * where it already goes. Routing it into the deduction workspace would
     * breach a ratified invariant, and precedence puts INVARIANTS.md above
     * any judgement made here.
     */
    expect(loader).toMatch(/scenarioIdFromLineId/u);
  });

  it("still refuses a foreign line id at the loader", () => {
    /**
     * The stop is architectural, not a data gap.
     *
     *   const scenarioId = lineId.match(/^(S[1-8])-/u)?.[1];
     *   return z.enum(["S1"..."S8"]).parse(scenarioId);
     *
     * An unmatched line id parses undefined and throws, and the throw is
     * caught as a missing source, so one foreign line fails the surface
     * closed for every row.
     *
     * A case from an email has a line id like LINE-1. It cannot join this
     * dataset. The deduction workspace is not a work list that accepts new
     * items; it is a projection of a fixed eight-scenario fixture.
     *
     * Supplying rehearsal carrier evidence — the pattern the bank
     * confirmation already uses — does not help. The rules would run
     * honestly and the verdict would be real, and the line id would still be
     * refused one layer further down.
     *
     * Connecting live cash cases to this surface means rebuilding it to
     * accept arbitrary lines: scenarioIdFromLineId, the schema that requires
     * a scenarioId, and the fail-closed loader around them.
     */
    expect(loader).toMatch(/scenarioIdFromLineId/u);
    expect(loader).toMatch(/S\[1-8\]/u);
  });
});

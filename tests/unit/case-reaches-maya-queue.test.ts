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

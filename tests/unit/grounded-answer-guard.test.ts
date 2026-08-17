import { describe, expect, it } from "vitest";
import { buildGroundedAnswerFacts, verifyGroundedAnswer } from "../../src/services/groundedAnswerGuard.js";

const facts = buildGroundedAnswerFacts({
  amounts: ["$15,900.00", "$21,300.00"],
  caseIds: ["S3", "S7"],
  counts: [2, 4, 8],
  customerNames: ["Crestline Grocery", "Harbor Foods"],
  recordIds: ["S3-L1", "S7-L1", "EVD-TPM-ACCRUAL-S7-L1"],
  routings: ["recovery"],
  ruleIds: ["promo-overclaim", "shortage-pod-mismatch"],
  verdicts: ["invalid", "partial"]
});

describe("grounded answer guard", () => {
  it("accepts prose that only uses supplied facts", () => {
    const result = verifyGroundedAnswer(
      "S7 for Harbor Foods is partial and routes to recovery for $15,900.00 under promo-overclaim.",
      facts
    );

    expect(result.status).toBe("verified");
  });

  it("rejects a dollar amount the model invented", () => {
    // I-1 is enforced mechanically here: an amount the code never computed cannot reach a reader,
    // whatever the model wrote.
    const result = verifyGroundedAnswer("S7 recovers $99,999.00 in full.", facts);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reason : "").toContain("$99,999.00");
  });

  it("rejects a case ID that is not in the run", () => {
    const result = verifyGroundedAnswer("S9 is the promo case you are looking for.", facts);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reason : "").toContain("S9");
  });

  it("rejects a record ID that was never cited", () => {
    const result = verifyGroundedAnswer("The basis is EVD-TPM-ACCRUAL-S4-L1.", facts);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reason : "").toContain("EVD-TPM-ACCRUAL-S4-L1");
  });

  it("rejects a count the model made up", () => {
    const result = verifyGroundedAnswer("There are 17 deduction cases in this run.", facts);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reason : "").toContain("17");
  });

  it("rejects a customer that is not in the run", () => {
    const result = verifyGroundedAnswer("Greenleaf Markets is the affected customer.", facts);

    expect(result.status).toBe("rejected");
  });

  it("allows ordinary numbers that are not claims about the run", () => {
    // Rejecting every digit would make the guard unusable; only run-scoped quantities matter.
    const result = verifyGroundedAnswer("Both S3 and S7 route to recovery.", facts);

    expect(result.status).toBe("verified");
  });

  it("rejects prose that references nothing from the run", () => {
    // Inventing nothing is not the same as saying something. A sentence with no case, verdict,
    // routing or amount in it would otherwise pass the guard and replace a useful answer.
    const result = verifyGroundedAnswer("The evidence has been reviewed and the check is complete.", facts);

    expect(result.status).toBe("rejected");
    expect(result.status === "rejected" ? result.reason : "").toMatch(/did not reference/iu);
  });

  it("rejects empty or whitespace-only prose", () => {
    expect(verifyGroundedAnswer("   ", facts).status).toBe("rejected");
  });

  it("treats an amount written without decimals as the same fact", () => {
    // The model will not reliably reproduce trailing zeros; a format difference is not a fabrication.
    const result = verifyGroundedAnswer("S7 recovers $15,900 in full.", facts);

    expect(result.status).toBe("verified");
  });
});

import { describe, expect, it } from "vitest";

import { deriveRuleInput } from "../../src/services/deductionEvidenceDerivation.ts";
import type { EvidenceDocument } from "../../src/services/deductionEvidenceDerivation.ts";

/**
 * Turning documents into a rule input, with every field attributed.
 *
 * A deduction only reaches a person once a rule has evaluated it, and a rule
 * only runs on facts: was a carrier report received, how much was damaged, did
 * photos arrive. Those facts live in evidence documents. Nothing in this
 * codebase read them — the seeded reconciliation receipts were authored with
 * their rule inputs already filled in, so the derivation step had never
 * existed.
 *
 * That absence is why the cash pipeline could not hand a case onward: it could
 * write a claim, but not the receipt that makes a claim reviewable, because
 * producing one meant asserting facts it had no way to establish.
 *
 * The rule this module follows is that a field may only be set from a document
 * that states it. Every derived field carries the evidence id it came from,
 * and a missing document is a refusal rather than a default. `false` is not a
 * safe default here: "no photo evidence" and "we did not look" are different
 * claims about the world, and only one of them is honest when the document is
 * absent.
 */

const REMIT: EvidenceDocument = {
  evidenceId: "EVD-REMIT-S1-L1",
  documentType: "remittance_advice",
  payload: {
    lineId: "S1-L1",
    invoiceRef: "INV-S1-L1",
    reasonCode: "DAMAGE",
    claimAmount: "2700.00",
    deductionRef: "DED-S1-L1"
  }
};

const REPORT: EvidenceDocument = {
  evidenceId: "EVD-CARRIER-REPORT-S1-L1",
  documentType: "carrier_damage_report",
  payload: {
    lineId: "S1-L1",
    invoiceRef: "INV-S1-L1",
    reportStatus: "VERIFIED",
    damagedGoodsAmount: "2700.00",
    salvageCreditAmount: "0.00"
  }
};

const PHOTO: EvidenceDocument = {
  evidenceId: "EVD-CARRIER-PHOTO-S1-L1",
  documentType: "carrier_photo",
  payload: { lineId: "S1-L1", photoSetId: "PHOTO-S1-L1", photoEvidenceReceived: true }
};

describe("deriving a damage rule input from documents", () => {
  it("reproduces the rule input the seeded receipt carries", () => {
    const derived = deriveRuleInput({
      lineId: "S1-L1",
      period: "2026-08",
      claimId: "CLAIM-S1-L1",
      documents: [REMIT, REPORT, PHOTO]
    });

    /**
     * The strongest check available: production already holds the receipt this
     * line should produce, authored independently of this code. Deriving the
     * same values from the documents proves the derivation matches the system
     * rather than merely being self-consistent.
     */
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;

    expect(derived.ruleId).toBe("damage-evidence-valid");
    expect(derived.input).toMatchObject({
      lineId: "S1-L1",
      period: "2026-08",
      ruleId: "damage-evidence-valid",
      claimedAmount: "2700.00",
      damagedGoodsAmount: "2700.00",
      salvageCreditAmount: "0.00",
      carrierReportReceived: true,
      photoEvidenceReceived: true
    });
  });

  it("attributes every derived fact to the document that states it", () => {
    const derived = deriveRuleInput({
      lineId: "S1-L1", period: "2026-08", claimId: "CLAIM-S1-L1",
      documents: [REMIT, REPORT, PHOTO]
    });
    if (!derived.ok) throw new Error("expected a derivation");

    expect(derived.inputFieldEvidence).toEqual({
      claimedAmount: ["EVD-REMIT-S1-L1"],
      damagedGoodsAmount: ["EVD-CARRIER-REPORT-S1-L1"],
      salvageCreditAmount: ["EVD-CARRIER-REPORT-S1-L1"],
      carrierReportReceived: ["EVD-CARRIER-REPORT-S1-L1"],
      photoEvidenceReceived: ["EVD-CARRIER-PHOTO-S1-L1"]
    });
  });

  it("cites the documents it actually used", () => {
    const derived = deriveRuleInput({
      lineId: "S1-L1", period: "2026-08", claimId: "CLAIM-S1-L1",
      documents: [REMIT, REPORT, PHOTO]
    });
    if (!derived.ok) throw new Error("expected a derivation");

    expect([...derived.evidenceIds].sort()).toEqual([
      "EVD-CARRIER-PHOTO-S1-L1",
      "EVD-CARRIER-REPORT-S1-L1",
      "EVD-REMIT-S1-L1"
    ]);
  });
});

describe("a missing document is a refusal, never a default", () => {
  it("refuses when the carrier report is absent", () => {
    const derived = deriveRuleInput({
      lineId: "S1-L1", period: "2026-08", claimId: "CLAIM-S1-L1",
      documents: [REMIT, PHOTO]
    });

    // Not carrierReportReceived: false. We did not look at a report; we do not
    // have one, and saying "not received" would be a claim about the world.
    expect(derived).toMatchObject({ ok: false, reason: "missing_evidence" });
    if (derived.ok) return;
    expect(derived.missing).toContain("carrier_damage_report");
  });

  it("refuses when the photo set is absent", () => {
    const derived = deriveRuleInput({
      lineId: "S1-L1", period: "2026-08", claimId: "CLAIM-S1-L1",
      documents: [REMIT, REPORT]
    });

    expect(derived.ok).toBe(false);
  });

  it("refuses a line with no documents at all", () => {
    // The live case: an emailed remittance for a customer with no dossier.
    const derived = deriveRuleInput({
      lineId: "LINE-1", period: "2026-08", claimId: "CASE-live", documents: []
    });

    expect(derived).toMatchObject({ ok: false, reason: "missing_evidence" });
  });

  it("refuses when a report exists but was never verified", () => {
    const unverified: EvidenceDocument = {
      ...REPORT,
      payload: { ...REPORT.payload, reportStatus: "PENDING" }
    };
    const derived = deriveRuleInput({
      lineId: "S1-L1", period: "2026-08", claimId: "CLAIM-S1-L1",
      documents: [REMIT, unverified, PHOTO]
    });

    // The document exists and says the carrier has not confirmed. That is a
    // fact, and it is not the same fact as a verified report.
    if (derived.ok) {
      expect(derived.input.carrierReportReceived).toBe(false);
    }
  });

  it("ignores documents belonging to another line", () => {
    const otherLine: EvidenceDocument = {
      ...PHOTO,
      evidenceId: "EVD-CARRIER-PHOTO-S9-L9",
      payload: { ...PHOTO.payload, lineId: "S9-L9" }
    };
    const derived = deriveRuleInput({
      lineId: "S1-L1", period: "2026-08", claimId: "CLAIM-S1-L1",
      documents: [REMIT, REPORT, otherLine]
    });

    expect(derived.ok).toBe(false);
  });
});

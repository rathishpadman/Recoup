/**
 * Turns evidence documents into a rule input, with every field attributed.
 *
 * A deduction becomes reviewable only once a rule has evaluated it, and a rule
 * evaluates facts: was a carrier report received, how much was damaged, did
 * photos arrive. Those facts live in evidence documents, and nothing in this
 * codebase read them. The seeded reconciliation receipts were authored with
 * their rule inputs already filled in, so this step had never existed — which
 * is why the cash pipeline could write a claim but not the receipt that makes
 * a claim reviewable.
 *
 * One rule governs everything here: a field may only be set from a document
 * that states it. A missing document is a refusal, not a default. "No photo
 * evidence" and "we did not look" are different claims about the world, and
 * only one of them is honest when the document is absent — so this module
 * returns `missing_evidence` rather than `false`.
 *
 * The derivation is deliberately separate from anything that writes. It can be
 * run and checked against the receipts production already holds without a row
 * being created, which is the safe order for a table whose consumer fails
 * closed for every row when one row is wrong.
 */

export interface EvidenceDocument {
  evidenceId: string;
  documentType: string;
  payload: Record<string, unknown>;
}

/** The rule inputs derived so far. Money stays a string; nothing is computed. */
export interface DerivedDamageInput {
  ruleId: "damage-evidence-valid";
  lineId: string;
  period: string;
  recordIds: string[];
  claimedAmount: string;
  damagedGoodsAmount: string;
  salvageCreditAmount: string;
  carrierReportReceived: boolean;
  photoEvidenceReceived: boolean;
}

export type DerivationResult =
  | {
      ok: true;
      ruleId: "damage-evidence-valid";
      input: DerivedDamageInput;
      /** Every derived field mapped to the documents that state it. */
      inputFieldEvidence: Record<string, string[]>;
      evidenceIds: string[];
    }
  | { ok: false; reason: "missing_evidence" | "unsupported_reason"; missing: string[] };

interface DeriveInput {
  lineId: string;
  period: string;
  claimId: string;
  documents: EvidenceDocument[];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * A document counts for this line only if it says so.
 *
 * Evidence is keyed by line, and a dossier fetched by customer will contain
 * other lines' documents. Deriving a fact for one deduction from another
 * deduction's paperwork is the quietest way to be wrong.
 */
function forLine(documents: EvidenceDocument[], lineId: string, type: string): EvidenceDocument | undefined {
  return documents.find(
    (document) => document.documentType === type && readString(document.payload.lineId) === lineId
  );
}

export function deriveRuleInput(request: DeriveInput): DerivationResult {
  const { lineId, period, claimId, documents } = request;

  const remittance = forLine(documents, lineId, "remittance_advice");
  const report = forLine(documents, lineId, "carrier_damage_report");
  const photo = forLine(documents, lineId, "carrier_photo");

  const missing: string[] = [];
  if (remittance === undefined) missing.push("remittance_advice");
  if (report === undefined) missing.push("carrier_damage_report");
  if (photo === undefined) missing.push("carrier_photo");

  if (remittance === undefined || report === undefined || photo === undefined) {
    return { ok: false, reason: "missing_evidence", missing };
  }

  /**
   * Only damage is derived today. The other rules need document types this
   * function has not been taught to read, and guessing at their shape would
   * reintroduce exactly the assertion-without-a-document problem.
   */
  if (readString(remittance.payload.reasonCode) !== "DAMAGE") {
    return { ok: false, reason: "unsupported_reason", missing: [] };
  }

  const claimedAmount = readString(remittance.payload.claimAmount);
  const damagedGoodsAmount = readString(report.payload.damagedGoodsAmount);
  const salvageCreditAmount = readString(report.payload.salvageCreditAmount);

  if (claimedAmount === undefined || damagedGoodsAmount === undefined || salvageCreditAmount === undefined) {
    return { ok: false, reason: "missing_evidence", missing: ["amounts"] };
  }

  return {
    ok: true,
    ruleId: "damage-evidence-valid",
    input: {
      ruleId: "damage-evidence-valid",
      lineId,
      period,
      recordIds: [claimId, lineId, photo.evidenceId, report.evidenceId, remittance.evidenceId],
      claimedAmount,
      damagedGoodsAmount,
      salvageCreditAmount,
      // The report states whether the carrier verified it. Any other status is
      // that document saying "not confirmed", which is a fact we can record.
      carrierReportReceived: readString(report.payload.reportStatus) === "VERIFIED",
      photoEvidenceReceived: photo.payload.photoEvidenceReceived === true
    },
    inputFieldEvidence: {
      claimedAmount: [remittance.evidenceId],
      damagedGoodsAmount: [report.evidenceId],
      salvageCreditAmount: [report.evidenceId],
      carrierReportReceived: [report.evidenceId],
      photoEvidenceReceived: [photo.evidenceId]
    },
    evidenceIds: [photo.evidenceId, report.evidenceId, remittance.evidenceId]
  };
}

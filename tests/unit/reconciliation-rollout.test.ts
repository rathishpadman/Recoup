import { describe, expect, it } from "vitest";
import { readCanaryLines, readReconciliationMode } from "../../config/reconciliationRollout.js";
import {
  currentDecisionSourceForLine,
  type ReconciliationReceiptAvailability
} from "../../src/services/reconciliationRollout.js";

describe("reconciliation rollout modes", () => {
  it("defaults production runtime to legacy rollback mode until receipts are explicitly promoted", () => {
    expect(readReconciliationMode({})).toBe("legacy");
  });

  it("uses reconciliation receipts only in authoritative mode", () => {
    const availability = receiptAvailability(["S3-L1"]);

    expect(currentDecisionSourceForLine({ availability, lineId: "S3-L1", mode: "authoritative" })).toEqual({
      lineId: "S3-L1",
      mode: "authoritative",
      source: "reconciliation_receipt"
    });
    expect(() =>
      currentDecisionSourceForLine({ availability, lineId: "S4-L1", mode: "authoritative" })
    ).toThrow("Reconciliation receipt required for S4-L1 in authoritative mode.");
  });

  it("uses receipts only for listed canary line IDs", () => {
    const availability = receiptAvailability(["S3-L1"]);
    const canaryLines = readCanaryLines({ RECOUP_RECONCILIATION_CANARY_LINES: " S3-L1, S6-L1 " });

    expect(currentDecisionSourceForLine({ availability, canaryLines, lineId: "S3-L1", mode: "canary" }).source).toBe(
      "reconciliation_receipt"
    );
    expect(currentDecisionSourceForLine({ availability, canaryLines, lineId: "S2-L1", mode: "canary" }).source).toBe(
      "legacy_rollback"
    );
  });

  it("allows legacy only as an explicit operational rollback mode", () => {
    const availability = receiptAvailability(["S3-L1"]);

    expect(currentDecisionSourceForLine({ availability, lineId: "S3-L1", mode: "legacy" })).toEqual({
      lineId: "S3-L1",
      mode: "legacy",
      source: "legacy_rollback"
    });
  });

  it("supports rollback from canary or authoritative to legacy or shadow without requiring receipts", () => {
    const availability = receiptAvailability(["S3-L1"]);
    const canaryLines = readCanaryLines({ RECOUP_RECONCILIATION_CANARY_LINES: "S3-L1,S6-L1" });

    expect(currentDecisionSourceForLine({ availability, canaryLines, lineId: "S3-L1", mode: "canary" })).toEqual({
      lineId: "S3-L1",
      mode: "canary",
      source: "reconciliation_receipt"
    });
    expect(() =>
      currentDecisionSourceForLine({ availability, lineId: "S4-L1", mode: "authoritative" })
    ).toThrow("Reconciliation receipt required for S4-L1 in authoritative mode.");

    for (const transition of [
      { from: "canary", lineId: "S6-L1", to: "legacy" },
      { from: "canary", lineId: "S6-L1", to: "shadow" },
      { from: "authoritative", lineId: "S4-L1", to: "legacy" },
      { from: "authoritative", lineId: "S4-L1", to: "shadow" }
    ] as const) {
      expect(
        currentDecisionSourceForLine({
          availability,
          canaryLines,
          lineId: transition.lineId,
          mode: transition.to
        })
      ).toEqual({
        lineId: transition.lineId,
        mode: transition.to,
        source: "legacy_rollback"
      });
    }
  });

  it("never merges legacy values into a current reconciliation receipt", () => {
    const availability = receiptAvailability(["S3-L1"]);
    const decisionSource = currentDecisionSourceForLine({ availability, lineId: "S3-L1", mode: "authoritative" });

    expect(JSON.stringify(decisionSource)).not.toContain("rule_input_json");
    expect(JSON.stringify(decisionSource)).not.toContain("verdict");
    expect(JSON.stringify(decisionSource)).not.toContain("routing");
  });
});

function receiptAvailability(lineIds: string[]): ReconciliationReceiptAvailability {
  return {
    hasReceipt(lineId) {
      return lineIds.includes(lineId);
    }
  };
}

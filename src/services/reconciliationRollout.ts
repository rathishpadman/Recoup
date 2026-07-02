import type { ReconciliationMode } from "../../config/reconciliationRollout.js";

export interface ReconciliationReceiptAvailability {
  hasReceipt(lineId: string): boolean;
}

export interface CurrentDecisionSourceInput {
  availability: ReconciliationReceiptAvailability;
  canaryLines?: ReadonlySet<string>;
  lineId: string;
  mode: ReconciliationMode;
}

export interface CurrentDecisionSource {
  lineId: string;
  mode: ReconciliationMode;
  source: "legacy_rollback" | "reconciliation_receipt";
}

export function currentDecisionSourceForLine(input: CurrentDecisionSourceInput): CurrentDecisionSource {
  switch (input.mode) {
    case "authoritative":
      requireReceipt(input.availability, input.lineId, input.mode);
      return { lineId: input.lineId, mode: input.mode, source: "reconciliation_receipt" };
    case "canary":
      if (input.canaryLines?.has(input.lineId) === true) {
        requireReceipt(input.availability, input.lineId, input.mode);
        return { lineId: input.lineId, mode: input.mode, source: "reconciliation_receipt" };
      }
      return { lineId: input.lineId, mode: input.mode, source: "legacy_rollback" };
    case "shadow":
    case "legacy":
      return { lineId: input.lineId, mode: input.mode, source: "legacy_rollback" };
  }
}

function requireReceipt(
  availability: ReconciliationReceiptAvailability,
  lineId: string,
  mode: Extract<ReconciliationMode, "authoritative" | "canary">
): void {
  if (!availability.hasReceipt(lineId)) {
    throw new Error(`Reconciliation receipt required for ${lineId} in ${mode} mode.`);
  }
}

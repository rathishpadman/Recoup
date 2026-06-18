import { buildFinding } from "./shared.js";
import type { DamageEvidenceValidInput, RuleFinding } from "./types.js";

const basis = "Damage claim supported by photo evidence and carrier report.";

export function evaluateDamageEvidenceValid(input: DamageEvidenceValidInput): RuleFinding | undefined {
  if (!input.photoEvidenceReceived || !input.carrierReportReceived) {
    return undefined;
  }

  if (!input.damagedGoodsAmount || !input.salvageCreditAmount) {
    return undefined;
  }

  return buildFinding(input, input.damagedGoodsAmount.minus(input.salvageCreditAmount), basis);
}

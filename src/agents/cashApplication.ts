import type { CashAllocationReceipt } from "../core/cashApplication/allocate.js";
import type { ValidatedReasonResult } from "../core/cashApplication/reason.js";
import type { CashReceipt } from "../types/cashApplication.js";

/**
 * Cash Application agent authority boundary.
 *
 * The load-bearing rule for this repository is that the model decides what to
 * compute and what to do, while code computes every dollar. This module is the
 * boundary that enforces it for cash application: the agent narrates a decision
 * the deterministic core already made, and has no tool that can produce, alter
 * or infer a monetary value.
 *
 * The narration is presentation. If it degrades or fails, the allocation is
 * unaffected, because nothing downstream reads the narrative.
 */

export const CASH_APPLICATION_PROMPT_CACHE_NAMESPACE = "cash_application";

/** Tools the agent may call. Each is read-only and returns pre-computed values. */
export const CASH_APPLICATION_TOOL_WHITELIST = [
  "get_allocation_receipt",
  "get_validated_reason",
  "get_cited_records"
] as const;

export type CashApplicationTool = (typeof CASH_APPLICATION_TOOL_WHITELIST)[number];

export interface CashApplicationNarrationInput {
  receipt: CashReceipt;
  allocation: CashAllocationReceipt;
  validatedReason: ValidatedReasonResult;
}

export interface CashApplicationNarration {
  summary: string;
  citedRecordIds: string[];
  degraded: boolean;
  /** Every figure the narrative may mention, pre-formatted by the core. */
  deterministicBasis: {
    applied: string;
    deduction: string;
    unapplied: string;
    currency: string;
    reconciliationStatus: string;
    policyVersion: string;
  };
}

export class CashApplicationAuthorityError extends Error {}

/**
 * Rejects any narration that introduces a figure the core did not produce.
 *
 * A model asked to summarise an allocation will sometimes round, restate or
 * total the numbers helpfully. Any of those would be a model asserting a dollar
 * figure, so the check is exact: every number-like token in the narrative must
 * appear verbatim in the deterministic basis.
 */
export function assertNoUnsanctionedFigures(
  narrative: string,
  basis: CashApplicationNarration["deterministicBasis"]
): void {
  const sanctioned = new Set([basis.applied, basis.deduction, basis.unapplied]);
  const tokens = narrative.match(/\d+(?:[.,]\d+)*/gu) ?? [];

  for (const token of tokens) {
    if (!sanctioned.has(token)) {
      throw new CashApplicationAuthorityError(
        `narration introduced an unsanctioned figure: ${token}`
      );
    }
  }
}

/**
 * Builds the narration deterministically.
 *
 * A model may later replace the sentence, but it may only ever be handed the
 * basis below and its output is checked by assertNoUnsanctionedFigures. The
 * default path needs no model at all, which is what makes degradation safe.
 */
export function buildCashApplicationNarration(
  input: CashApplicationNarrationInput
): CashApplicationNarration {
  const { allocation, validatedReason } = input;

  const deterministicBasis = {
    applied: allocation.totalAppliedAmount,
    deduction: allocation.totalDeductionAmount,
    unapplied: allocation.totalUnappliedAmount,
    currency: allocation.currency,
    reconciliationStatus: allocation.reconciliationStatus,
    policyVersion: allocation.policyVersion
  };

  const reasonPart =
    validatedReason.status === "validated"
      ? `validated as ${validatedReason.validatedReason}`
      : `reason ${validatedReason.reason}, sent to review`;

  const summary =
    `Applied ${deterministicBasis.applied} ${deterministicBasis.currency}, ` +
    `deduction ${deterministicBasis.deduction}, ` +
    `unapplied ${deterministicBasis.unapplied}; ` +
    `${deterministicBasis.reconciliationStatus}; ${reasonPart}.`;

  assertNoUnsanctionedFigures(summary, deterministicBasis);

  return {
    summary,
    citedRecordIds: allocation.recordIds,
    degraded: false,
    deterministicBasis
  };
}

/**
 * Degraded narration for when a model call fails or is unavailable.
 *
 * It still cites records and still carries the basis; only the prose is thinner.
 * The allocation is untouched, which is the point.
 */
export function buildDegradedNarration(
  input: CashApplicationNarrationInput
): CashApplicationNarration {
  const built = buildCashApplicationNarration(input);
  return {
    ...built,
    summary: "Narration unavailable; allocation and cited records are unaffected.",
    degraded: true
  };
}

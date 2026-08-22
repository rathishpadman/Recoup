import type { CashReasonMap } from "../../../config/cashReasonMap.js";

/**
 * Deterministic reason validation, from Technical Design 5.3.
 *
 * The function accepts a sanitized claimed reason and code, an approved mapping
 * and cited source records, and returns a validated `DEP`, `review` or
 * `blocked`. No embedding similarity and no free-form model classification may
 * become the authoritative code in the first release, so the only thing that can
 * produce a validated reason here is an exact rule match on the machine-readable
 * code. Free text is carried for a human to read and is never classified.
 */

export type ValidatedReasonFailure =
  | "unclassified"
  | "ambiguous"
  | "policy_missing"
  | "evidence_missing";

export type ValidatedReasonResult =
  | {
      status: "validated";
      claimedReason: string;
      validatedReason: "DEP";
      ruleId: string;
      policyVersion: string;
      recordIds: string[];
    }
  | {
      status: "review" | "blocked";
      claimedReason: string | undefined;
      reason: ValidatedReasonFailure;
      recordIds: string[];
    };

export interface ValidateClaimedReasonInput {
  claimedReasonCode: string | undefined;
  claimedReasonTextSanitized?: string;
  reasonMap: CashReasonMap | undefined;
  recordIds: string[];
}

function normalizeCode(value: string): string {
  return value.trim().toLowerCase();
}

export function validateClaimedReason(
  input: ValidateClaimedReasonInput
): ValidatedReasonResult {
  const { claimedReasonCode, claimedReasonTextSanitized, reasonMap, recordIds } = input;
  const claimedReason = claimedReasonCode ?? claimedReasonTextSanitized;

  // A validated reason has to cite something. Without a record there is nothing
  // for a reviewer to check the claim against.
  if (recordIds.length === 0) {
    return { status: "review", claimedReason, reason: "evidence_missing", recordIds: [] };
  }

  if (reasonMap === undefined) {
    return { status: "review", claimedReason, reason: "policy_missing", recordIds };
  }

  // Only the machine-readable code is matched. Sanitized free text may accompany
  // the claim for a human, but classifying it here is exactly what the first
  // release forbids.
  if (claimedReasonCode === undefined || claimedReasonCode.trim().length === 0) {
    return { status: "review", claimedReason, reason: "unclassified", recordIds };
  }

  const normalized = normalizeCode(claimedReasonCode);
  const matches = reasonMap.rules.filter(
    (rule) => normalizeCode(rule.claimedReasonCode) === normalized
  );

  const [rule, ...extraRules] = matches;

  if (rule === undefined) {
    return { status: "review", claimedReason, reason: "unclassified", recordIds };
  }

  // A code resolving to two rules is a defect in the ratified map, not a case a
  // reviewer should be asked to resolve line by line.
  if (extraRules.length > 0) {
    return { status: "blocked", claimedReason, reason: "ambiguous", recordIds };
  }

  return {
    status: "validated",
    claimedReason: claimedReason ?? claimedReasonCode,
    validatedReason: rule.validatedReason,
    ruleId: rule.ruleId,
    policyVersion: reasonMap.policyVersion,
    recordIds
  };
}

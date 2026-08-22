import { z } from "zod";

import { NonEmptyId } from "../src/types/cashApplication.js";

/**
 * Claimed-reason to validated-reason contract (D-05 / D-08).
 *
 * Technical Design 5.3 requires a deterministic mapping from an approved
 * machine-readable claimed reason code to a validated reason, and forbids
 * embedding similarity or free-form model classification from becoming the
 * authoritative code in the first release. The map is therefore data, supplied
 * as an input, and the core reads nothing else.
 */

/** Technical Design 4.7: the first release intentionally permits only DEP. */
export const ValidatedReasonCodeSchema = z.literal("DEP");

export const ReasonRuleSchema = z.object({
  ruleId: NonEmptyId,
  claimedReasonCode: NonEmptyId,
  validatedReason: ValidatedReasonCodeSchema
});

export const CashReasonMapSchema = z.object({
  policyVersion: NonEmptyId,
  mapHash: NonEmptyId,
  rules: z.array(ReasonRuleSchema).min(1)
});

export type CashReasonMap = z.infer<typeof CashReasonMapSchema>;
export type ReasonRule = z.infer<typeof ReasonRuleSchema>;

/**
 * DEMO REASON MAP - ASSUMED VALUES, NOT OWNER-RATIFIED.
 *
 * D-05 and D-08 are open and must be ratified jointly. These codes were
 * authored for demo purposes on explicit owner instruction and are registered
 * in `docs/evidence/2026-08-22-cash-application-phase-0-evidence-record.md`.
 *
 * Every rule resolves to DEP because the first release permits nothing else.
 * The consequence is that these codes say a deduction is a deduction; they do
 * not yet distinguish a damage claim from a shortage claim, and no downstream
 * behaviour may assume they do.
 */
export const DEMO_REASON_MAP: CashReasonMap = {
  policyVersion: "demo-reason-map-v1-ASSUMED",
  // A real map hash is derived from ratified content. This label is a
  // placeholder that names itself rather than a computed digest.
  mapHash: "demo-reason-map-v1-ASSUMED-nohash",
  rules: [
    { ruleId: "RULE-DMG", claimedReasonCode: "DMG", validatedReason: "DEP" },
    { ruleId: "RULE-SHT", claimedReasonCode: "SHT", validatedReason: "DEP" },
    { ruleId: "RULE-PRC", claimedReasonCode: "PRC", validatedReason: "DEP" },
    { ruleId: "RULE-PROMO", claimedReasonCode: "PROMO", validatedReason: "DEP" }
  ]
};

/**
 * Returns the approved reason map, or undefined when none is approved.
 *
 * D-05/D-08 remain unratified, so the demo map is reachable only behind the
 * same explicit flag as the demo allocation policy. Without it the core reports
 * `policy_missing` and the claim goes to review, which is the fail-closed path.
 */
export function loadApprovedReasonMap(
  env: Partial<Record<string, string | undefined>> = process.env
): CashReasonMap | undefined {
  if (env.RECOUP_CASH_DEMO_POLICY_ENABLED?.trim().toLowerCase() === "true") {
    return DEMO_REASON_MAP;
  }

  return undefined;
}

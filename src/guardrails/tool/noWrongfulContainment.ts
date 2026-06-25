import { throwGuardrailTrip } from "../trip.js";

export interface NoWrongfulContainmentGuardInput {
  customerId: string;
  intentLabel: string;
  contained: boolean;
  recordIds: string[];
  deterministicBasis?: {
    gamingThresholds?: string;
    noWrongfulContainment?: boolean;
  };
}

const approvedGamingThresholdBasis = "governed-config-snapshot";

export function assertNoWrongfulContainment(decision: NoWrongfulContainmentGuardInput): void {
  if (!decision.contained) {
    return;
  }

  if (
    decision.intentLabel === "distressed-honest" &&
    decision.deterministicBasis?.gamingThresholds !== approvedGamingThresholdBasis
  ) {
    throwGuardrailTrip({
      guardrailName: "no-wrongful-containment",
      reason: "Distressed-honest customers cannot be contained without approved gaming thresholds.",
      recordIds: decision.recordIds
    });
  }

  if (decision.recordIds.length === 0 || decision.deterministicBasis?.noWrongfulContainment !== true) {
    throwGuardrailTrip({
      guardrailName: "no-wrongful-containment",
      reason: "Containment decisions require cited records and no-wrongful-containment basis.",
      recordIds: decision.recordIds
    });
  }

  if (decision.deterministicBasis.gamingThresholds !== approvedGamingThresholdBasis) {
    throwGuardrailTrip({
      guardrailName: "no-wrongful-containment",
      reason: "Containment decisions require approved gaming thresholds.",
      recordIds: decision.recordIds
    });
  }
}

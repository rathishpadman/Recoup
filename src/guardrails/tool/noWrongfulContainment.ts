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

const approvedGamingThresholdBasis = "owner-ratified-day-1-seed-present";

export function assertNoWrongfulContainment(decision: NoWrongfulContainmentGuardInput): void {
  if (!decision.contained) {
    return;
  }

  if (
    decision.intentLabel === "distressed-honest" &&
    decision.deterministicBasis?.gamingThresholds !== approvedGamingThresholdBasis
  ) {
    throw new Error("Distressed-honest customers cannot be contained without approved gaming thresholds.");
  }

  if (decision.recordIds.length === 0 || decision.deterministicBasis?.noWrongfulContainment !== true) {
    throw new Error("Containment decisions require cited records and no-wrongful-containment basis.");
  }

  if (decision.deterministicBasis.gamingThresholds !== approvedGamingThresholdBasis) {
    throw new Error("Containment decisions require approved gaming thresholds.");
  }
}

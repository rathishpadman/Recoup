export type CreditRecommendationFlowStepState = "current" | "done" | "waiting";

export interface CreditRecommendationFlowStep {
  label: string;
  state: CreditRecommendationFlowStepState;
}

export interface CreditRecommendationFlow {
  currentIndex: number;
  steps: CreditRecommendationFlowStep[];
  summary: string;
}

/**
 * Where an advisory credit recommendation has reached, named by role rather than by person so the
 * same strip reads correctly on either surface.
 *
 * Both surfaces render this: a recommendation that was approved but never acknowledged is exactly
 * the state that went unnoticed in production, because each surface only showed its own half.
 */
export function buildCreditRecommendationFlow(input: {
  acknowledged: boolean;
  approved: boolean;
}): CreditRecommendationFlow {
  // Acknowledgement without an approval is not reachable; treat it as not acknowledged rather than
  // reporting a completed flow for a decision that was never made.
  const acknowledged = input.approved && input.acknowledged;
  const currentIndex = acknowledged ? 3 : input.approved ? 2 : 1;
  const labels = ["Forensics analyst raises", "Human approval", "Credit lead acknowledges"];

  return {
    currentIndex,
    steps: labels.map((label, index) => ({
      label,
      state: index < currentIndex ? "done" : index === currentIndex ? "current" : "waiting"
    })),
    summary: acknowledged
      ? "Acknowledged by the credit lead."
      : input.approved
        ? "Waiting for the credit lead to acknowledge."
        : "Waiting for human approval."
  };
}

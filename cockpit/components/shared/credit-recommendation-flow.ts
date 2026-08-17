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
  /**
   * Whether the product can actually accept an acknowledgement yet. While it cannot, the step is
   * omitted rather than shown as pending: the credit surface previously read "Waiting for the
   * credit lead to acknowledge" with no acknowledge control anywhere on the page, which asked the
   * reviewer for an action the product could not take.
   */
  acknowledgementAvailable?: boolean;
  approved: boolean;
}): CreditRecommendationFlow {
  const acknowledgementAvailable = input.acknowledgementAvailable ?? true;
  // Acknowledgement without an approval is not reachable; treat it as not acknowledged rather than
  // reporting a completed flow for a decision that was never made.
  const acknowledged = acknowledgementAvailable && input.approved && input.acknowledged;
  const currentIndex = acknowledged ? 3 : input.approved ? 2 : 1;
  const labels = acknowledgementAvailable
    ? ["Forensics analyst raises", "Human approval", "Credit lead acknowledges"]
    : ["Forensics analyst raises", "Human approval"];

  if (!acknowledgementAvailable) {
    return {
      currentIndex,
      steps: labels.map((label, index) => ({
        label,
        state: index < currentIndex ? "done" : index === currentIndex ? "current" : "waiting"
      })),
      summary: input.approved ? "Approved and sent to the credit lead." : "Waiting for human approval."
    };
  }

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

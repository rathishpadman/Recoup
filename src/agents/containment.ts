import { assertIntentEvidence } from "../guardrails/tool/intentEvidence.js";
import { assertNoWrongfulContainment } from "../guardrails/tool/noWrongfulContainment.js";

export interface HarborContainmentAssessment {
  customerId: "CUST-HARBOR";
  intentLabel: "distressed-honest";
  contained: false;
  recordIds: string[];
  deterministicBasis: {
    gamingThresholds: "unset";
    noWrongfulContainment: true;
  };
}

export interface ContainmentDecision {
  customerId: string;
  contained: boolean;
}

export function assessHarborContainment(): HarborContainmentAssessment {
  const assessment: HarborContainmentAssessment = {
    customerId: "CUST-HARBOR",
    intentLabel: "distressed-honest",
    contained: false,
    recordIds: ["CUST-HARBOR", "LEDGER-HARBOR-DISTRESSED-HONEST"],
    deterministicBasis: {
      gamingThresholds: "unset",
      noWrongfulContainment: true
    }
  };

  assertIntentEvidence(assessment);
  assertNoWrongfulContainment(assessment);

  return assessment;
}

export function toContainmentDecision(assessment: HarborContainmentAssessment): ContainmentDecision {
  return {
    contained: assessment.contained,
    customerId: assessment.customerId
  };
}

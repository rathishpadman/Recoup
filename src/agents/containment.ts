import { assertIntentEvidence } from "../guardrails/tool/intentEvidence.js";
import { assertNoWrongfulContainment } from "../guardrails/tool/noWrongfulContainment.js";
import { SyntheticSource } from "../adapters/synthetic.js";
import { evaluateGamingCandidate, type GamingCandidateAssessment } from "../core/risk.js";
import type { DeductionLine } from "../types/entities.js";

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

export interface CrestlineM6ContainmentAssessment extends GamingCandidateAssessment {
  customerId: "CUST-CRESTLINE";
  intentLabel: "gaming";
  contained: false;
  posture: "hitl-risk-review-only";
  actionPosture: "no-external-action-staged";
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

export function assessCrestlineM6Containment(deductionLines?: DeductionLine[]): CrestlineM6ContainmentAssessment {
  const lines = deductionLines ?? new SyntheticSource({ seed: 42 }).loadSettlementRun().deductionLines;
  const gate = evaluateGamingCandidate({
    customerId: "CUST-CRESTLINE",
    deductionLines: lines
  });
  if (!gate.candidate || gate.intentLabel !== "gaming") {
    throw new Error("Crestline M6 containment candidate requires the governed S2/S3/S6 gaming gate basis.");
  }

  const assessment: CrestlineM6ContainmentAssessment = {
    ...gate,
    customerId: "CUST-CRESTLINE",
    intentLabel: "gaming",
    contained: false,
    posture: "hitl-risk-review-only",
    actionPosture: "no-external-action-staged"
  };

  assertIntentEvidence(assessment);
  assertNoWrongfulContainment(assessment);

  return assessment;
}

export function toContainmentDecision(
  assessment: HarborContainmentAssessment | CrestlineM6ContainmentAssessment
): ContainmentDecision {
  return {
    contained: assessment.contained,
    customerId: assessment.customerId
  };
}

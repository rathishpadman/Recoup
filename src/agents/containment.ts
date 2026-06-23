import { createHash } from "node:crypto";
import { assertIntentEvidence } from "../guardrails/tool/intentEvidence.js";
import { assertNoWrongfulContainment } from "../guardrails/tool/noWrongfulContainment.js";
import { assertActionProposalExplainability } from "../guardrails/tool/actionProposal.js";
import type { GamingGate } from "../../config/governed.js";
import { evaluateGamingCandidate, type GamingCandidateAssessment } from "../core/risk.js";
import type { SourcePort, SourceRiskObservationSnapshot } from "../adapters/source.js";
import type { DeductionLine } from "../types/entities.js";

export interface HarborContainmentAssessment {
  customerId: string;
  intentLabel: string;
  contained: false;
  recordIds: string[];
  deterministicBasis: {
    gamingThresholds: "unset";
    noWrongfulContainment: true;
    sourcePort: "SourcePort.loadRiskObservationSnapshot";
  };
}

export interface CrestlineM6ContainmentAssessment extends GamingCandidateAssessment {
  customerId: string;
  intentLabel: "gaming";
  contained: false;
  posture: "hitl-risk-review-only";
  actionPosture: "no-external-action-staged";
}

export interface ContainmentDecision {
  customerId: string;
  contained: boolean;
}

export interface ContainmentReviewAction {
  actionId: string;
  actionType: "containment-review";
  actionPosture: "no-external-action-staged";
  behavioralEvidenceIds: string[];
  basis: string;
  contained: false;
  containsExternalDispatch: false;
  customerId: string;
  deterministicBasis: CrestlineM6ContainmentAssessment["deterministicBasis"] & {
    closureBasis: "deterministic-gaming-gate-basis";
    reviewPosture: "hitl-risk-review-only";
  };
  dispatchedExternally: false;
  handoffTarget: "agent:risk-mesh-supervisor";
  intentLabel: "gaming";
  proposedBy: "agent:containment";
  recordIds: string[];
  requiresHumanApproval: true;
  status: "pending_human";
}

export interface HarborContainmentConfig {
  customerId: string;
  intentLabel: string;
}

export function assessHarborContainment(config: HarborContainmentConfig, source: SourcePort): HarborContainmentAssessment {
  const snapshot = readHarborRiskObservationSnapshot(source, config.customerId);
  const assessment: HarborContainmentAssessment = {
    customerId: config.customerId,
    intentLabel: config.intentLabel,
    contained: false,
    recordIds: [...snapshot.recordIds],
    deterministicBasis: {
      gamingThresholds: "unset",
      noWrongfulContainment: true,
      sourcePort: snapshot.sourceNormalization.sourcePort
    }
  };

  assertIntentEvidence(assessment);
  assertNoWrongfulContainment(assessment);

  return assessment;
}

function readHarborRiskObservationSnapshot(source: SourcePort, customerId: string): SourceRiskObservationSnapshot {
  const snapshot = source.loadRiskObservationSnapshot(customerId);
  if (snapshot === undefined) {
    throw new Error("Harbor Containment requires a cited source risk observation snapshot.");
  }
  if (snapshot.customerId !== customerId) {
    throw new Error("Harbor Containment source snapshot customer mismatch.");
  }
  if (snapshot.recordIds.length === 0 || snapshot.recordIds.some((recordId) => recordId.trim().length === 0)) {
    throw new Error("Harbor Containment source snapshot requires cited recordIds.");
  }

  return snapshot;
}

export interface CrestlineM6ContainmentInput {
  deductionLines: DeductionLine[];
  gamingGate: GamingGate;
}

export function assessCrestlineM6Containment(input: CrestlineM6ContainmentInput): CrestlineM6ContainmentAssessment {
  const gate = selectGamingCandidate(input);
  if (!gate.candidate || gate.intentLabel !== "gaming") {
    throw new Error("Containment review candidate requires the governed gaming gate basis.");
  }

  const assessment: CrestlineM6ContainmentAssessment = {
    ...gate,
    intentLabel: "gaming",
    contained: false,
    posture: "hitl-risk-review-only",
    actionPosture: "no-external-action-staged"
  };

  assertIntentEvidence(assessment);
  assertNoWrongfulContainment(assessment);

  return assessment;
}

export function createCrestlineM6ContainmentReviewAction(
  assessment: CrestlineM6ContainmentAssessment
): ContainmentReviewAction {
  assertIntentEvidence(assessment);
  assertNoWrongfulContainment(assessment);
  const deterministicBasis = {
    ...assessment.deterministicBasis,
    closureBasis: "deterministic-gaming-gate-basis",
    reviewPosture: "hitl-risk-review-only"
  } satisfies ContainmentReviewAction["deterministicBasis"];
  const basis =
    "Repeat invalid shortage and pricing pattern exceeded the governed gaming gate; route Soft -> Hard -> Hold review to Risk Mesh without external dispatch.";

  assertActionProposalExplainability({
    basis,
    deterministicBasis,
    recordIds: assessment.recordIds
  });

  return {
    actionId: containmentReviewActionId(assessment),
    actionType: "containment-review",
    actionPosture: assessment.actionPosture,
    behavioralEvidenceIds: [...assessment.behavioralEvidenceIds],
    basis,
    contained: false,
    containsExternalDispatch: false,
    customerId: assessment.customerId,
    deterministicBasis,
    dispatchedExternally: false,
    handoffTarget: "agent:risk-mesh-supervisor",
    intentLabel: assessment.intentLabel,
    proposedBy: "agent:containment",
    recordIds: [...assessment.recordIds],
    requiresHumanApproval: true,
    status: "pending_human"
  };
}

export function toContainmentDecision(
  assessment: HarborContainmentAssessment | CrestlineM6ContainmentAssessment
): ContainmentDecision {
  return {
    contained: assessment.contained,
    customerId: assessment.customerId
  };
}

function selectGamingCandidate(input: CrestlineM6ContainmentInput): GamingCandidateAssessment {
  const candidates = uniqueStrings(input.deductionLines.map((line) => line.customerId))
    .map((customerId) =>
      evaluateGamingCandidate({
        customerId,
        deductionLines: input.deductionLines,
        gate: input.gamingGate
      })
    )
    .filter((assessment) => assessment.candidate && assessment.intentLabel === "gaming");

  if (candidates.length !== 1) {
    throw new Error("Containment review requires exactly one governed gaming candidate.");
  }

  return candidates[0] as GamingCandidateAssessment;
}

function containmentReviewActionId(assessment: CrestlineM6ContainmentAssessment): string {
  return `containment-review:${assessment.customerId}:${shortEvidenceHash(assessment.recordIds)}`;
}

function shortEvidenceHash(recordIds: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([...recordIds].sort())).digest("hex").slice(0, 12);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

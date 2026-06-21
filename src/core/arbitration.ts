import { arbitrationPnlWeights } from "../../config/weights.js";

export type ArbitrationFunction = "billing" | "collections" | "credit" | "fulfillment";

export interface ArbitrationPosition {
  functionName: ArbitrationFunction;
  optionId: string;
  position: string;
  recordIds: string[];
}

export interface ArbitrateRiskMeshInput {
  caseId: string;
  positions: ArbitrationPosition[];
  weights: typeof arbitrationPnlWeights;
}

export interface BlockedArbitrationResult {
  caseId: string;
  status: "blocked";
  reason: "verify-prod-calibration-required";
  recordIds: string[];
  deterministicBasis: {
    positionCount: number;
    weightSource: typeof arbitrationPnlWeights;
  };
}

export function arbitrateRiskMesh(input: ArbitrateRiskMeshInput): BlockedArbitrationResult {
  return {
    caseId: input.caseId,
    status: "blocked",
    reason: "verify-prod-calibration-required",
    recordIds: unique(input.positions.flatMap((position) => position.recordIds)),
    deterministicBasis: {
      positionCount: input.positions.length,
      weightSource: input.weights
    }
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

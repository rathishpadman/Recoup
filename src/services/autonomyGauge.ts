export interface AutonomyGauge {
  mode: "supervised";
  externalActions: "human-approval-required";
  gates: Array<{
    gate: string;
    status: "blocked" | "guarded";
    basis: string;
  }>;
}

export function buildAutonomyGauge(): AutonomyGauge {
  return {
    mode: "supervised",
    externalActions: "human-approval-required",
    gates: [
      {
        gate: "deduction-validity",
        status: "guarded",
        basis: "release-blocking verify gate"
      },
      {
        gate: "intent-precision",
        status: "blocked",
        basis: "complete intent labels unavailable"
      },
      {
        gate: "arbitration-agreement",
        status: "blocked",
        basis: "arbitration expert labels unavailable"
      }
    ]
  };
}

export interface RunControlStatus {
  status: "blocked";
  reason: "appendix-g-run-control-unset";
  openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"];
}

export interface ToolFailureInput {
  phase: string;
  toolName: string;
  error: unknown;
}

export interface ErrorEvent {
  eventType: "ErrorEvent";
  phase: string;
  toolName: string;
  message: string;
  recoverable: true;
}

export function buildRunControlStatus(): RunControlStatus {
  return {
    status: "blocked",
    reason: "appendix-g-run-control-unset",
    openDependencies: ["run-control-token-budget", "run-control-step-budget", "run-control-retry-cap"]
  };
}

export function toErrorEvent(input: ToolFailureInput): ErrorEvent {
  return {
    eventType: "ErrorEvent",
    phase: input.phase,
    toolName: input.toolName,
    message: input.error instanceof Error ? input.error.message : "Unknown tool failure",
    recoverable: true
  };
}

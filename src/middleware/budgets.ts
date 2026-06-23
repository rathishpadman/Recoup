import { buildRunControlStatus, type RunControlConfig, type RunControlStatus } from "../services/conductor.js";

export function buildRunBudgetMiddlewareStatus(config?: RunControlConfig): RunControlStatus {
  return buildRunControlStatus(config);
}

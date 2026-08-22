import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";

/**
 * Workflow worker lifecycle seam - Phase 7A only.
 *
 * This module contains no claim-capable path. Phase 7A exists to prove the two
 * N5 negative cases before any code can claim, lease or mutate:
 *
 *   1. A missing or false RECOUP_CASH_WORKER_ENABLED prevents the factory from
 *      constructing anything at all, so there is nothing that could claim.
 *   2. With the flag true, a missing or invalid cash_run_control returns before
 *      the claim RPC, leaving attempt and dead-letter state byte-equivalent.
 *
 * Phase 7B adds bounded claim and lease processing behind both proven gates.
 * Adding it here would defeat the point of the split.
 */

export const WORKER_ENABLED_FLAG = "RECOUP_CASH_WORKER_ENABLED";

export type WorkerStartRefusal =
  | "worker_disabled"
  | "cash_run_control_missing"
  | "cash_run_control_invalid";

export interface CashRunControl {
  enabled: boolean;
  maxAttempts: number;
  maxWaitSeconds: number;
}

export interface WorkerLifecycleHandle {
  readonly running: boolean;
  stop(): void;
}

export type WorkerStartResult =
  | { status: "started"; handle: WorkerLifecycleHandle }
  | { status: "refused"; reason: WorkerStartRefusal };

export interface WorkflowWorkerDependencies {
  env: RuntimeEnv;
  /**
   * Reads the approved cash_run_control row. D-13 owns its values, so it is
   * supplied rather than read from anywhere inside this module.
   */
  loadCashRunControl: () => CashRunControl | undefined;
  /**
   * Present only so a test can assert it is never called on either negative
   * path. Phase 7A has no reason to invoke it.
   */
  claimDueCommands?: () => Promise<unknown>;
}

function isWorkerEnabled(env: RuntimeEnv): boolean {
  return env[WORKER_ENABLED_FLAG]?.trim().toLowerCase() === "true";
}

function isValidRunControl(control: CashRunControl): boolean {
  return (
    Number.isInteger(control.maxAttempts) &&
    control.maxAttempts > 0 &&
    Number.isInteger(control.maxWaitSeconds) &&
    control.maxWaitSeconds > 0
  );
}

/**
 * Constructs the worker, or refuses.
 *
 * Both refusal paths return before anything is constructed and before the claim
 * dependency is touched, so a refused start cannot leave a lease, an attempt
 * increment or a dead-letter row behind.
 */
export function createWorkflowWorker(
  dependencies: WorkflowWorkerDependencies
): WorkerStartResult {
  // Negative case 1: no flag, no construction. Nothing exists that could claim.
  if (!isWorkerEnabled(dependencies.env)) {
    return { status: "refused", reason: "worker_disabled" };
  }

  // Negative case 2: the flag alone is not enough. Configuration is read and
  // validated before the claim RPC, never after.
  const control = dependencies.loadCashRunControl();

  if (control === undefined) {
    return { status: "refused", reason: "cash_run_control_missing" };
  }

  if (!control.enabled || !isValidRunControl(control)) {
    return { status: "refused", reason: "cash_run_control_invalid" };
  }

  let running = true;

  return {
    status: "started",
    handle: {
      get running() {
        return running;
      },
      stop() {
        running = false;
      }
    }
  };
}

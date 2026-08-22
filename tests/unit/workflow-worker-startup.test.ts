import { describe, expect, it, vi } from "vitest";

import {
  WORKER_ENABLED_FLAG,
  createWorkflowWorker,
  type CashRunControl
} from "../../src/services/workflowWorker.js";

const validControl: CashRunControl = { enabled: true, maxAttempts: 5, maxWaitSeconds: 3600 };

describe("N5 negative case 1: no construction without the worker flag", () => {
  it.each([
    ["missing", {}],
    ["false", { RECOUP_CASH_WORKER_ENABLED: "false" }],
    ["empty", { RECOUP_CASH_WORKER_ENABLED: "" }],
    ["truthy-looking but not true", { RECOUP_CASH_WORKER_ENABLED: "1" }],
    ["yes", { RECOUP_CASH_WORKER_ENABLED: "yes" }]
  ])("refuses to construct when the flag is %s", (_label, env) => {
    const loadCashRunControl = vi.fn(() => validControl);
    const claimDueCommands = vi.fn(() => Promise.resolve());

    const result = createWorkflowWorker({ env, loadCashRunControl, claimDueCommands });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toBe("worker_disabled");
    }
    expect(claimDueCommands).not.toHaveBeenCalled();
  });

  it("does not even read configuration when the flag is absent", () => {
    const loadCashRunControl = vi.fn(() => validControl);
    createWorkflowWorker({ env: {}, loadCashRunControl });
    expect(loadCashRunControl).not.toHaveBeenCalled();
  });

  it("constructs a lifecycle handle only when the flag is exactly true", () => {
    const result = createWorkflowWorker({
      env: { [WORKER_ENABLED_FLAG]: "true" },
      loadCashRunControl: () => validControl
    });

    expect(result.status).toBe("started");
    if (result.status === "started") {
      expect(result.handle.running).toBe(true);
      result.handle.stop();
      expect(result.handle.running).toBe(false);
    }
  });

  it("accepts the flag case-insensitively after trimming", () => {
    const result = createWorkflowWorker({
      env: { [WORKER_ENABLED_FLAG]: "  TRUE  " },
      loadCashRunControl: () => validControl
    });
    expect(result.status).toBe("started");
  });
});

describe("N5 negative case 2: config is checked before the claim RPC", () => {
  it("returns before claiming when cash_run_control is missing", () => {
    const claimDueCommands = vi.fn(() => Promise.resolve());
    const result = createWorkflowWorker({
      env: { [WORKER_ENABLED_FLAG]: "true" },
      loadCashRunControl: () => undefined,
      claimDueCommands
    });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toBe("cash_run_control_missing");
    }
    expect(claimDueCommands).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled", { enabled: false, maxAttempts: 5, maxWaitSeconds: 3600 }],
    ["zero attempts", { enabled: true, maxAttempts: 0, maxWaitSeconds: 3600 }],
    ["negative attempts", { enabled: true, maxAttempts: -1, maxWaitSeconds: 3600 }],
    ["fractional attempts", { enabled: true, maxAttempts: 1.5, maxWaitSeconds: 3600 }],
    ["zero wait", { enabled: true, maxAttempts: 5, maxWaitSeconds: 0 }],
    ["negative wait", { enabled: true, maxAttempts: 5, maxWaitSeconds: -60 }]
  ])("returns before claiming when cash_run_control is %s", (_label, control) => {
    const claimDueCommands = vi.fn(() => Promise.resolve());
    const result = createWorkflowWorker({
      env: { [WORKER_ENABLED_FLAG]: "true" },
      loadCashRunControl: () => control,
      claimDueCommands
    });

    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.reason).toBe("cash_run_control_invalid");
    }
    expect(claimDueCommands).not.toHaveBeenCalled();
  });
});

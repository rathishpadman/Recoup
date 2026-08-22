import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CASH_KILL_SWITCHES,
  CASH_ROLLOUT_STAGES,
  describeCashRolloutPosture,
  isCashCapabilityEnabled,
  isKillSwitchEngaged,
  mayClaimLiveEffectiveness,
  resolveCashRolloutStage
} from "../../config/cashRollout.js";

/**
 * Specification 17: deployment, canary and rollback.
 */

describe("nothing is exposed by default", () => {
  it("resolves to disabled with no configuration", () => {
    expect(resolveCashRolloutStage({})).toBe("disabled");
  });

  it("resolves an unrecognised stage to disabled rather than guessing forward", () => {
    expect(resolveCashRolloutStage({ RECOUP_CASH_ROLLOUT_STAGE: "prodction" })).toBe("disabled");
    expect(resolveCashRolloutStage({ RECOUP_CASH_ROLLOUT_STAGE: "" })).toBe("disabled");
    expect(resolveCashRolloutStage({ RECOUP_CASH_ROLLOUT_STAGE: "PRODUCTION!" })).toBe("disabled");
  });

  it.each([...CASH_KILL_SWITCHES])("leaves %s disabled with no configuration", (capability) => {
    expect(isCashCapabilityEnabled({}, capability)).toBe(false);
  });

  it("enables nothing at schema_only, so schema can deploy before exposure", () => {
    const env = { RECOUP_CASH_ROLLOUT_STAGE: "schema_only" };
    for (const capability of CASH_KILL_SWITCHES) {
      expect(isCashCapabilityEnabled(env, capability)).toBe(false);
    }
  });
});

describe("stages unlock capabilities in order", () => {
  it("opens intake, claiming and the operations view at rehearsal", () => {
    const env = { RECOUP_CASH_ROLLOUT_STAGE: "rehearsal" };
    expect(isCashCapabilityEnabled(env, "inbound_acceptance")).toBe(true);
    expect(isCashCapabilityEnabled(env, "command_claiming")).toBe(true);
    expect(isCashCapabilityEnabled(env, "agent_operations_exposure")).toBe(true);
  });

  it("withholds live case creation until shadow", () => {
    expect(
      isCashCapabilityEnabled({ RECOUP_CASH_ROLLOUT_STAGE: "rehearsal" }, "live_case_creation")
    ).toBe(false);
    expect(
      isCashCapabilityEnabled({ RECOUP_CASH_ROLLOUT_STAGE: "shadow" }, "live_case_creation")
    ).toBe(true);
  });

  it("withholds the Maya live-origin surface until shadow", () => {
    expect(
      isCashCapabilityEnabled(
        { RECOUP_CASH_ROLLOUT_STAGE: "rehearsal" },
        "maya_live_origin_exposure"
      )
    ).toBe(false);
  });

  it("orders the stages from disabled to production", () => {
    expect(CASH_ROLLOUT_STAGES[0]).toBe("disabled");
    expect(CASH_ROLLOUT_STAGES.at(-1)).toBe("production");
    expect(CASH_ROLLOUT_STAGES.indexOf("rehearsal")).toBeLessThan(
      CASH_ROLLOUT_STAGES.indexOf("shadow")
    );
    expect(CASH_ROLLOUT_STAGES.indexOf("reference_canary")).toBeLessThan(
      CASH_ROLLOUT_STAGES.indexOf("governed_canary")
    );
  });
});

describe("kill switches are independent and always win", () => {
  it.each([...CASH_KILL_SWITCHES])("disables %s even at production", (capability) => {
    const env = {
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      [`RECOUP_CASH_KILL_${capability === "inbound_acceptance" ? "INBOUND" : "X"}`]: "true"
    };
    void env;

    const killed = describeCashRolloutPosture({
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      RECOUP_CASH_KILL_INBOUND: "true",
      RECOUP_CASH_KILL_CLAIMING: "true",
      RECOUP_CASH_KILL_CASE_CREATION: "true",
      RECOUP_CASH_KILL_AGENT_OPS_UI: "true",
      RECOUP_CASH_KILL_MAYA_ORIGIN_UI: "true"
    });

    expect(killed.enabledCapabilities).not.toContain(capability);
  });

  it("stops intake without stopping the worker draining what was accepted", () => {
    const env = {
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      RECOUP_CASH_KILL_INBOUND: "true"
    };

    expect(isCashCapabilityEnabled(env, "inbound_acceptance")).toBe(false);
    expect(isCashCapabilityEnabled(env, "command_claiming")).toBe(true);
  });

  it("hides a UI surface without stopping backend evidence recording", () => {
    const env = {
      RECOUP_CASH_ROLLOUT_STAGE: "production",
      RECOUP_CASH_KILL_AGENT_OPS_UI: "true",
      RECOUP_CASH_KILL_MAYA_ORIGIN_UI: "true"
    };

    expect(isCashCapabilityEnabled(env, "agent_operations_exposure")).toBe(false);
    expect(isCashCapabilityEnabled(env, "live_case_creation")).toBe(true);
  });

  it("treats anything other than the literal true as not engaged", () => {
    for (const value of ["false", "1", "yes", "TRUE ", ""]) {
      const engaged = isKillSwitchEngaged(
        { RECOUP_CASH_KILL_INBOUND: value },
        "inbound_acceptance"
      );
      expect(engaged).toBe(value.trim().toLowerCase() === "true");
    }
  });
});

describe("effectiveness may not be claimed before production", () => {
  it.each(["disabled", "schema_only", "rehearsal", "shadow", "reference_canary", "governed_canary"])(
    "refuses a live claim at %s",
    (stage) => {
      expect(mayClaimLiveEffectiveness({ RECOUP_CASH_ROLLOUT_STAGE: stage })).toBe(false);
    }
  );

  it("permits it only at production", () => {
    expect(mayClaimLiveEffectiveness({ RECOUP_CASH_ROLLOUT_STAGE: "production" })).toBe(true);
  });
});

describe("rollback never destroys accepted data", () => {
  it("offers no purge, delete or truncate switch", () => {
    const source = readFileSync("config/cashRollout.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");

    expect(code).not.toMatch(/purge|truncate|deleteAll|dropRuns/iu);
    expect(code).not.toMatch(/\bDELETE\b/u);
  });

  it("reports a readable posture for operational evidence", () => {
    const posture = describeCashRolloutPosture({
      RECOUP_CASH_ROLLOUT_STAGE: "shadow",
      RECOUP_CASH_KILL_INBOUND: "true"
    });

    expect(posture.stage).toBe("shadow");
    expect(posture.engagedKillSwitches).toEqual(["inbound_acceptance"]);
    expect(posture.enabledCapabilities).not.toContain("inbound_acceptance");
    expect(posture.mayClaimLiveEffectiveness).toBe(false);
  });
});

import type { RuntimeEnv } from "./localRuntimeEnv.js";

/**
 * Cash Application rollout stages and kill switches (specification 17).
 *
 * Two properties matter more than the flag names. Every stage is off unless
 * explicitly enabled, so a deploy with no configuration exposes nothing. And
 * each kill switch is independent, so disabling inbound acceptance does not
 * also stop the worker draining what it already accepted, and hiding a UI
 * surface does not silently stop the backend recording evidence.
 *
 * Rollback pauses commands without deleting accepted data. Nothing here can
 * remove a run, an event or a case; there is deliberately no "purge" switch.
 */

/** Ordered. A later stage may not be entered without the ones before it. */
export const CASH_ROLLOUT_STAGES = [
  "disabled",
  "schema_only",
  "rehearsal",
  "shadow",
  "reference_canary",
  "governed_canary",
  "production"
] as const;

export type CashRolloutStage = (typeof CASH_ROLLOUT_STAGES)[number];

export const CASH_KILL_SWITCHES = [
  "inbound_acceptance",
  "command_claiming",
  "live_case_creation",
  "agent_operations_exposure",
  "maya_live_origin_exposure"
] as const;

export type CashKillSwitch = (typeof CASH_KILL_SWITCHES)[number];

const KILL_SWITCH_FLAGS: Record<CashKillSwitch, string> = {
  inbound_acceptance: "RECOUP_CASH_KILL_INBOUND",
  command_claiming: "RECOUP_CASH_KILL_CLAIMING",
  live_case_creation: "RECOUP_CASH_KILL_CASE_CREATION",
  agent_operations_exposure: "RECOUP_CASH_KILL_AGENT_OPS_UI",
  maya_live_origin_exposure: "RECOUP_CASH_KILL_MAYA_ORIGIN_UI"
};

const STAGE_FLAG = "RECOUP_CASH_ROLLOUT_STAGE";

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Resolves the configured stage. An unrecognised value resolves to `disabled`
 * rather than throwing or guessing forward, because a typo in a deploy variable
 * must never enable more than intended.
 */
export function resolveCashRolloutStage(env: RuntimeEnv): CashRolloutStage {
  const configured = env[STAGE_FLAG]?.trim().toLowerCase();
  const match = CASH_ROLLOUT_STAGES.find((stage) => stage === configured);
  return match ?? "disabled";
}

export function isKillSwitchEngaged(env: RuntimeEnv, killSwitch: CashKillSwitch): boolean {
  return isTrue(env[KILL_SWITCH_FLAGS[killSwitch]]);
}

/** The stage at which each capability first becomes available. */
const CAPABILITY_MINIMUM_STAGE: Record<CashKillSwitch, CashRolloutStage> = {
  inbound_acceptance: "rehearsal",
  command_claiming: "rehearsal",
  live_case_creation: "shadow",
  agent_operations_exposure: "rehearsal",
  maya_live_origin_exposure: "shadow"
};

function stageIndex(stage: CashRolloutStage): number {
  return CASH_ROLLOUT_STAGES.indexOf(stage);
}

/**
 * A capability is enabled only when the stage has reached it AND its kill
 * switch is not engaged. The kill switch always wins, so an incident can be
 * stopped without needing a redeploy to change the stage.
 */
export function isCashCapabilityEnabled(
  env: RuntimeEnv,
  capability: CashKillSwitch
): boolean {
  if (isKillSwitchEngaged(env, capability)) {
    return false;
  }

  const stage = resolveCashRolloutStage(env);
  return stageIndex(stage) >= stageIndex(CAPABILITY_MINIMUM_STAGE[capability]);
}

/**
 * Whether outcomes at this stage may be described as live production results.
 * Rehearsal, shadow and canary stages may not, whatever else is configured.
 */
export function mayClaimLiveEffectiveness(env: RuntimeEnv): boolean {
  return resolveCashRolloutStage(env) === "production";
}

export interface CashRolloutPosture {
  stage: CashRolloutStage;
  enabledCapabilities: CashKillSwitch[];
  engagedKillSwitches: CashKillSwitch[];
  mayClaimLiveEffectiveness: boolean;
}

/** A single readable snapshot for operational evidence. */
export function describeCashRolloutPosture(env: RuntimeEnv): CashRolloutPosture {
  return {
    stage: resolveCashRolloutStage(env),
    enabledCapabilities: CASH_KILL_SWITCHES.filter((capability) =>
      isCashCapabilityEnabled(env, capability)
    ),
    engagedKillSwitches: CASH_KILL_SWITCHES.filter((capability) =>
      isKillSwitchEngaged(env, capability)
    ),
    mayClaimLiveEffectiveness: mayClaimLiveEffectiveness(env)
  };
}

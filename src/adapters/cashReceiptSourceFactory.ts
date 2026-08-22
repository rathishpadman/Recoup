import {
  resolveCashRolloutStage,
  type CashRolloutStage
} from "../../config/cashRollout.js";
import type { RuntimeEnv } from "../../config/localRuntimeEnv.js";
import type { CashReceiptSource } from "./cashReceipt.js";
import { createRehearsalCashReceiptSource } from "./rehearsalCashReceipt.js";
import {
  createSapCashReceiptSource,
  type SapCashReceiptMapping
} from "./sapCashReceipt.js";

/**
 * Chooses the CashReceipt source for the configured rollout stage.
 *
 * Under the deferred-live-slice election the rehearsal proxy is the only
 * source available, and it is confined to the pre-production stages. From
 * `reference_canary` onward an authoritative source is required, so the factory
 * refuses to hand back the rehearsal proxy rather than letting a stage bump
 * silently promote demo fixtures into something that looks live.
 *
 * That refusal is the point of this module. Everything else here is wiring.
 */

export type CashReceiptSourceKind = "sap" | "rehearsal" | "none";

export interface ResolvedCashReceiptSource {
  source: CashReceiptSource | undefined;
  kind: CashReceiptSourceKind;
  stage: CashRolloutStage;
  /** True only when the source can evidence settled funds. */
  authoritative: boolean;
  reason?: string;
}

const REHEARSAL_PERMITTED_STAGES: readonly CashRolloutStage[] = [
  "rehearsal",
  "shadow"
];

export interface ResolveCashReceiptSourceOptions {
  env: RuntimeEnv;
  /** Supplied only once D-02 names the approved entity and properties. */
  sapMapping?: SapCashReceiptMapping;
}

export function resolveCashReceiptSource(
  options: ResolveCashReceiptSourceOptions
): ResolvedCashReceiptSource {
  const { env, sapMapping } = options;
  const stage = resolveCashRolloutStage(env);

  // An approved SAP mapping always wins: it is the only authoritative source.
  if (sapMapping !== undefined) {
    return {
      source: createSapCashReceiptSource({ env, mapping: sapMapping }),
      kind: "sap",
      stage,
      authoritative: true
    };
  }

  if (REHEARSAL_PERMITTED_STAGES.includes(stage)) {
    return {
      source: createRehearsalCashReceiptSource({ env }),
      kind: "rehearsal",
      stage,
      authoritative: false,
      reason: "rehearsal proxy: cannot evidence settled funds, AC-01 remains blocked"
    };
  }

  // Below rehearsal there is nothing to run; at canary and beyond the rehearsal
  // proxy must not stand in for an authoritative source.
  return {
    source: undefined,
    kind: "none",
    stage,
    authoritative: false,
    reason:
      stage === "disabled" || stage === "schema_only"
        ? `no cash receipt source at stage ${stage}`
        : `stage ${stage} requires an authoritative source; D-02 is unratified`
  };
}

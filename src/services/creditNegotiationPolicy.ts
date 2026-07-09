import { Decimal } from "decimal.js";
import { sha256CanonicalJson } from "../../config/governed.js";

export const creditNegotiationPolicyKeys = [
  "min_deposit_pct",
  "max_deposit_pct",
  "max_tranches",
  "max_collateral_ratio",
  "max_financing_spread_bps",
  "min_release_pct",
  "max_release_pct",
  "default_prob_by_verdict_clear",
  "default_prob_by_verdict_watch",
  "default_prob_by_verdict_elevated",
  "default_prob_by_verdict_high"
] as const;

export type CreditNegotiationPolicyKey = (typeof creditNegotiationPolicyKeys)[number];
export type CreditNegotiationVerdict = "CLEAR" | "ELEVATED" | "HIGH" | "WATCH";

export interface CreditNegotiationPolicyValues {
  default_prob_by_verdict_clear: Decimal;
  default_prob_by_verdict_elevated: Decimal;
  default_prob_by_verdict_high: Decimal;
  default_prob_by_verdict_watch: Decimal;
  max_collateral_ratio: Decimal;
  max_deposit_pct: Decimal;
  max_financing_spread_bps: Decimal;
  max_release_pct: Decimal;
  max_tranches: number;
  min_deposit_pct: Decimal;
  min_release_pct: Decimal;
}

export interface CreditNegotiationPolicyRow {
  active: boolean;
  approvedBy: string;
  effectiveFrom: string;
  key: string;
  policyVersion: number;
  recordId: string;
  valueText: string;
}

export interface CreditNegotiationPolicySnapshot {
  canonicalValueText: Readonly<Record<CreditNegotiationPolicyKey, string>>;
  policyHash: string;
  policyVersion: 1;
  rowHashes: Readonly<Record<CreditNegotiationPolicyKey, string>>;
  sourceRecordIds: readonly string[];
  values: Readonly<CreditNegotiationPolicyValues>;
}

export interface CreditNegotiationPolicyRationaleResult {
  content: string;
  policyHash: string;
  policyKey: string;
  policyVersion: number;
  recordId: string;
  source: string;
  valueText?: string | undefined;
}

export interface CreditNegotiationPolicyRationaleResolution {
  citations: string[];
  conflict: boolean;
  message: "Policy rationale available." | "Policy rationale conflict" | "Policy rationale unavailable.";
  status: "available" | "human_review_required" | "unavailable";
}

const policyVersion = 1;
const policyEffectiveFrom = "2026-07-09T00:00:00.000Z";
const ownerApprovedBy = "human:owner-accepted-2026-07-09" as const;
const one = new Decimal(1);

const policyKeySet = new Set<string>(creditNegotiationPolicyKeys);
const probabilityKeys = new Set<CreditNegotiationPolicyKey>([
  "default_prob_by_verdict_clear",
  "default_prob_by_verdict_elevated",
  "default_prob_by_verdict_high",
  "default_prob_by_verdict_watch"
]);

export const creditNegotiationPolicyCandidateRows = deepFreeze(
  buildCandidateRows({
    default_prob_by_verdict_clear: "0.005",
    default_prob_by_verdict_elevated: "0.050",
    default_prob_by_verdict_high: "0.120",
    default_prob_by_verdict_watch: "0.015",
    max_collateral_ratio: "1.25",
    max_deposit_pct: "60",
    max_financing_spread_bps: "600",
    max_release_pct: "85",
    max_tranches: "3",
    min_deposit_pct: "0",
    min_release_pct: "10"
  })
);

export function parseActiveCreditNegotiationPolicyRows(
  rows: readonly CreditNegotiationPolicyRow[]
): CreditNegotiationPolicySnapshot {
  const activeRows = rows.filter((row) => row.active);
  const rowsByKey = new Map<CreditNegotiationPolicyKey, CreditNegotiationPolicyRow>();

  for (const row of activeRows) {
    const key = assertPolicyRow(row);
    if (rowsByKey.has(key)) {
      throw new Error(`Credit negotiation policy rows include a duplicate key: ${key}.`);
    }
    rowsByKey.set(key, row);
  }

  const missingKeys = creditNegotiationPolicyKeys.filter((key) => !rowsByKey.has(key));
  if (missingKeys.length > 0) {
    throw new Error(`Credit negotiation policy rows are missing keys: ${missingKeys.join(", ")}.`);
  }

  const canonicalValueText = Object.fromEntries(
    creditNegotiationPolicyKeys.map((key) => [key, normalizePolicyValueText(key, rowForKey(rowsByKey, key).valueText)])
  ) as Record<CreditNegotiationPolicyKey, string>;
  const policyHash = sha256CanonicalJson({ policyVersion, values: canonicalValueText });
  const rowHashes = Object.fromEntries(
    creditNegotiationPolicyKeys.map((key) => [
      key,
      sha256CanonicalJson({
        key,
        policyVersion,
        valueText: canonicalValueText[key]
      })
    ])
  ) as Record<CreditNegotiationPolicyKey, string>;

  return deepFreeze({
    canonicalValueText,
    policyHash,
    policyVersion,
    rowHashes,
    sourceRecordIds: creditNegotiationPolicyKeys.map((key) => rowForKey(rowsByKey, key).recordId),
    values: {
      default_prob_by_verdict_clear: decimal(canonicalValueText.default_prob_by_verdict_clear),
      default_prob_by_verdict_elevated: decimal(canonicalValueText.default_prob_by_verdict_elevated),
      default_prob_by_verdict_high: decimal(canonicalValueText.default_prob_by_verdict_high),
      default_prob_by_verdict_watch: decimal(canonicalValueText.default_prob_by_verdict_watch),
      max_collateral_ratio: decimal(canonicalValueText.max_collateral_ratio),
      max_deposit_pct: decimal(canonicalValueText.max_deposit_pct),
      max_financing_spread_bps: decimal(canonicalValueText.max_financing_spread_bps),
      max_release_pct: decimal(canonicalValueText.max_release_pct),
      max_tranches: Number(canonicalValueText.max_tranches),
      min_deposit_pct: decimal(canonicalValueText.min_deposit_pct),
      min_release_pct: decimal(canonicalValueText.min_release_pct)
    }
  });
}

export function annualDefaultProbabilityForHorizon(
  policy: CreditNegotiationPolicySnapshot,
  verdict: CreditNegotiationVerdict,
  horizonDays: number
): Decimal {
  if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
    throw new Error("Credit negotiation horizonDays must be a positive integer.");
  }

  const annualProbability = annualProbabilityForVerdict(policy, verdict);
  return one.minus(one.minus(annualProbability).pow(new Decimal(horizonDays).div(365)));
}

export function resolveCreditNegotiationPolicyRationale(
  policy: CreditNegotiationPolicySnapshot,
  results: readonly CreditNegotiationPolicyRationaleResult[]
): CreditNegotiationPolicyRationaleResolution {
  const citations = dedupe(results.map((result) => result.recordId));
  if (results.length === 0) {
    return {
      citations,
      conflict: false,
      message: "Policy rationale unavailable.",
      status: "unavailable"
    };
  }

  const hasConflict = results.some((result) => rationaleConflictsWithPolicy(policy, result));
  if (hasConflict) {
    return {
      citations,
      conflict: true,
      message: "Policy rationale conflict",
      status: "human_review_required"
    };
  }

  return {
    citations,
    conflict: false,
    message: "Policy rationale available.",
    status: "available"
  };
}

function buildCandidateRows(values: Record<CreditNegotiationPolicyKey, string>): readonly CreditNegotiationPolicyRow[] {
  return creditNegotiationPolicyKeys.map((key) => ({
    active: true,
    approvedBy: ownerApprovedBy,
    effectiveFrom: policyEffectiveFrom,
    key,
    policyVersion,
    recordId: `credit_negotiation_policy:${key}:v1`,
    valueText: values[key]
  }));
}

function assertPolicyRow(row: CreditNegotiationPolicyRow): CreditNegotiationPolicyKey {
  const key = parsePolicyKey(row.key);
  if (key === undefined) {
    throw new Error(`Credit negotiation policy row has unknown key: ${row.key}.`);
  }
  if (row.policyVersion !== policyVersion) {
    throw new Error(`Credit negotiation policy row ${key} has unsupported version ${String(row.policyVersion)}.`);
  }
  if (!row.approvedBy.startsWith("human:")) {
    throw new Error(`Credit negotiation policy row ${key} is not human approved.`);
  }
  if (!Number.isFinite(Date.parse(row.effectiveFrom))) {
    throw new Error(`Credit negotiation policy row ${key} has invalid effectiveFrom.`);
  }
  normalizePolicyValueText(key, row.valueText);
  return key;
}

function normalizePolicyValueText(key: CreditNegotiationPolicyKey, valueText: string): string {
  const value = decimal(valueText);
  if (key === "max_tranches") {
    if (!value.isInteger() || value.lessThan(1)) {
      throw new Error("Credit negotiation policy max_tranches must be a positive integer.");
    }
    return value.toFixed(0);
  }
  if (percentageKey(key) && (value.lessThan(0) || value.greaterThan(100))) {
    throw new Error(`Credit negotiation policy ${key} must be from 0 to 100.`);
  }
  if (probabilityKeys.has(key) && (value.lessThan(0) || value.greaterThan(1))) {
    throw new Error(`Credit negotiation policy ${key} must be from 0 to 1.`);
  }
  if (key === "max_collateral_ratio" && value.lessThan(0)) {
    throw new Error("Credit negotiation policy max_collateral_ratio must be non-negative.");
  }
  if (key === "max_financing_spread_bps" && value.lessThan(0)) {
    throw new Error("Credit negotiation policy max_financing_spread_bps must be non-negative.");
  }
  return value.toString();
}

function percentageKey(key: CreditNegotiationPolicyKey): boolean {
  return key === "min_deposit_pct" || key === "max_deposit_pct" || key === "min_release_pct" || key === "max_release_pct";
}

function rowForKey(
  rowsByKey: ReadonlyMap<CreditNegotiationPolicyKey, CreditNegotiationPolicyRow>,
  key: CreditNegotiationPolicyKey
): CreditNegotiationPolicyRow {
  const row = rowsByKey.get(key);
  if (row === undefined) {
    throw new Error(`Credit negotiation policy rows are missing key: ${key}.`);
  }
  return row;
}

function annualProbabilityForVerdict(policy: CreditNegotiationPolicySnapshot, verdict: CreditNegotiationVerdict): Decimal {
  switch (verdict) {
    case "CLEAR":
      return policy.values.default_prob_by_verdict_clear;
    case "WATCH":
      return policy.values.default_prob_by_verdict_watch;
    case "ELEVATED":
      return policy.values.default_prob_by_verdict_elevated;
    case "HIGH":
      return policy.values.default_prob_by_verdict_high;
  }
}

function rationaleConflictsWithPolicy(
  policy: CreditNegotiationPolicySnapshot,
  result: CreditNegotiationPolicyRationaleResult
): boolean {
  if (result.source !== "vector-policy-rationale") {
    return true;
  }
  if (result.policyVersion !== policy.policyVersion || result.policyHash !== policy.policyHash) {
    return true;
  }
  const policyKey = parsePolicyKey(result.policyKey);
  if (policyKey === undefined) {
    return true;
  }
  if (result.valueText === undefined) {
    return false;
  }
  return normalizePolicyValueText(policyKey, result.valueText) !== policy.canonicalValueText[policyKey];
}

function parsePolicyKey(key: string): CreditNegotiationPolicyKey | undefined {
  return policyKeySet.has(key) ? (key as CreditNegotiationPolicyKey) : undefined;
}

function decimal(value: string): Decimal {
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) {
    throw new Error("Credit negotiation policy values must be finite decimals.");
  }
  return parsed;
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }

  return value;
}

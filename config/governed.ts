import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { decisionEvalBars, partialHoldThresholds, seed } from "./thresholds.js";

const hashPattern = /^[a-f0-9]{64}$/u;
const sumTolerance = 0.000000001;
const governedConfigKeys = [
  "arbitration_weights",
  "r_score_weights",
  "r_drift",
  "gaming_gate",
  "partial_hold",
  "accuracy_bars",
  "seed"
] as const;

// Bootstrap seed metadata for owner-ratified Day-1 config rows; runtime approvals use the HITL approval service.
export const day1BootstrapSeedApprovedBy = "human:owner-ratified-day-1" as const;
const effectiveFrom = "2026-06-20T00:00:00.000Z";

export const day1PartialHoldWeights = deepFreeze({
  orderValueVsExposure: 0.2,
  customerStrategicValue: 0.15,
  dsoPaymentDrift: 0.2,
  orderMargin: 0.15,
  revenueForecast: 0.15,
  paymentPattern: 0.15
} as const);

export const GovernedConfigKeySchema = z.enum(governedConfigKeys);
export type GovernedConfigKey = z.infer<typeof GovernedConfigKeySchema>;

export const ArbitrationPnlWeightsSchema = z
  .object({
    billing: weightBand(0.15, 0.1, 0.05),
    collections: weightBand(0.25, 0.1, 0.15),
    credit: weightBand(0.35, 0.1, 0.2),
    fulfillment: weightBand(0.25, 0.1, 0.1)
  })
  .strict()
  .superRefine(requireSumToOne("arbitration P&L weights"));
export type ArbitrationPnlWeights = z.infer<typeof ArbitrationPnlWeightsSchema>;

export const RScoreWeightsSchema = z
  .object({
    agingConcentration: weightBand(0.2, 0.1, 0.1),
    disputeRate: weightBand(0.25, 0.1, 0.1),
    dsoAdp: weightBand(0.35, 0.1, 0.1),
    overLimitFrequency: weightBand(0.2, 0.1, 0.1)
  })
  .strict()
  .superRefine(requireSumToOne("R-score weights"));
export type RScoreWeights = z.infer<typeof RScoreWeightsSchema>;

export const RDriftTriggerSchema = z
  .object({
    cooldownDays: z.number().int().min(30),
    disputeRateRelativeIncrease: z.number().finite().min(0.5),
    dsoIncreaseDays: z.number().int().min(10),
    riskTierDowngrade: z.number().int().min(1)
  })
  .strict();
export type RDriftTrigger = z.infer<typeof RDriftTriggerSchema>;

export const GamingGateSchema = z
  .object({
    invalidLineCount: z.number().int().min(2),
    invalidValueFloor: z
      .string()
      .regex(/^\d+\.\d{2}$/u)
      .refine((value) => new Decimal(value).greaterThanOrEqualTo("10000.00"), {
        message: "invalidValueFloor must meet the governed materiality floor."
      }),
    promoCorrelationCount: z.number().int().min(1),
    windowDays: z.number().int().min(90)
  })
  .strict();
export type GamingGate = z.infer<typeof GamingGateSchema>;

export const PartialHoldWeightsSchema = z
  .object({
    customerStrategicValue: lockedNumber(day1PartialHoldWeights.customerStrategicValue, "customerStrategicValue"),
    dsoPaymentDrift: lockedNumber(day1PartialHoldWeights.dsoPaymentDrift, "dsoPaymentDrift"),
    orderMargin: lockedNumber(day1PartialHoldWeights.orderMargin, "orderMargin"),
    orderValueVsExposure: lockedNumber(day1PartialHoldWeights.orderValueVsExposure, "orderValueVsExposure"),
    paymentPattern: lockedNumber(day1PartialHoldWeights.paymentPattern, "paymentPattern"),
    revenueForecast: lockedNumber(day1PartialHoldWeights.revenueForecast, "revenueForecast")
  })
  .strict()
  .superRefine(requireSumToOne("partial-hold weights"));
export type GovernedPartialHoldWeights = z.infer<typeof PartialHoldWeightsSchema>;

export const PartialHoldThresholdsSchema = z
  .object({
    holdBelow: lockedNumber(partialHoldThresholds.holdBelow, "holdBelow"),
    maxPartialReleasePercent: lockedNumber(partialHoldThresholds.maxPartialReleasePercent, "maxPartialReleasePercent"),
    minPartialReleasePercent: lockedNumber(partialHoldThresholds.minPartialReleasePercent, "minPartialReleasePercent"),
    partialFrom: lockedNumber(partialHoldThresholds.partialFrom, "partialFrom"),
    partialThrough: lockedNumber(partialHoldThresholds.partialThrough, "partialThrough"),
    releaseStepPercent: lockedNumber(partialHoldThresholds.releaseStepPercent, "releaseStepPercent"),
    shipAbove: lockedNumber(partialHoldThresholds.shipAbove, "shipAbove")
  })
  .strict();
export type GovernedPartialHoldThresholds = z.infer<typeof PartialHoldThresholdsSchema>;

export const PartialHoldConfigSchema = z
  .object({
    thresholds: PartialHoldThresholdsSchema,
    weights: PartialHoldWeightsSchema
  })
  .strict();
export type GovernedPartialHoldConfig = z.infer<typeof PartialHoldConfigSchema>;

export const DecisionEvalBarsSchema = z
  .object({
    arbitrationAgreement: accuracyBar(decisionEvalBars.arbitrationAgreement, "arbitrationAgreement"),
    deductionValidityAccuracy: accuracyBar(decisionEvalBars.deductionValidityAccuracy, "deductionValidityAccuracy"),
    intentPrecision: accuracyBar(decisionEvalBars.intentPrecision, "intentPrecision")
  })
  .strict();
export type GovernedDecisionEvalBars = z.infer<typeof DecisionEvalBarsSchema>;

export const GovernedConfigValuesSchema = z
  .object({
    accuracyBars: DecisionEvalBarsSchema,
    arbitrationWeights: ArbitrationPnlWeightsSchema,
    gamingGate: GamingGateSchema,
    partialHold: PartialHoldConfigSchema,
    rDriftTrigger: RDriftTriggerSchema,
    rScoreWeights: RScoreWeightsSchema,
    seed: z.literal(seed)
  })
  .strict();
export type GovernedConfigValues = z.infer<typeof GovernedConfigValuesSchema>;

export const GovernedConfigSeedSchema = z
  .object({
    configHash: z.string().regex(hashPattern),
    configVersion: z.literal(1),
    values: GovernedConfigValuesSchema
  })
  .strict()
  .superRefine((seed, context) => {
    const expectedHash = sha256CanonicalJson(seed.values);
    if (seed.configHash !== expectedHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "configHash must be sha256(canonical values JSON).",
        path: ["configHash"]
      });
    }
  });
export type GovernedConfigSeed = z.infer<typeof GovernedConfigSeedSchema>;

export interface GovernedConfigRuntimeSnapshot {
  configHash: string;
  configVersion: 1;
  rowHashes: Readonly<Record<GovernedConfigKey, string>>;
  values: GovernedConfigValues;
}

export const GovernedConfigSeedRowSchema = z
  .object({
    active: z.literal(true),
    approvedBy: z.string().startsWith("human:"),
    configHash: z.string().regex(hashPattern),
    configVersion: z.literal(1),
    effectiveFrom: z.string().datetime(),
    key: GovernedConfigKeySchema,
    valueJson: z.record(z.unknown())
  })
  .strict()
  .superRefine((row, context) => {
    const expectedHash = sha256CanonicalJson(row.valueJson);
    if (row.configHash !== expectedHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "row configHash must be sha256(canonical value_json).",
        path: ["configHash"]
      });
    }

    const payloadValidation = schemaForConfigKey(row.key).safeParse(row.valueJson);
    if (!payloadValidation.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `valueJson must match the governed schema for ${row.key}.`,
        path: ["valueJson"]
      });
    }
  });
export type GovernedConfigSeedRow = z.infer<typeof GovernedConfigSeedRowSchema>;

export function parseActiveGovernedConfigRows(rows: readonly unknown[]): GovernedConfigRuntimeSnapshot {
  const normalizedRows = rows.map(normalizeGovernedConfigRow);
  const rowsByKey = new Map<GovernedConfigKey, GovernedConfigSeedRow>();

  for (const row of normalizedRows) {
    if (rowsByKey.has(row.key)) {
      throw new Error(`Active governed config rows include a duplicate key: ${row.key}.`);
    }

    rowsByKey.set(row.key, row);
  }

  const missingKeys = governedConfigKeys.filter((key) => !rowsByKey.has(key));
  if (missingKeys.length > 0) {
    throw new Error(`Active governed config rows are missing keys: ${missingKeys.join(", ")}.`);
  }

  const rowForKey = (key: GovernedConfigKey): GovernedConfigSeedRow => {
    const row = rowsByKey.get(key);
    if (row === undefined) {
      throw new Error(`Active governed config rows are missing key: ${key}.`);
    }

    return row;
  };
  const values = GovernedConfigValuesSchema.parse({
    accuracyBars: rowForKey("accuracy_bars").valueJson,
    arbitrationWeights: rowForKey("arbitration_weights").valueJson,
    gamingGate: rowForKey("gaming_gate").valueJson,
    partialHold: rowForKey("partial_hold").valueJson,
    rDriftTrigger: rowForKey("r_drift").valueJson,
    rScoreWeights: rowForKey("r_score_weights").valueJson,
    seed: z.object({ seed: z.literal(seed) }).strict().parse(rowForKey("seed").valueJson).seed
  });
  const rowHashes = Object.fromEntries(
    governedConfigKeys.map((key) => [key, rowForKey(key).configHash])
  ) as Record<GovernedConfigKey, string>;

  return deepFreeze({
    configHash: sha256CanonicalJson(values),
    configVersion: 1,
    rowHashes,
    values
  });
}

export function normalizeGovernedConfigRow(row: unknown): GovernedConfigSeedRow {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return GovernedConfigSeedRowSchema.parse(row);
  }

  const record = row as Record<string, unknown>;
  return GovernedConfigSeedRowSchema.parse({
    active: record.active,
    approvedBy: record.approvedBy ?? record.approved_by,
    configHash: record.configHash ?? record.config_hash,
    configVersion: record.configVersion ?? record.config_version,
    effectiveFrom: record.effectiveFrom ?? record.effective_from,
    key: record.key,
    valueJson: parseConfigJsonCell(record.valueJson ?? record.value_json)
  });
}

const governedConfigValues = GovernedConfigValuesSchema.parse({
  accuracyBars: decisionEvalBars,
  arbitrationWeights: {
    billing: 0.15,
    collections: 0.25,
    credit: 0.35,
    fulfillment: 0.25
  },
  gamingGate: {
    invalidLineCount: 2,
    invalidValueFloor: "10000.00",
    promoCorrelationCount: 1,
    windowDays: 90
  },
  partialHold: {
    thresholds: partialHoldThresholds,
    weights: day1PartialHoldWeights
  },
  rDriftTrigger: {
    cooldownDays: 30,
    disputeRateRelativeIncrease: 0.5,
    dsoIncreaseDays: 10,
    riskTierDowngrade: 1
  },
  rScoreWeights: {
    agingConcentration: 0.2,
    disputeRate: 0.25,
    dsoAdp: 0.35,
    overLimitFrequency: 0.2
  },
  seed
});

export const day1GovernedConfigSeed = deepFreeze(
  GovernedConfigSeedSchema.parse({
    configHash: sha256CanonicalJson(governedConfigValues),
    configVersion: 1,
    values: governedConfigValues
  })
);

export const governedConfigSeedRows = deepFreeze([
  buildSeedRow("arbitration_weights", day1GovernedConfigSeed.values.arbitrationWeights),
  buildSeedRow("r_score_weights", day1GovernedConfigSeed.values.rScoreWeights),
  buildSeedRow("r_drift", day1GovernedConfigSeed.values.rDriftTrigger),
  buildSeedRow("gaming_gate", day1GovernedConfigSeed.values.gamingGate),
  buildSeedRow("partial_hold", day1GovernedConfigSeed.values.partialHold),
  buildSeedRow("accuracy_bars", day1GovernedConfigSeed.values.accuracyBars),
  buildSeedRow("seed", { seed: day1GovernedConfigSeed.values.seed })
] satisfies GovernedConfigSeedRow[]);

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function buildSeedRow(key: GovernedConfigKey, valueJson: Record<string, unknown>): GovernedConfigSeedRow {
  return GovernedConfigSeedRowSchema.parse({
    active: true,
    approvedBy: day1BootstrapSeedApprovedBy,
    configHash: sha256CanonicalJson(valueJson),
    configVersion: 1,
    effectiveFrom,
    key,
    valueJson
  });
}

function schemaForConfigKey(key: GovernedConfigKey): z.ZodType<unknown> {
  if (key === "arbitration_weights") {
    return ArbitrationPnlWeightsSchema;
  }
  if (key === "r_score_weights") {
    return RScoreWeightsSchema;
  }
  if (key === "r_drift") {
    return RDriftTriggerSchema;
  }
  if (key === "gaming_gate") {
    return GamingGateSchema;
  }
  if (key === "partial_hold") {
    return PartialHoldConfigSchema;
  }
  if (key === "accuracy_bars") {
    return DecisionEvalBarsSchema;
  }

  return z.object({ seed: z.literal(seed) }).strict();
}

function weightBand(defaultValue: number, adjustmentBand: number, hardFloor: number): z.ZodNumber {
  return z
    .number()
    .finite()
    .min(Math.max(hardFloor, defaultValue - adjustmentBand))
    .max(defaultValue + adjustmentBand);
}

function requireSumToOne(label: string) {
  return (weights: Record<string, number>, context: z.RefinementCtx): void => {
    const sum = Object.values(weights).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > sumTolerance) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must sum to 1.0.`
      });
    }
  };
}

function lockedNumber(expectedValue: number, label: string) {
  return z
    .number()
    .finite()
    .refine((value) => value === expectedValue, {
      message: `${label} must match the owner-ratified Day-1 value ${String(expectedValue)}.`
    });
}

function accuracyBar(lowerBound: number, label: string) {
  return z
    .number()
    .finite()
    .min(lowerBound, { message: `${label} must meet the owner-ratified release-blocking floor.` })
    .max(1, { message: `${label} must be less than or equal to 1.` });
}

function parseConfigJsonCell(value: unknown): unknown {
  return typeof value === "string" ? (JSON.parse(value) as unknown) : value;
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

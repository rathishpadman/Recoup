import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { decisionEvalBars, partialHoldThresholds, seed } from "./thresholds.js";

const hashPattern = /^[a-f0-9]{64}$/u;
const sumTolerance = 0.000000001;
export const governedConfigKeys = [
  "arbitration_weights",
  "r_score_weights",
  "r_drift",
  "gaming_gate",
  "partial_hold",
  "accuracy_bars",
  "risk_mesh_cases",
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

export const day1ArbitrationPnlWeights = deepFreeze({
  billing: 0.15,
  collections: 0.2,
  credit: 0.35,
  fulfillment: 0.3
} as const);

export const GovernedConfigKeySchema = z.enum(governedConfigKeys);
export type GovernedConfigKey = z.infer<typeof GovernedConfigKeySchema>;

export const ArbitrationPnlWeightsSchema = z
  .object({
    billing: governedRatio("billing"),
    collections: governedRatio("collections"),
    credit: governedRatio("credit"),
    fulfillment: governedRatio("fulfillment")
  })
  .strict()
  .superRefine(requireSumToOne("arbitration P&L weights"));
export type ArbitrationPnlWeights = z.infer<typeof ArbitrationPnlWeightsSchema>;

export const RScoreWeightsSchema = z
  .object({
    agingConcentration: governedRatio("agingConcentration"),
    disputeRate: governedRatio("disputeRate"),
    dsoAdp: governedRatio("dsoAdp"),
    overLimitFrequency: governedRatio("overLimitFrequency")
  })
  .strict()
  .superRefine(requireSumToOne("R-score weights"));
export type RScoreWeights = z.infer<typeof RScoreWeightsSchema>;

export const RDriftTriggerSchema = z
  .object({
    cooldownDays: z.number().int().min(1),
    disputeRateRelativeIncrease: z.number().finite().positive(),
    dsoIncreaseDays: z.number().int().min(1),
    riskTierDowngrade: z.number().int().min(1)
  })
  .strict();
export type RDriftTrigger = z.infer<typeof RDriftTriggerSchema>;

export const GamingGateSchema = z
  .object({
    invalidLineCount: z.number().int().min(1),
    invalidValueFloor: z
      .string()
      .regex(/^\d+\.\d{2}$/u)
      .refine((value) => new Decimal(value).greaterThan(0), {
        message: "invalidValueFloor must be a positive fixed-precision decimal string."
      }),
    promoCorrelationCount: z.number().int().min(1),
    windowDays: z.number().int().min(1)
  })
  .strict();
export type GamingGate = z.infer<typeof GamingGateSchema>;

export const PartialHoldWeightsSchema = z
  .object({
    customerStrategicValue: governedRatio("customerStrategicValue"),
    dsoPaymentDrift: governedRatio("dsoPaymentDrift"),
    orderMargin: governedRatio("orderMargin"),
    orderValueVsExposure: governedRatio("orderValueVsExposure"),
    paymentPattern: governedRatio("paymentPattern"),
    revenueForecast: governedRatio("revenueForecast")
  })
  .strict()
  .superRefine(requireSumToOne("partial-hold weights"));
export type GovernedPartialHoldWeights = z.infer<typeof PartialHoldWeightsSchema>;

export const PartialHoldThresholdsSchema = z
  .object({
    holdBelow: governedPercent("holdBelow"),
    maxPartialReleasePercent: governedPercent("maxPartialReleasePercent"),
    minPartialReleasePercent: governedPercent("minPartialReleasePercent"),
    partialFrom: governedPercent("partialFrom"),
    partialThrough: governedPercent("partialThrough"),
    releaseStepPercent: governedPercent("releaseStepPercent").positive(),
    shipAbove: governedPercent("shipAbove")
  })
  .strict()
  .superRefine((thresholds, context) => {
    if (thresholds.holdBelow > thresholds.partialFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "holdBelow must be less than or equal to partialFrom.",
        path: ["holdBelow"]
      });
    }
    if (thresholds.partialFrom > thresholds.partialThrough) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "partialFrom must be less than or equal to partialThrough.",
        path: ["partialFrom"]
      });
    }
    if (thresholds.partialThrough > thresholds.shipAbove) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "partialThrough must be less than or equal to shipAbove.",
        path: ["partialThrough"]
      });
    }
    if (thresholds.minPartialReleasePercent > thresholds.maxPartialReleasePercent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minPartialReleasePercent must be less than or equal to maxPartialReleasePercent.",
        path: ["minPartialReleasePercent"]
      });
    }
  });
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
    arbitrationAgreement: governedRatio("arbitrationAgreement"),
    deductionValidityAccuracy: governedRatio("deductionValidityAccuracy"),
    intentPrecision: governedRatio("intentPrecision")
  })
  .strict();
export type GovernedDecisionEvalBars = z.infer<typeof DecisionEvalBarsSchema>;

const RiskMeshRecordIdsSchema = z.array(z.string().trim().min(1)).min(1);
const RiskMeshScoreSchema = z.number().finite().min(0).max(100);
const RiskMeshDisplayTextSchema = z.string().trim().min(1);
const RiskMeshOptionValueSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/u)
  .refine((value) => new Decimal(value).isFinite(), {
    message: "optionValue must be a finite decimal string."
  });

export const RiskMeshCaseConfigSchema = z
  .object({
    accountReadout: z
      .object({
        availableCreditLabel: RiskMeshDisplayTextSchema,
        creditProgram: RiskMeshDisplayTextSchema,
        hqRegion: RiskMeshDisplayTextSchema,
        industry: RiskMeshDisplayTextSchema,
        legalEntity: RiskMeshDisplayTextSchema,
        limitLabel: RiskMeshDisplayTextSchema,
        openArLabel: RiskMeshDisplayTextSchema,
        ownerLabel: RiskMeshDisplayTextSchema,
        posture: RiskMeshDisplayTextSchema
      })
      .strict(),
    actionQueue: z
      .array(
        z
          .object({
            account: RiskMeshDisplayTextSchema,
            age: RiskMeshDisplayTextSchema,
            item: RiskMeshDisplayTextSchema,
            nextStep: RiskMeshDisplayTextSchema,
            priority: RiskMeshDisplayTextSchema,
            status: RiskMeshDisplayTextSchema
          })
          .strict()
      )
      .min(1),
    arbitrationPositions: z
      .array(
        z
          .object({
            functionName: z.enum(["billing", "collections", "credit", "fulfillment"]),
            optionId: z.string().trim().min(1),
            optionValue: RiskMeshOptionValueSchema.optional(),
            position: z.string().trim().min(1),
            recordIds: RiskMeshRecordIdsSchema
          })
          .strict()
      )
      .min(1),
    caseId: z.string().trim().min(1),
    containmentIntentLabel: RiskMeshDisplayTextSchema,
    customerId: z.string().trim().min(1),
    holdBasis: z.string().trim().min(1),
    orderAmount: z
      .string()
      .regex(/^\d+\.\d{2}$/u)
      .refine((value) => new Decimal(value).isFinite() && new Decimal(value).greaterThan(0), {
        message: "orderAmount must be a positive fixed-precision decimal string."
      }),
    orderId: z.string().trim().min(1),
    partialHoldScores: z
      .object({
        customerStrategicValue: RiskMeshScoreSchema,
        dsoPaymentDrift: RiskMeshScoreSchema,
        orderMargin: RiskMeshScoreSchema,
        orderValueVsExposure: RiskMeshScoreSchema,
        paymentPattern: RiskMeshScoreSchema,
        revenueForecast: RiskMeshScoreSchema
      })
      .strict(),
    recordIds: RiskMeshRecordIdsSchema,
    riskObservationSource: z
      .object({
        baselinePaymentRefs: RiskMeshRecordIdsSchema,
        criticalAlertSeverity: RiskMeshDisplayTextSchema,
        criticalAlertType: RiskMeshDisplayTextSchema,
        citedDeductionVerdicts: z.array(RiskMeshDisplayTextSchema).min(1),
        currentPaymentRef: z.string().trim().min(1),
        sourceCustomerId: z.string().trim().min(1)
      })
      .strict(),
    sentinelDisplay: z
      .object({
        alertDetail: RiskMeshDisplayTextSchema,
        displayReason: RiskMeshDisplayTextSchema,
        filedLabel: RiskMeshDisplayTextSchema,
        filingId: RiskMeshDisplayTextSchema,
        recordStripLabel: RiskMeshDisplayTextSchema,
        securedPartyLabel: RiskMeshDisplayTextSchema
      })
      .strict(),
    terms: z.string().trim().min(1),
    termsBasis: z.string().trim().min(1)
  })
  .strict();
export type GovernedRiskMeshCaseConfig = z.infer<typeof RiskMeshCaseConfigSchema>;

export const RiskMeshCasesSchema = z
  .object({
    harbor: RiskMeshCaseConfigSchema
  })
  .strict();
export type GovernedRiskMeshCases = z.infer<typeof RiskMeshCasesSchema>;

export const GovernedConfigValuesSchema = z
  .object({
    accuracyBars: DecisionEvalBarsSchema,
    arbitrationWeights: ArbitrationPnlWeightsSchema,
    gamingGate: GamingGateSchema,
    partialHold: PartialHoldConfigSchema,
    rDriftTrigger: RDriftTriggerSchema,
    rScoreWeights: RScoreWeightsSchema,
    riskMeshCases: RiskMeshCasesSchema,
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
    riskMeshCases: rowForKey("risk_mesh_cases").valueJson,
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
    effectiveFrom: normalizeDateTimeCell(record.effectiveFrom ?? record.effective_from),
    key: record.key,
    valueJson: parseConfigJsonCell(record.valueJson ?? record.value_json)
  });
}

function buildHarborRound2ArbitrationPositions(): GovernedRiskMeshCaseConfig["arbitrationPositions"] {
  const recordIds = ["CUST-HARBOR", "USCU_S04", "6534", "LEDGER-6-PARTIAL-HOLD"];
  const options = [
    {
      optionId: "partial_release_55",
      label: "Partial release 55% + revised terms",
      values: {
        billing: "0.75",
        collections: "0.85",
        credit: "0.80",
        fulfillment: "0.65"
      }
    },
    {
      optionId: "full_release_revised_terms",
      label: "Full release on revised terms",
      values: {
        billing: "0.85",
        collections: "0.70",
        credit: "0.35",
        fulfillment: "0.90"
      }
    },
    {
      optionId: "full_release_100",
      label: "Full release 100% current terms",
      values: {
        billing: "0.90",
        collections: "0.30",
        credit: "0.20",
        fulfillment: "0.95"
      }
    },
    {
      optionId: "full_hold_0",
      label: "Full hold 0% release",
      values: {
        billing: "0.20",
        collections: "0.50",
        credit: "0.95",
        fulfillment: "0.10"
      }
    }
  ] as const;
  const functionBasis = {
    billing: "relationship / strategic continuity",
    collections: "collections recoverability",
    credit: "credit-risk / loss avoidance",
    fulfillment: "revenue / fulfilment"
  } as const;

  return options.flatMap((option) =>
    (["credit", "fulfillment", "collections", "billing"] as const).map((functionName) => ({
      functionName,
      optionId: option.optionId,
      optionValue: option.values[functionName],
      position: `${option.label}: owner-supplied ${functionBasis[functionName]} option value.`,
      recordIds
    }))
  );
}

const governedConfigValues = GovernedConfigValuesSchema.parse({
  accuracyBars: decisionEvalBars,
  arbitrationWeights: day1ArbitrationPnlWeights,
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
  riskMeshCases: {
    harbor: {
      accountReadout: {
        availableCreditLabel: "Pending ERP",
        creditProgram: "Global standard",
        hqRegion: "Houston, TX / NA",
        industry: "Maritime services",
        legalEntity: "Harbor Holdings LLC",
        limitLabel: "Pending ERP",
        openArLabel: "Pending ERP",
        ownerLabel: "David Kim",
        posture: "Human approval required"
      },
      actionQueue: [
        {
          account: "Harbor",
          age: "00h 42m",
          item: "Bureau lien alert",
          nextStep: "Review lien",
          priority: "P1",
          status: "New"
        },
        {
          account: "Harbor",
          age: "01h 15m",
          item: "Partial-hold recommended",
          nextStep: "Review & send",
          priority: "P1",
          status: "Action required"
        },
        {
          account: "Harbor",
          age: "02h 10m",
          item: "DSO drift alert",
          nextStep: "View DSO",
          priority: "P2",
          status: "Investigate"
        },
        {
          account: "Harbor",
          age: "04h 02m",
          item: "Order exposure update",
          nextStep: "Review exposure",
          priority: "P3",
          status: "Advisory"
        },
        {
          account: "Harbor",
          age: "06h 33m",
          item: "Policy exception",
          nextStep: "Review exception",
          priority: "P3",
          status: "Advisory"
        }
      ],
      arbitrationPositions: buildHarborRound2ArbitrationPositions(),
      caseId: "ARB-HARBOR-ORDER-640K",
      containmentIntentLabel: "distressed-honest",
      customerId: "CUST-HARBOR",
      holdBasis: "Harbor worked example computes a 55% controlled release from the deterministic partial-hold core.",
      orderAmount: "640010.00",
      orderId: "6534",
      partialHoldScores: {
        customerStrategicValue: 60,
        dsoPaymentDrift: 30,
        orderMargin: 80,
        orderValueVsExposure: 35,
        paymentPattern: 50,
        revenueForecast: 65
      },
      recordIds: ["CUST-HARBOR", "USCU_S04", "6534", "LEDGER-6-PARTIAL-HOLD"],
      riskObservationSource: {
        baselinePaymentRefs: ["90000036", "90000060", "INV-HARB-003"],
        criticalAlertSeverity: "CRITICAL",
        criticalAlertType: "TAX_LIEN",
        citedDeductionVerdicts: ["PARTIAL", "INVALID"],
        currentPaymentRef: "90000085",
        sourceCustomerId: "USCU_S04"
      },
      sentinelDisplay: {
        alertDetail: "UCC-1 filing detected and priority review required before any release.",
        displayReason: "Bureau lien alert",
        filedLabel: "Filed: pending proof",
        filingId: "UCC-1-HARBOR-PENDING",
        recordStripLabel: "Sentinel alert record IDs",
        securedPartyLabel: "Secured party: proof required"
      },
      terms: "2/10 Net-30 + 25% deposit",
      termsBasis: "Sentinel drift observation routes revised terms to HITL without self-applying terms."
    }
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
  buildSeedRow("risk_mesh_cases", day1GovernedConfigSeed.values.riskMeshCases),
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

function normalizeDateTimeCell(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
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
  if (key === "risk_mesh_cases") {
    return RiskMeshCasesSchema;
  }

  return z.object({ seed: z.literal(seed) }).strict();
}

function governedRatio(label: string): z.ZodNumber {
  return z
    .number()
    .finite()
    .min(0, { message: `${label} must be greater than or equal to 0.` })
    .max(1, { message: `${label} must be less than or equal to 1.` });
}

function governedPercent(label: string): z.ZodNumber {
  return z
    .number()
    .finite()
    .min(0, { message: `${label} must be greater than or equal to 0.` })
    .max(100, { message: `${label} must be less than or equal to 100.` });
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

import { z } from "zod";
import { sha256CanonicalJson } from "./governed.js";

export const releaseOwnerInputConfigKeys = [
  "run_control",
  "release_eval_label_manifest",
  "intent_eval_labels",
  "arbitration_eval_labels"
] as const;

export const releaseOwnerInputOptionalConfigKeys = ["decision_confidence_threshold"] as const;
export const releaseOwnerInputQueryableConfigKeys = [
  ...releaseOwnerInputConfigKeys,
  ...releaseOwnerInputOptionalConfigKeys
] as const;

export const ReleaseOwnerInputConfigKeySchema = z.enum(releaseOwnerInputConfigKeys);
export type ReleaseOwnerInputConfigKey = z.infer<typeof ReleaseOwnerInputConfigKeySchema>;
const ReleaseOwnerInputConfigRowKeySchema = z.enum(releaseOwnerInputQueryableConfigKeys);
export type ReleaseOwnerInputOptionalConfigKey = (typeof releaseOwnerInputOptionalConfigKeys)[number];
export type ReleaseOwnerInputConfigRowKey = z.infer<typeof ReleaseOwnerInputConfigRowKeySchema>;

const runControlBudgetSchema = z
  .object({
    retryCap: z.number().int().positive(),
    stepBudget: z.number().int().positive(),
    tokenBudget: z.number().int().positive()
  })
  .strict();

export const RunControlValueJsonSchema = z
  .object({
    phases: z
      .object({
        containment: runControlBudgetSchema,
        forensics: runControlBudgetSchema,
        query: runControlBudgetSchema,
        recovery: runControlBudgetSchema,
        riskMesh: runControlBudgetSchema,
        sentinel: runControlBudgetSchema
      })
      .strict()
  })
  .strict();

export const RunControlConfigSchema = RunControlValueJsonSchema.extend({
  approvedBy: z.string().startsWith("human:")
}).strict();
export type RunControlConfig = z.infer<typeof RunControlConfigSchema>;

export const ReleaseEvalLabelManifestValueJsonSchema = z
  .object({
    arbitrationCaseIds: z.array(z.string().min(1)).min(1),
    intentCaseIds: z.array(z.string().min(1)).min(1)
  })
  .strict();

export const ReleaseEvalLabelManifestSchema = ReleaseEvalLabelManifestValueJsonSchema.extend({
  approvedBy: z.string().startsWith("human:")
}).strict();
export type ReleaseEvalLabelManifest = z.infer<typeof ReleaseEvalLabelManifestSchema>;

export const ReleaseIntentLabelSchema = z.enum(["gaming", "distressed-honest", "genuine"]);
export type ReleaseIntentLabel = z.infer<typeof ReleaseIntentLabelSchema>;

export const IntentEvalLabelsValueJsonSchema = z
  .object({
    labels: z
      .array(
        z
          .object({
            actual: ReleaseIntentLabelSchema,
            caseId: z.string().min(1),
            modelCustomerId: z.string().min(1),
            recordIds: z.array(z.string().min(1)).min(1),
            sapCustomerId: z.string().min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const IntentEvalLabelsSchema = IntentEvalLabelsValueJsonSchema.extend({
  approvedBy: z.string().startsWith("human:")
}).strict();
export type IntentEvalLabels = z.infer<typeof IntentEvalLabelsSchema>;

export const ArbitrationEvalLabelsValueJsonSchema = z
  .object({
    labels: z
      .array(
        z
          .object({
            actual: z.string().min(1),
            caseId: z.string().min(1),
            expectedRanking: z.array(z.string().min(1)).min(1),
            modelCaseId: z.string().min(1),
            recordIds: z.array(z.string().min(1)).min(1),
            sapOrderId: z.string().min(1)
          })
          .strict()
      )
      .min(1)
  })
  .strict();

export const ArbitrationEvalLabelsSchema = ArbitrationEvalLabelsValueJsonSchema.extend({
  approvedBy: z.string().startsWith("human:")
}).strict();
export type ArbitrationEvalLabels = z.infer<typeof ArbitrationEvalLabelsSchema>;

export const DecisionConfidenceThresholdValueJsonSchema = z
  .object({
    threshold: z.number().min(0).max(1)
  })
  .strict();

export const DecisionConfidenceThresholdSchema = DecisionConfidenceThresholdValueJsonSchema.extend({
  approvedBy: z.string().startsWith("human:")
}).strict();
export type DecisionConfidenceThreshold = z.infer<typeof DecisionConfidenceThresholdSchema>;

export interface ReleaseOwnerInputSnapshot {
  arbitrationLabels: ArbitrationEvalLabels;
  decisionConfidenceThreshold?: DecisionConfidenceThreshold;
  labelManifest: ReleaseEvalLabelManifest;
  rowHashes: Readonly<
    Record<ReleaseOwnerInputConfigKey, string> & Partial<Record<ReleaseOwnerInputOptionalConfigKey, string>>
  >;
  runControlConfig: RunControlConfig;
  intentLabels: IntentEvalLabels;
}

interface ReleaseOwnerInputSeedRow {
  active: true;
  approvedBy: "human:rathish-owner";
  configHash: string;
  configVersion: 1;
  effectiveFrom: "2026-06-22T00:00:00.000Z";
  key: ReleaseOwnerInputConfigRowKey;
  valueJson: Record<string, unknown>;
}

function buildReleaseOwnerInputSeedRow(
  key: ReleaseOwnerInputConfigRowKey,
  valueJson: Record<string, unknown>
): ReleaseOwnerInputSeedRow {
  return {
    active: true,
    approvedBy: "human:rathish-owner",
    configHash: sha256CanonicalJson(valueJson),
    configVersion: 1,
    effectiveFrom: "2026-06-22T00:00:00.000Z",
    key,
    valueJson
  };
}

// Setup/test seed rows only. Runtime callers must load release owner-inputs from Supabase recoup_config.
export const releaseOwnerInputSeedRows = deepFreeze([
  buildReleaseOwnerInputSeedRow("run_control", {
    phases: {
      containment: { retryCap: 2, stepBudget: 24, tokenBudget: 45000 },
      forensics: { retryCap: 2, stepBudget: 80, tokenBudget: 200000 },
      query: { retryCap: 1, stepBudget: 12, tokenBudget: 32000 },
      recovery: { retryCap: 2, stepBudget: 40, tokenBudget: 90000 },
      riskMesh: { retryCap: 2, stepBudget: 36, tokenBudget: 90000 },
      sentinel: { retryCap: 2, stepBudget: 30, tokenBudget: 70000 }
    }
  }),
  buildReleaseOwnerInputSeedRow("release_eval_label_manifest", {
    arbitrationCaseIds: ["arb:harbor-order-6534"],
    intentCaseIds: ["intent:USCU_L10", "intent:USCU_S04", "intent:USCU_S07", "intent:USCU_S03"]
  }),
  buildReleaseOwnerInputSeedRow("intent_eval_labels", {
    labels: [
      {
        actual: "gaming",
        caseId: "intent:USCU_L10",
        modelCustomerId: "CUST-CRESTLINE",
        recordIds: ["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"],
        sapCustomerId: "USCU_L10"
      },
      {
        actual: "distressed-honest",
        caseId: "intent:USCU_S04",
        modelCustomerId: "CUST-HARBOR",
        recordIds: ["FIN-DISP-202", "BUREAU-HARBOR-TAX-LIEN", "90000036", "90000085"],
        sapCustomerId: "USCU_S04"
      },
      {
        actual: "genuine",
        caseId: "intent:USCU_S07",
        modelCustomerId: "CUST-VALUMART",
        recordIds: ["S4-L1", "SLA-CONTRACT-1", "S5-L1", "POD-TIMESTAMP-1"],
        sapCustomerId: "USCU_S07"
      },
      {
        actual: "genuine",
        caseId: "intent:USCU_S03",
        modelCustomerId: "CUST-GREENLEAF",
        recordIds: ["S1-L1", "PHOTO-CARRIER-1", "POD-90000002"],
        sapCustomerId: "USCU_S03"
      }
    ]
  }),
  buildReleaseOwnerInputSeedRow("arbitration_eval_labels", {
    labels: [
      {
        actual: "partial-release-55|ship=352005.50|backorder=288004.50|terms=2/10 Net-30 + 25% deposit",
        caseId: "arb:harbor-order-6534",
        expectedRanking: [
          "partial_release_55",
          "full_release_revised_terms",
          "full_release_100",
          "full_hold_0"
        ],
        modelCaseId: "ARB-HARBOR-ORDER-640K",
        recordIds: ["6534", "USCU_S04", "LEDGER-6-PARTIAL-HOLD"],
        sapOrderId: "6534"
      }
    ]
  }),
  buildReleaseOwnerInputSeedRow("decision_confidence_threshold", {
    threshold: 0.8
  })
]);

export const ReleaseOwnerInputConfigRowSchema = z
  .object({
    active: z.literal(true),
    approvedBy: z.string().startsWith("human:"),
    configHash: z.string().regex(/^[a-f0-9]{64}$/u),
    configVersion: z.literal(1),
    effectiveFrom: z.string().datetime(),
    key: ReleaseOwnerInputConfigRowKeySchema,
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

    const payloadValidation = schemaForReleaseOwnerInputKey(row.key).safeParse(row.valueJson);
    if (!payloadValidation.success) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `valueJson must match the release owner-input schema for ${row.key}.`,
        path: ["valueJson"]
      });
    }
  });
export type ReleaseOwnerInputConfigRow = z.infer<typeof ReleaseOwnerInputConfigRowSchema>;

export function parseReleaseOwnerInputRows(rows: readonly unknown[]): ReleaseOwnerInputSnapshot {
  const normalizedRows = rows.map(normalizeReleaseOwnerInputRow);
  const rowsByKey = new Map<ReleaseOwnerInputConfigRowKey, ReleaseOwnerInputConfigRow>();

  for (const row of normalizedRows) {
    if (rowsByKey.has(row.key)) {
      throw new Error(`Active release owner-input rows include a duplicate key: ${row.key}.`);
    }

    rowsByKey.set(row.key, row);
  }

  const missingKeys = releaseOwnerInputConfigKeys.filter((key) => !rowsByKey.has(key));
  if (missingKeys.length > 0) {
    throw new Error(`Active release owner-input rows are missing keys: ${missingKeys.join(", ")}.`);
  }

  const rowForKey = (key: ReleaseOwnerInputConfigKey): ReleaseOwnerInputConfigRow => {
    const row = rowsByKey.get(key);
    if (row === undefined) {
      throw new Error(`Active release owner-input rows are missing key: ${key}.`);
    }

    return row;
  };
  const runControlRow = rowForKey("run_control");
  const labelManifestRow = rowForKey("release_eval_label_manifest");
  const intentLabelsRow = rowForKey("intent_eval_labels");
  const arbitrationLabelsRow = rowForKey("arbitration_eval_labels");
  const rowHashes = Object.fromEntries(
    releaseOwnerInputConfigKeys.map((key) => [key, rowForKey(key).configHash])
  ) as Record<ReleaseOwnerInputConfigKey, string> & Partial<Record<ReleaseOwnerInputOptionalConfigKey, string>>;
  const decisionConfidenceThresholdRow = rowsByKey.get("decision_confidence_threshold");
  const decisionConfidenceThreshold =
    decisionConfidenceThresholdRow === undefined
      ? undefined
      : DecisionConfidenceThresholdSchema.parse({
          ...decisionConfidenceThresholdRow.valueJson,
          approvedBy: decisionConfidenceThresholdRow.approvedBy
        });
  if (decisionConfidenceThresholdRow !== undefined) {
    rowHashes.decision_confidence_threshold = decisionConfidenceThresholdRow.configHash;
  }

  return deepFreeze({
    arbitrationLabels: ArbitrationEvalLabelsSchema.parse({
      ...arbitrationLabelsRow.valueJson,
      approvedBy: arbitrationLabelsRow.approvedBy
    }),
    ...(decisionConfidenceThreshold === undefined ? {} : { decisionConfidenceThreshold }),
    labelManifest: ReleaseEvalLabelManifestSchema.parse({
      ...labelManifestRow.valueJson,
      approvedBy: labelManifestRow.approvedBy
    }),
    rowHashes,
    runControlConfig: RunControlConfigSchema.parse({
      ...runControlRow.valueJson,
      approvedBy: runControlRow.approvedBy
    }),
    intentLabels: IntentEvalLabelsSchema.parse({
      ...intentLabelsRow.valueJson,
      approvedBy: intentLabelsRow.approvedBy
    })
  });
}

export function normalizeReleaseOwnerInputRow(row: unknown): ReleaseOwnerInputConfigRow {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    return ReleaseOwnerInputConfigRowSchema.parse(row);
  }

  const record = row as Record<string, unknown>;
  return ReleaseOwnerInputConfigRowSchema.parse({
    active: record.active,
    approvedBy: record.approvedBy ?? record.approved_by,
    configHash: record.configHash ?? record.config_hash,
    configVersion: record.configVersion ?? record.config_version,
    effectiveFrom: normalizeDateTimeCell(record.effectiveFrom ?? record.effective_from),
    key: record.key,
    valueJson: parseConfigJsonCell(record.valueJson ?? record.value_json)
  });
}

function schemaForReleaseOwnerInputKey(key: ReleaseOwnerInputConfigRowKey): z.ZodType<unknown> {
  if (key === "run_control") {
    return RunControlValueJsonSchema;
  }
  if (key === "release_eval_label_manifest") {
    return ReleaseEvalLabelManifestValueJsonSchema;
  }
  if (key === "intent_eval_labels") {
    return IntentEvalLabelsValueJsonSchema;
  }
  switch (key) {
    case "arbitration_eval_labels":
      return ArbitrationEvalLabelsValueJsonSchema;
    case "decision_confidence_threshold":
      return DecisionConfidenceThresholdValueJsonSchema;
    default:
      return assertNever(key);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported release owner-input key: ${String(value)}.`);
}

function normalizeDateTimeCell(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
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

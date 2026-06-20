import type { MemoryCategory, MemoryRecord, TrustLevel } from "./schema.js";

export interface CompactMemoryInput {
  objective: string;
  records: MemoryRecord[];
  scope: string;
  nextStep: string;
}

export interface CompactionSummary {
  category: "compaction_summaries";
  trustLevel: TrustLevel;
  scope: string;
  payload: {
    objective: string;
    preservedCategories: MemoryCategory[];
    nextStep: string;
  };
  recordIds: string[];
}

export function compactMemoryRecords(input: CompactMemoryInput): CompactionSummary {
  const preservedCategories = Array.from(new Set(input.records.map((record) => record.category)));
  const recordIds = Array.from(new Set(input.records.flatMap((record) => record.recordIds))).sort();

  return {
    category: "compaction_summaries",
    trustLevel: summarizeTrustLevel(input.records),
    scope: input.scope,
    payload: {
      objective: input.objective,
      preservedCategories,
      nextStep: input.nextStep
    },
    recordIds
  };
}

function summarizeTrustLevel(records: MemoryRecord[]): TrustLevel {
  if (records.some((record) => record.trustLevel === "untrusted")) {
    return "untrusted";
  }

  if (records.some((record) => record.trustLevel === "semi_trusted")) {
    return "semi_trusted";
  }

  return "trusted";
}

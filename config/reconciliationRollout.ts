import { z } from "zod";

export const ReconciliationModeSchema = z.enum(["legacy", "shadow", "canary", "authoritative"]);
export type ReconciliationMode = z.infer<typeof ReconciliationModeSchema>;

export function readReconciliationMode(env: Record<string, string | undefined> = process.env): ReconciliationMode {
  return ReconciliationModeSchema.parse(env["RECOUP_RECONCILIATION_MODE"] ?? "legacy");
}

export function readCanaryLines(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(
    (env["RECOUP_RECONCILIATION_CANARY_LINES"] ?? "")
      .split(",")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  );
}

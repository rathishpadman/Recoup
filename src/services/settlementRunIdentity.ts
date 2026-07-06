import type { SyntheticDatasetCore } from "../types/entities.js";

export function settlementRunIdForSource(settlementRun: SyntheticDatasetCore): string {
  const sourceFingerprint = [
    `seed:${settlementRun.seed.toString()}`,
    ...settlementRun.deductionLines.map((line) =>
      [
        line.lineId,
        line.eventId,
        line.customerId,
        line.scenarioId,
        ...line.recordIds
      ].join("|")
    )
  ].join("\u001F");

  return `settlement-run:${settlementRun.seed.toString()}:${fnv1a64Hex(sourceFingerprint)}`;
}

function fnv1a64Hex(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (const char of value) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

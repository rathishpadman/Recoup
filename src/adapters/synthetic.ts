import { buildSyntheticDataset } from "./syntheticData.js";
import type { SyntheticDatasetCore } from "../types/entities.js";
import type { SourcePort, SourceRiskObservationSnapshot } from "./source.js";

interface SyntheticSourceOptions {
  seed: 42;
}

export class SyntheticSource implements SourcePort {
  readonly #seed: 42;

  constructor(options: SyntheticSourceOptions) {
    this.#seed = options.seed;
  }

  loadSettlementRun(): SyntheticDatasetCore {
    const dataset = buildSyntheticDataset({ seed: this.#seed });

    return {
      seed: dataset.seed,
      customers: dataset.customers,
      deductionLines: dataset.deductionLines
    };
  }

  loadRiskObservationSnapshot(customerId: string): SourceRiskObservationSnapshot | undefined {
    if (customerId !== "CUST-HARBOR") {
      return undefined;
    }

    const dataset = buildSyntheticDataset({ seed: this.#seed });
    const harborLines = dataset.deductionLines.filter((line) => line.customerId === customerId);

    return {
      customerId,
      observedSignals: {
        baselineDsoDays: 32,
        currentDsoDays: 51,
        disputeSpike: true,
        lienSignal: true
      },
      rDriftObservations: {
        baselineDsoDays: 32,
        currentDsoDays: 51
      },
      recordIds: dedupeRecordIds([
        customerId,
        "6534",
        "LEDGER-6-PARTIAL-HOLD",
        "LEDGER-HARBOR-DISTRESSED-HONEST",
        ...harborLines.flatMap((line) => [line.lineId, ...line.recordIds])
      ]),
      sourceNormalization: {
        missingFields: [
          "rScoreComponentScores.agingConcentration",
          "rScoreComponentScores.disputeRate",
          "rScoreComponentScores.dsoAdp",
          "rScoreComponentScores.overLimitFrequency"
        ],
        sourcePort: "SourcePort.loadRiskObservationSnapshot"
      }
    };
  }
}

function dedupeRecordIds(recordIds: readonly string[]): string[] {
  return [...new Set(recordIds.filter((recordId) => recordId.trim().length > 0))];
}

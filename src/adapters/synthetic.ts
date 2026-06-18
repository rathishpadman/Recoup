import { buildSyntheticDataset } from "./syntheticData.js";
import type { SyntheticDatasetCore } from "../types/entities.js";
import type { SourcePort } from "./source.js";

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
}

import type { SyntheticDatasetCore } from "../types/entities.js";

export interface SourcePort {
  loadSettlementRun(): SyntheticDatasetCore;
}

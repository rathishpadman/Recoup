import { readFileSync } from "node:fs";
import type { CreditRiskRows } from "../../../src/services/creditRiskModel.js";

const fixtureUrl = new URL("../../../docs/Tools_data/credit_risk_dataset.json", import.meta.url);

export function loadCreditRiskFixtureRows(): CreditRiskRows {
  return structuredClone(JSON.parse(readFileSync(fixtureUrl, "utf8")) as CreditRiskRows);
}

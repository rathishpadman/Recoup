import { loadLocalRuntimeEnvFiles } from "../../../config/localRuntimeEnv.ts";
import { fetchCreditRiskReviewModel, type CreditRiskReviewModel } from "../cockpit-data.ts";
import {
  davidCreditRiskReadModelKey,
  davidCreditRiskReadModelMaxAgeMs,
  readCachedReadModelPayload
} from "../api/read-model-cache.ts";

export async function fetchCreditRiskReviewModelCacheFirst(): Promise<CreditRiskReviewModel> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const cached = await readCachedReadModelPayload(
    runtimeEnv,
    davidCreditRiskReadModelKey,
    "credit-risk-review",
    { maxAgeMs: davidCreditRiskReadModelMaxAgeMs, persona: "david" }
  );

  return cached === undefined
    ? fetchCreditRiskReviewModel()
    : cached.payload as unknown as CreditRiskReviewModel;
}

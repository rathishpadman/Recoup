import { loadLocalRuntimeEnvFiles } from "../../../config/localRuntimeEnv.ts";
import { fetchCreditRiskReviewModel, type CreditRiskReviewModel } from "../cockpit-data.ts";
import {
  cachedCreditSignalsAgreeWithApprovals,
  davidCreditRiskReadModelKey,
  davidCreditRiskReadModelMaxAgeMs,
  readCachedReadModelPayload,
  readCommittedCreditRecommendationActionIds
} from "../api/read-model-cache.ts";

/**
 * The page renders from this loader rather than from /api/credit, so the approval freshness rule
 * has to live here too. Wiring it into the route alone left an approval committed a moment earlier
 * invisible on the surface David actually opens.
 *
 * Age alone is not freshness: a recommendation approved a moment ago must appear on the next load,
 * not whenever the cache happens to expire. When the approval store cannot be read the cache still
 * stands, because this surface exists so the credit view survives a slow backend, and a store that
 * cannot be read is also one that could not have accepted a new approval.
 */
export async function fetchCreditRiskReviewModelCacheFirst(): Promise<CreditRiskReviewModel> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const cached = await readCachedReadModelPayload(
    runtimeEnv,
    davidCreditRiskReadModelKey,
    "credit-risk-review",
    { maxAgeMs: davidCreditRiskReadModelMaxAgeMs, persona: "david" }
  );
  if (cached === undefined) {
    return fetchCreditRiskReviewModel();
  }

  const committedActionIds = await readCommittedCreditRecommendationActionIds(runtimeEnv);
  if (committedActionIds !== undefined && !cachedCreditSignalsAgreeWithApprovals(cached.payload, committedActionIds)) {
    return fetchCreditRiskReviewModel();
  }

  return cached.payload as unknown as CreditRiskReviewModel;
}

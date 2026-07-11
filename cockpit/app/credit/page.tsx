import { DavidRiskReviewSurface } from "@/components/david/david-risk-review-surface";
import { requireRouteAccess } from "../demo-auth.ts";
import { fetchCreditRiskReviewModelCacheFirst } from "./credit-read-model.ts";

export default async function CreditPage() {
  const session = await requireRouteAccess("/credit");
  const model = await fetchCreditRiskReviewModelCacheFirst();

  return <DavidRiskReviewSurface displayName={session.displayName} model={model} />;
}

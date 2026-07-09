import { DavidRiskReviewSurface } from "@/components/david/david-risk-review-surface";
import { fetchCreditRiskReviewModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";

export default async function CreditPage() {
  const session = await requireRouteAccess("/credit");
  const model = await fetchCreditRiskReviewModel();

  return <DavidRiskReviewSurface displayName={session.displayName} model={model} />;
}

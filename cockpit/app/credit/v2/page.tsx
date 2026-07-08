import { DavidRiskReviewSurface } from "@/components/david/david-risk-review-surface";
import { fetchCreditRiskReviewModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";

export default async function DavidCreditRiskReviewPage() {
  await requireRouteAccess("/credit/v2");
  const model = await fetchCreditRiskReviewModel();

  return <DavidRiskReviewSurface model={model} />;
}

import { MayaForensicsSurface } from "@/components/maya/maya-forensics-surface";
import { fetchConnectorReadinessModel, fetchForensicsModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";

export default async function MayaShadcnForensicsPage() {
  const session = await requireRouteAccess("/forensics/shadcn");
  const [model, connectors] = await Promise.all([fetchForensicsModel(), fetchConnectorReadinessModel()]);

  return <MayaForensicsSurface connectors={connectors} model={model} session={session} />;
}

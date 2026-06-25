import { MayaForensicsSurface } from "@/components/maya/maya-forensics-surface";
import { requireMayaBackendReadAuthHeaders } from "../../backend-read-auth.ts";
import { fetchConnectorReadinessModel, fetchForensicsModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";

export default async function MayaShadcnForensicsPage() {
  const session = await requireRouteAccess("/forensics/shadcn");
  const backendReadAuthHeaders = await requireMayaBackendReadAuthHeaders();
  const [model, connectors] = await Promise.all([
    fetchForensicsModel(backendReadAuthHeaders),
    fetchConnectorReadinessModel(backendReadAuthHeaders)
  ]);

  return <MayaForensicsSurface connectors={connectors} model={model} session={session} />;
}

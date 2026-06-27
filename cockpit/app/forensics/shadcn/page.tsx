import { MayaForensicsSurfaceLoader } from "@/components/maya/maya-forensics-surface-loader";
import { requireRouteAccess } from "../../demo-auth.ts";

export default async function MayaShadcnForensicsPage() {
  const session = await requireRouteAccess("/forensics/shadcn");

  return <MayaForensicsSurfaceLoader session={session} />;
}

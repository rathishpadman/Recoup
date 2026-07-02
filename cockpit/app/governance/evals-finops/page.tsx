import { CockpitShell } from "../../cockpit-shell.tsx";
import { fetchEvalFinopsModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";
import { EvalsFinopsSurface } from "./evals-finops-surface.tsx";

export default async function EvalsFinopsGovernancePage() {
  const session = await requireRouteAccess("/governance/evals-finops");
  const model = await fetchEvalFinopsModel();

  return (
    <CockpitShell
      active="evals-finops"
      kicker="Governance"
      session={session}
      subtitle="Release quality, agent usage, cost posture, and deterministic optimization actions are shown as governed evidence."
      title="Evals + FinOps"
      toolbar={<GovernanceNav />}
    >
      <EvalsFinopsSurface model={model} />
    </CockpitShell>
  );
}

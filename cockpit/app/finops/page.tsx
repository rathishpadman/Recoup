import { PersonaFinopsSurface } from "../../components/finops/persona-finops-surface.tsx";
import { FinopsWorkspaceShell } from "../../components/finops/finops-workspace-shell.tsx";
import { defaultPersonaFinopsPeriod, parsePersonaFinopsPeriodDays } from "../../components/finops/persona-finops-period.ts";
import { fetchPersonaFinopsModel } from "../cockpit-data.ts";
import { requireBackendReadAuthHeaders } from "../backend-read-auth.ts";
import { requireDemoSession } from "../demo-auth.ts";

const scopeSubtitles = {
  cfo: "Consolidated Maya and David model pricing, token composition, cache usage, and deterministic workflow cost.",
  david: "Model pricing, token composition, cache usage, and deterministic workflow cost.",
  maya: "Model pricing, token composition, cache usage, and deterministic workflow cost."
} as const;

export default async function PersonaFinopsPage({ searchParams }: Readonly<{ searchParams: Promise<{ period?: string | string[] }> }>) {
  const periodDays = parsePersonaFinopsPeriodDays((await searchParams).period);
  const session = await requireDemoSession();
  const backendReadAuthHeaders = await requireBackendReadAuthHeaders([session.role], {
    body: "",
    method: "GET",
    path: "/persona-finops"
  });
  const model = await fetchPersonaFinopsModel(defaultPersonaFinopsPeriod(new Date(), periodDays), backendReadAuthHeaders);
  return (
    <FinopsWorkspaceShell heading="Agent cost engineering" session={session} support={scopeSubtitles[session.role]}>
      <PersonaFinopsSurface displayName={session.displayName} model={model} periodDays={periodDays} />
    </FinopsWorkspaceShell>
  );
}

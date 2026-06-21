import { CockpitShell, RecordStrip, StatusPill } from "../../cockpit-shell.tsx";
import { fetchTraceModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function TraceGovernancePage() {
  const session = await requireRouteAccess("/governance/trace");
  const model = await fetchTraceModel();

  return (
    <CockpitShell
      active="trace"
      kicker="Governance"
      session={session}
      subtitle="Audit trace events expose status, cited records, and deterministic basis for reviewer scrutiny."
      title="Trace"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Audit events</h2>
              <span>{String(model.events.length)} read-model entries</span>
            </div>
          </div>
          <div className="trace-list">
            {model.events.map((event) => (
              <div className="trace-row" key={event.id}>
                <div>
                  <strong>{event.label}</strong>
                  <span>{event.deterministicBasis}</span>
                </div>
                <StatusPill status={event.status} />
                <RecordStrip label={`${event.id} record IDs`} recordIds={event.recordIds} />
              </div>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

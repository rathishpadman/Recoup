import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { CockpitShell, RecordStrip, StatusPill } from "../../cockpit-shell.tsx";
import { fetchTraceModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function TraceGovernancePage() {
  const session = await requireRouteAccess("/governance/trace");
  const model = await fetchTraceModel();
  const eventKinds = new Set(model.events.map((event) => event.kind)).size;
  const citedRecords = new Set(model.events.flatMap((event) => event.recordIds)).size;

  return (
    <CockpitShell
      active="trace"
      kicker="Governance"
      session={session}
      subtitle="Audit trace events expose status, cited records, and deterministic basis for reviewer scrutiny."
      title="Trace"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface governance-workstation">
        <div className="governance-command-strip" aria-label="Trace governance posture">
          <div>
            <ClockCounterClockwise size={16} aria-hidden="true" />
            <span>Events</span>
            <strong>{String(model.events.length)}</strong>
          </div>
          <div>
            <GitBranch size={16} aria-hidden="true" />
            <span>Kinds</span>
            <strong>{String(eventKinds)}</strong>
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Cited records</span>
            <strong>{String(citedRecords)}</strong>
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Provenance</span>
            <strong>Displayed</strong>
          </div>
        </div>

        <div className="governance-split">
          <section className="surface-panel">
            <div className="section-heading">
              <div>
                <h2>Audit events</h2>
                <span>{String(model.events.length)} read-model entries</span>
              </div>
            </div>
            <div className="trace-list governance-table" aria-label="Audit trace events">
              <div className="governance-table-head trace-head">
                <span>Event</span>
                <span>Kind</span>
                <span>Status</span>
              </div>
              {model.events.map((event) => (
                <div className="trace-row governance-data-row" key={event.id}>
                  <div>
                    <strong>{event.label}</strong>
                    <span>
                      {event.entryType} | seq {String(event.sequence)}
                    </span>
                    <span className="trace-hash-line">Entry hash {event.entryHash}</span>
                    <span className="trace-hash-line">Previous hash {event.previousHash}</span>
                    <span>{event.deterministicBasis}</span>
                    <span>Provenance {event.provenance.replace(/_/gu, " ")}</span>
                    <span>Source {event.sourceMode.replace(/_/gu, " ")}</span>
                  </div>
                  <code>{event.kind}</code>
                  <StatusPill status={event.status} />
                  <RecordStrip label={`${event.id} record IDs`} recordIds={event.recordIds} />
                </div>
              ))}
            </div>
          </section>

          <aside className="governance-side-rail" aria-label="Trace policy evidence">
            <div className="governance-rail-section">
              <strong>Decision evidence</strong>
              <span>Trace rows keep deterministic basis and cited records visible before reviewer action.</span>
            </div>
            <div className="governance-rail-section">
              <strong>External action posture</strong>
              <span>Audit entries show proposed external actions remain draft-only and gated by human approval.</span>
            </div>
          </aside>
        </div>
      </section>
    </CockpitShell>
  );
}

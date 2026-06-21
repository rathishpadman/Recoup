import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { PulseIcon as Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { RealtimeQueryControls } from "../realtime-query-controls.tsx";
import { RunStream } from "../run-stream.tsx";
import { CockpitShell, RecordStrip, StatusPill } from "../cockpit-shell.tsx";
import { fetchForensicsModel, fetchTraceModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";

export default async function RunPage() {
  const session = await requireRouteAccess("/run");
  const [forensics, trace] = await Promise.all([fetchForensicsModel(), fetchTraceModel()]);

  return (
    <CockpitShell
      active="run"
      kicker="Maya workspace"
      session={session}
      subtitle="Watch the deterministic run trace, retrieval posture, and credential-gated realtime query loop without mixing in other personas."
      title="Run Trace"
    >
      <section className="route-grid run" aria-label="Run trace workspace">
        <section className="stream">
          <div className="section-heading">
            <div>
              <h2>
                <Pulse size={18} /> Live run events
              </h2>
              <span>SSE replay of the forensics trace</span>
            </div>
          </div>
          <RunStream />
          <div className="retrieval" aria-label="Retrieval status">
            {forensics.retrievalStatus.map((source) => (
              <span key={source.source}>
                {source.source}: {String(source.count)} {source.status ?? "ready"}
              </span>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>
                <Database size={18} /> Realtime evidence query
              </h2>
              <span>Safety identifier, policy basis, and cited records stay visible.</span>
            </div>
          </div>
          <RealtimeQueryControls />
        </section>

        <section className="audit-rail stream">
          <div className="section-heading">
            <div>
              <h2>
                <ClockCounterClockwise size={18} /> Audit context
              </h2>
              <span>{String(trace.events.length)} trace entries from read-only services</span>
            </div>
          </div>
          <ol>
            {trace.events.map((event) => (
              <li key={event.id}>
                <strong>{event.label}</strong>
                <StatusPill status={event.status} />
                <RecordStrip label={`${event.id} record IDs`} recordIds={event.recordIds} />
                <code>{event.deterministicBasis}</code>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </CockpitShell>
  );
}

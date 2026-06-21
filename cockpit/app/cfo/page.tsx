import { BriefcaseIcon as Briefcase } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { CockpitShell, Metric } from "../cockpit-shell.tsx";
import { fetchCfoModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";

export default async function CfoPage() {
  const session = await requireRouteAccess("/cfo");
  const model = await fetchCfoModel();

  return (
    <CockpitShell
      active="cfo"
      kicker="Executive readout"
      session={session}
      subtitle="A compact board view of deterministic recovery posture, open proof dependencies, and governed AI readiness."
      title="CFO Cockpit"
    >
      <section className="summary-grid" aria-label="Board metric strip">
        {model.metrics.map((metric, index) => (
          <Metric
            icon={index === 0 ? <Briefcase size={18} /> : index === 1 ? <ShieldCheck size={18} /> : <ChartLineUp size={18} />}
            key={metric.label}
            label={metric.label}
            value={metric.value}
            {...(index === 0 ? { variant: "primary" as const } : {})}
          />
        ))}
      </section>

      <section className="route-grid executive" aria-label="CFO executive route">
        <section className="surface-panel executive-panel">
          <div className="section-heading">
            <div>
              <h2>Audit posture</h2>
              <span>Governed run state for internal demo readiness.</span>
            </div>
          </div>
          <div className="executive-strip">
            <div>
              <span>External writes</span>
              <strong>Blocked by HITL</strong>
            </div>
            <div>
              <span>Evidence spine</span>
              <strong>Hash-chained and cited</strong>
            </div>
            <div>
              <span>Runtime posture</span>
              <strong>Ready with proof gaps</strong>
            </div>
          </div>
          <div className="insight">
            <h3>What changed</h3>
            <p>{model.whatChanged}</p>
          </div>
          <div className="insight">
            <h3>AI insight</h3>
            <p>{model.aiInsight}</p>
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Open dependencies</h2>
              <span>Release blockers that need owner proof before a public demo.</span>
            </div>
          </div>
          <div className="dependency-list">
            {model.openDependencies.map((dependency) => (
              <span key={dependency}>{dependency}</span>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

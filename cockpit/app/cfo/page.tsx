import { CockpitShell } from "../cockpit-shell.tsx";
import { fetchCfoModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";
import { AuditVerifyChip } from "../premium-components.tsx";

export default async function CfoPage() {
  const session = await requireRouteAccess("/cfo");
  const model = await fetchCfoModel();

  return (
    <CockpitShell
      active="cfo"
      kicker="Executive readout / Read-only"
      session={session}
      subtitle="Board-pack view of deterministic recovery posture, proof dependencies, and governed AI readiness."
      title="CFO Readout"
      toolbar={
        <div className="readout-toolbar" aria-label="CFO readout status">
          {model.readoutStatusLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      }
    >
      <section className="cfo-report-meta" aria-label="CFO report metadata">
        {model.reportMetadata.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.valueLabel}</strong>
          </div>
        ))}
        <div>
          <span>{model.assurance.label}</span>
          <strong>{model.assurance.statusLabel}</strong>
        </div>
      </section>

      <section className="board-metric-ledger" aria-label="Board metric ledger">
        {model.boardMetrics.map((metric) => (
          <article key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.supportLabel}</small>
          </article>
        ))}
      </section>

      <section className="cfo-board-grid" aria-label="CFO executive route">
        <section className="surface-panel executive-panel board-readout cfo-audit-panel">
          <div className="section-heading cfo-audit-heading">
            <div>
              <h2>Audit posture</h2>
              <span>{model.auditPosture.summary.supportLabel}</span>
            </div>
            <AuditVerifyChip
              hash={model.provenance.auditHash}
              label="Board readout standard"
            />
          </div>
          <div className="audit-summary-row" aria-label="Overall audit posture">
            <span>Overall posture</span>
            <strong>{model.auditPosture.summary.status}</strong>
            <span>{model.auditPosture.recordCountLabel}</span>
          </div>
          <div className="control-ledger cfo-control-ledger">
            {model.auditPosture.controls.map((control) => (
              <div key={control.label}>
                <span>{control.label}</span>
                <strong>{control.value}</strong>
                <small>{control.supportLabel}</small>
              </div>
            ))}
          </div>
          <div className="board-proof-table cfo-proof-table" aria-label="Executive proof posture">
            <div>
              <span>Proof lane</span>
              <span>State</span>
              <span>Basis</span>
              <span>Records</span>
            </div>
            {model.auditPosture.evidenceRows.map((row) => (
              <div key={row.label}>
                <strong>{row.label}</strong>
                <span>{row.state}</span>
                <span>{row.basisLabel}</span>
                <span>{row.recordCountLabel}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel dependency-panel">
          <div className="section-heading">
            <div>
              <h2>Open dependencies</h2>
              <span>Owner proof required before public demo claims.</span>
            </div>
          </div>
          <div className="dependency-table cfo-dependency-table" aria-label="Open proof dependency table">
            <div className="dependency-row dependency-header">
              <span>Dependency</span>
              <span>Owner</span>
              <span>Timing</span>
              <span>Impact</span>
              <span>Status</span>
            </div>
            {model.dependencies.map((dependency) => (
              <div className="dependency-row" key={dependency.dependencyId}>
                <strong>{dependency.label}</strong>
                <span>{dependency.owner}</span>
                <span>{dependency.timing}</span>
                <span>{dependency.impact}</span>
                <span>{dependency.status}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel cfo-change-panel">
          <div className="section-heading">
            <div>
              <h2>What changed</h2>
              <span>{model.whatChanged}</span>
            </div>
          </div>
          <div className="cfo-change-table" aria-label="CFO change ledger">
            <div>
              <span>Movement</span>
              <span>Value</span>
              <span>Posture</span>
              <span>Support</span>
            </div>
            {model.changeLedger.map((row) => (
              <div key={row.label}>
                <strong>{row.label}</strong>
                <span>{row.value}</span>
                <span>{row.postureLabel}</span>
                <span>{row.supportLabel}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel cfo-insight-panel">
          <div className="insight cfo-ai-readout">
            <div className="cfo-insight-heading">
              <h3>AI insight</h3>
              <span>{model.insightReadout.posture}</span>
            </div>
            <strong>{model.insightReadout.title}</strong>
            <p>{model.aiInsight}</p>
            <dl>
              <div>
                <dt>Basis</dt>
                <dd>{model.insightReadout.basisLabel}</dd>
              </div>
              <div>
                <dt>Source systems</dt>
                <dd>{model.provenance.sourceSystems.join(" / ")}</dd>
              </div>
            </dl>
          </div>
        </section>

        <footer className="provenance-footer cfo-provenance-footer">
          <span>Provenance</span>
          <strong>{model.provenance.sourceLabel}</strong>
          <span>{model.provenance.dataBasisLabel}</span>
          <span>{model.provenance.actionPosture}</span>
          <span>{model.provenance.sourceSystemCountLabel}</span>
        </footer>
      </section>
    </CockpitShell>
  );
}

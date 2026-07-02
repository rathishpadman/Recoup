import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/ssr/Funnel";
import { SquaresFourIcon as SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { ApprovalControls } from "../approval-controls.tsx";
import { requireMayaBackendReadAuthHeaders } from "../backend-read-auth.ts";
import { CockpitShell, RecordStrip } from "../cockpit-shell.tsx";
import { fetchConnectorReadinessModel, fetchForensicsModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";
import { AuditVerifyChip, MultimodalDock, ToolStatusRail } from "../premium-components.tsx";

export default async function ForensicsPage() {
  const session = await requireRouteAccess("/forensics");
  const backendReadAuthHeaders = await requireMayaBackendReadAuthHeaders();
  const [model, connectors] = await Promise.all([
    fetchForensicsModel(backendReadAuthHeaders),
    fetchConnectorReadinessModel(backendReadAuthHeaders)
  ]);
  const selectedWorkItem = model.worklist.find((item) => item.lineIds.includes(model.selected.lineId)) ?? model.worklist[0];

  return (
    <CockpitShell
      active="forensics"
      kicker="Recoup / Deductions / Forensics"
      prelude={<ToolStatusRail connectors={connectors} />}
      session={session}
      subtitle="Work item list, cited evidence, sub-agent proof, and human-gated recovery drafts."
      title="Recoup deduction forensics"
      titleAccessory={<span className="journey-chip">Maya journey</span>}
      toolbar={
        <div className="toolbar" aria-label="Forensics tools">
          <button aria-label="Refresh run" title="Refresh run" type="button">
            <ArrowClockwise size={18} />
          </button>
          <button aria-label="Filter worklist" title="Filters" type="button">
            <Funnel size={18} />
            <span>Filters</span>
          </button>
          <button aria-label="Saved views" title="Views" type="button">
            <SquaresFour size={18} />
            <span>Views</span>
          </button>
          <button aria-label="Export work item packet" title="Export" type="button">
            <DownloadSimple size={18} />
            <span>Export</span>
          </button>
        </div>
      }
    >
      <section className="work-item-metric-ledger" aria-label="Recovery summary">
        {model.kpiStrip.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.support}</small>
          </div>
        ))}
      </section>

      <section className="route-grid forensics workbench-grid" aria-label="Maya deduction recovery route">
        <section className="worklist forensic-worklist">
          <div className="section-heading">
            <div>
              <h2>Work item list</h2>
              <span>{String(model.worklist.length)} cases from the settlement run</span>
            </div>
          </div>
          <div className="workspace-table-scroll">
            <div className="data-table" role="table" aria-label="Deduction worklist">
              <div className="table-row table-head" role="row">
                <span role="columnheader">Work item</span>
                <span role="columnheader">Reason</span>
                <span role="columnheader">Exposure</span>
                <span role="columnheader">Evidence</span>
                <span role="columnheader">Queue</span>
              </div>
              {model.worklist.map((item) => {
                const isSelected = item.lineIds.includes(model.selected.lineId);

                return (
                  <div className="table-row work-row" aria-selected={isSelected} key={item.lineId} role="row">
                    <div className="work-item-cell" role="cell">
                      <strong>{item.workItemId}</strong>
                      <span>{item.customerLabel}</span>
                    </div>
                    <span className="account-cell" role="cell">
                      <span>{item.deductionReason}</span>
                    </span>
                    <span className="amount" role="cell">
                      {item.amount}
                    </span>
                    <span className="evidence-score-cell" role="cell">
                      <strong>{item.evidenceScoreLabel}</strong>
                      <span>cited</span>
                    </span>
                    <span className="queue-cell" role="cell">
                      {item.queueLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="decision-console dossier-workbench" id="selected-line" aria-label="Selected deduction decision">
          <div className="section-heading">
            <div>
              <h2>{selectedWorkItem?.workItemId ?? model.selected.lineId}</h2>
              <span>{selectedWorkItem?.deductionReason ?? "Selected deduction"}</span>
            </div>
            <span className="review-state">{model.selected.draft.statusLabel}</span>
          </div>

          <div className="case-tabbar" aria-label="Selected work item sections">
            <span aria-current="page">Overview</span>
            <span>Evidence {String(model.selected.evidencePack.documents.length)}</span>
            <span>Journey</span>
            <span>Decision</span>
            <span>Audit</span>
          </div>

          <div className="case-snapshot case-meta-row">
            <div>
              <span>Customer</span>
              <strong>{selectedWorkItem?.customerLabel ?? "Selected account"}</strong>
            </div>
            <div>
              <span>Selected line</span>
              <strong>{model.selected.lineId}</strong>
            </div>
            <div>
              <span>Exposure</span>
              <strong className="amount">{model.selected.draft.amount}</strong>
            </div>
            <div>
              <span>Decision</span>
              <strong>{selectedWorkItem?.verdictLabel ?? "Recovery"}</strong>
            </div>
          </div>

          <section className="next-best-action flagship-action dossier-band" aria-label="Selected work item overview">
            <h3>What happened</h3>
            <div className="action-summary">
              <strong>Stage the recovery draft for human review.</strong>
              <span>{model.selected.draft.basis}</span>
            </div>
            <div className="action-paths">
              <span>{model.selected.draft.actionLabel}</span>
              <span>Amount: {model.selected.draft.amount}</span>
            </div>
          </section>

          <section className="evidence dossier-band" aria-label="Evidence dossier">
            <h3>Evidence pack</h3>
            <div className="evidence-summary-grid">
              <span>
                <strong>{String(model.selected.evidencePack.documents.length)}</strong>
                cited documents
              </span>
              <span>
                <strong>{String(model.selected.evidencePack.recordIds.length)}</strong>
                record IDs
              </span>
              <span>
                <strong>pending human</strong>
                dispatch state
              </span>
            </div>
            <RecordStrip label="Selected line record IDs" recordIds={model.selected.evidencePack.recordIds} />
            <div className="evidence-dossier" role="table" aria-label="Key evidence">
              <div className="evidence-dossier-row evidence-dossier-head" role="row">
                <span role="columnheader">Artifact</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">Description</span>
                <span role="columnheader">Cite</span>
                <span role="columnheader">Rel.</span>
                <span role="columnheader">Check</span>
              </div>
              {model.selected.evidencePack.documents.map((document) => (
                <div className="evidence-dossier-row" key={document.documentId} role="row">
                  <strong role="cell">{document.documentId}</strong>
                  <span role="cell">{document.sourceLabel}</span>
                  <span role="cell">{document.description}</span>
                  <code role="cell">{document.citationId}</code>
                  <span role="cell">{document.relevance}</span>
                  <span role="cell">{document.verifiedLabel}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="maya-journey dossier-band" aria-label="Maya journey">
            <h3>Maya journey</h3>
            <ol>
              {model.mayaJourney.map((step) => (
                <li key={`${step.label}-${step.timestamp}`}>
                  <span className="journey-node" aria-hidden="true" />
                  <div>
                    <span>{step.timestamp}</span>
                    <strong>{step.label}</strong>
                    <em>{step.status}</em>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="draft priority-draft dossier-band" aria-label="Human approval gate">
            <div className="draft-footer">
              <div>
                <h3>Human approval</h3>
                <span>Evidence is opened before any external dispatch can continue.</span>
              </div>
              <strong className="amount">{model.selected.draft.amount}</strong>
            </div>
            <ApprovalControls actionId={model.selected.draft.actionId} actions={model.selected.approvalActions} />
          </section>
        </section>

        <aside className="agent-sidecar" aria-label="Maya agent operations">
          <MultimodalDock dock={model.multimodalDock} recordIds={model.selected.evidencePack.recordIds} />
          <AuditVerifyChip
            hash="pending until human decision"
            label="Recovery draft gate"
            recordIds={model.selected.evidencePack.recordIds}
            state="pending_human"
          />
          <section className="inbox compact-inbox containment-brief" aria-label={model.containmentPanel.statusLabel}>
            <h3>{model.containmentPanel.statusLabel}</h3>
            <div className="inbox-row">
              <span>{model.containmentPanel.customerLabel}</span>
              <strong>{model.containmentPanel.intentLabel}</strong>
              <span>{model.containmentPanel.postureLabel}</span>
            </div>
            <div className="inbox-row">
              <span>{model.containmentPanel.handoff.label}</span>
              <strong>{model.containmentPanel.handoff.target}</strong>
              <span>{model.containmentPanel.handoff.status}</span>
            </div>
            {model.containmentPanel.basisRows.map((row) => (
              <div className="inbox-row" key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
            <p>{model.containmentPanel.componentReadoutLabel}</p>
            <p>{model.containmentPanel.actionPostureLabel}</p>
            <RecordStrip label={model.containmentPanel.recordStripLabel} recordIds={model.containmentPanel.recordIds} />
          </section>
          <div className="inbox compact-inbox">
            <h3>Action inbox</h3>
            {model.actionInbox.slice(0, 3).map((action) => (
              <div className="inbox-row" key={action.actionId}>
                <span>{action.lineId}</span>
                <strong>{action.actionLabel}</strong>
                <span className="amount">{action.amount}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </CockpitShell>
  );
}

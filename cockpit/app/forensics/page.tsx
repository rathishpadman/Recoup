import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { FileTextIcon as FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/ssr/Funnel";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { TrayIcon as Tray } from "@phosphor-icons/react/dist/ssr/Tray";
import { ApprovalControls } from "../approval-controls.tsx";
import { CockpitShell, GovernanceBadge, Metric, RecordStrip, StatusPill } from "../cockpit-shell.tsx";
import { fetchForensicsModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";

export default async function ForensicsPage() {
  const session = await requireRouteAccess("/forensics");
  const model = await fetchForensicsModel();
  const selectedLine = model.worklist.find((item) => item.lineId === model.selected.lineId) ?? model.worklist[0];

  return (
    <CockpitShell
      active="forensics"
      kicker="Maya workspace"
      session={session}
      subtitle="Recover invalid deductions from a deterministic evidence pack, with every external action held for human approval."
      title="Deduction Forensics"
      toolbar={
        <div className="toolbar" aria-label="Forensics tools">
          <button aria-label="Refresh run" title="Refresh run" type="button">
            <ArrowClockwise size={18} />
          </button>
          <button aria-label="Filter worklist" title="Filter worklist" type="button">
            <Funnel size={18} />
          </button>
        </div>
      }
    >
      <section className="summary-grid" aria-label="Recovery summary">
        <Metric
          delta={`${String(model.recoveryTracker.recoveryLines)} recovery lines`}
          drillDown="Open recovery queue"
          icon={<ChartLineUp size={18} />}
          label="Projected recovery"
          value={model.recoveryTracker.projectedRecovery}
          variant="primary"
        />
        <Metric
          delta={`${String(model.recoveryTracker.billingLines)} prevention drafts`}
          icon={<ShieldCheck size={18} />}
          label="Billing protection"
          value={model.recoveryTracker.projectedBilling}
        />
        <Metric icon={<Tray size={18} />} label="Gross scope" value={model.recoveryTracker.totalExposure} />
        <Metric icon={<FileText size={18} />} label="Evidence sources" value={String(model.retrievalStatus.length)} />
      </section>

      <section className="route-grid forensics" aria-label="Maya deduction recovery route">
        <section className="worklist">
          <div className="section-heading">
            <div>
              <h2>Worklist</h2>
              <span>{String(model.worklist.length)} pre-triaged deductions</span>
            </div>
          </div>
          <div className="workspace-table-scroll">
            <div className="data-table" role="table" aria-label="Deduction worklist">
              <div className="table-row table-head" role="row">
                <span role="columnheader">Line</span>
                <span role="columnheader">Scenario</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Verdict</span>
                <span role="columnheader">Confidence</span>
                <span role="columnheader">Next action</span>
              </div>
              {model.worklist.map((item) => {
                const isSelected = item.lineId === model.selected.lineId;

                return (
                  <div className="table-row work-row" aria-selected={isSelected} key={item.lineId} role="row">
                    <div role="cell">
                      <strong>{item.lineId}</strong>
                      <span>{item.customerId ?? item.routing ?? "synthetic seed 42"}</span>
                    </div>
                    <span role="cell">{item.scenarioType}</span>
                    <span className="amount" role="cell">
                      {item.amount}
                    </span>
                    <span className="verdict-cell" role="cell">
                      <StatusPill status={item.verdict} />
                    </span>
                    <GovernanceBadge value={item.confidence} />
                    <span className="next-action-cell" role="cell">
                      {isSelected ? (
                        <span className="next-action-muted">Selected</span>
                      ) : (
                        <a className="next-action" href="#selected-line" aria-label={`Review selected ${item.lineId}`}>
                          Review <ArrowRight size={13} />
                        </a>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="decision-console" id="selected-line" aria-label="Selected deduction decision">
          <div className="section-heading">
            <div>
              <h2>{selectedLine?.lineId ?? model.selected.lineId}</h2>
              <span>Deterministic basis plus cited documents</span>
            </div>
            <StatusPill status={model.selected.draft.status} />
          </div>

          <div className="next-best-action flagship-action">
            <h3>Next-best-action</h3>
            <div className="action-summary">
              <strong>Stage the recovery draft for human review.</strong>
              <span>{model.selected.draft.basis}</span>
            </div>
            <div className="action-paths">
              <span>Draft action: {model.selected.draft.actionType}</span>
              <span>Amount: {model.selected.draft.amount}</span>
            </div>
          </div>

          <div className="draft priority-draft">
            <div className="draft-footer">
              <div>
                <h3>Human approval</h3>
                <span>External dispatch is blocked until a reviewer decides.</span>
              </div>
              <strong className="amount">{model.selected.draft.amount}</strong>
            </div>
            <ApprovalControls actionId={model.selected.draft.actionId} />
          </div>

          <div className="evidence">
            <h3>Evidence pack</h3>
            <RecordStrip label="Selected line record IDs" recordIds={model.selected.evidencePack.recordIds} />
            {model.selected.evidencePack.documents.map((document) => (
              <div className="evidence-row" key={document.documentId}>
                <strong>{document.documentType}</strong>
                <p>{document.summary}</p>
                <code>{document.documentId}</code>
              </div>
            ))}
          </div>

          <div className="inbox">
            <h3>Action inbox</h3>
            {model.actionInbox.slice(0, 5).map((action) => (
              <div className="inbox-row" key={action.actionId}>
                <span>{action.lineId}</span>
                <strong>{action.actionType}</strong>
                <span className="amount">{action.amount}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

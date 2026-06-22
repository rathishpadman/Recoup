import type { CSSProperties } from "react";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { CockpitShell, RecordStrip, StatusPill } from "../cockpit-shell.tsx";
import { fetchCreditModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";
import { AuditVerifyChip, NegotiationGraph } from "../premium-components.tsx";
import { ApprovalControls } from "../approval-controls.tsx";

export default async function CreditPage() {
  const session = await requireRouteAccess("/credit");
  const model = await fetchCreditModel();

  return (
    <CockpitShell
      active="credit"
      kicker="Recoup / Credit Arbitration / David"
      session={session}
      subtitle="Sentinel arbitration for Harbor with deterministic score, cited records, and draft-only human approval."
      title="Credit Arbitration"
      toolbar={
        <div className="readout-toolbar credit-readout-toolbar" aria-label="Credit readout controls">
          {model.readoutStatusLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      }
    >
      <div className="credit-arbitration-workstation">
        <section className="account-360-panel credit-account-command" aria-label="Harbor account command header">
          <div className="credit-account-topline">
            <div className="credit-account-title">
              <span>Account-360</span>
              <strong>{model.account.customerLabel}</strong>
              <StatusPill status={model.arbitration.status} />
            </div>
            <button type="button">View Account-360</button>
          </div>
          <div className="credit-identity-grid" aria-label="Account identifiers">
            {model.account.detailRows.map((row) => (
              <span key={row.label}>
                <small>{row.label}</small>
                <strong>{row.value}</strong>
              </span>
            ))}
          </div>
          <div className="account-360-stats credit-command-summary" aria-label="Credit arbitration summary">
            {model.account.summaryRows.map((row) => (
              <span key={row.label}>
                <strong>{row.value}</strong>
                {row.label}
              </span>
            ))}
            <span className="credit-sparkline" aria-label="Sentinel drift trend">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>
        </section>

        <section className="sentinel-alert credit-alert-band" aria-label="Credit Sentinel alert">
          <ShieldWarning size={20} />
          <strong>{model.sentinel.displayReason}</strong>
          <p>{model.sentinel.alertDetail}</p>
          <div className="alert-signal-grid">
            {model.sentinel.signals.map((signal) => (
              <span key={signal.label}>
                {signal.label}
                <strong>{signal.value}</strong>
              </span>
            ))}
            {model.sentinel.detailRows.map((row) => (
              <span key={row.label}>
                {row.label}
                <strong>{row.value}</strong>
              </span>
            ))}
          </div>
          <button type="button">View lien details</button>
          <RecordStrip label={model.sentinel.recordStripLabel} recordIds={model.sentinel.recordIds} />
        </section>

        <section className="route-grid resolve credit-command-grid" aria-label="David credit route">
          <section className="surface-panel credit-score-panel partial-hold-visualizer">
            <div className="section-heading">
              <div>
                <h2>Partial hold release workbench</h2>
                <span>{model.partialHold.basis}</span>
              </div>
              <button type="button">Inspect basis</button>
            </div>
            <div className="score-hero-grid" aria-label={model.partialHold.scoreReadout.ariaLabel}>
              <div className="score-hero">
                <strong>{model.partialHold.scoreReadout.value}</strong>
                <span>{model.partialHold.scoreReadout.label}</span>
                <em>{model.partialHold.scoreReadout.stateLabel}</em>
                <small className="score-basis-note">{model.partialHold.scoreReadout.basisLabel}</small>
              </div>
              <div className="release-lane" aria-label={model.partialHold.releaseReadout.ariaLabel}>
                <strong>{model.partialHold.releaseReadout.value}</strong>
                <span>{model.partialHold.releaseReadout.label}</span>
                <small>{model.partialHold.releaseReadout.supportLabel}</small>
              </div>
              <div className="split-readout">
                {model.partialHold.splitRows.map((row) => (
                  <span key={row.label}>
                    <strong>{row.value}</strong>
                    {row.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="score-ledger credit-split-ledger" aria-label="Release and hold split">
              {model.partialHold.ledgerRows.map((row) => (
                <div className="score-ledger-row" key={`${row.left.label}-${row.right.label}`}>
                  <span>{row.left.label}</span>
                  <strong>{row.left.value}</strong>
                  <span>{row.right.label}</span>
                  <strong>{row.right.value}</strong>
                </div>
              ))}
            </div>
            <div className="criteria-table weighted-criteria-table" aria-label={model.partialHold.criteriaAriaLabel}>
              <div>
                {model.partialHold.criteriaHeaders.map((header) => (
                  <span key={header}>{header}</span>
                ))}
              </div>
              {model.partialHold.criteria.map((criterion) => (
                <div key={criterion.label}>
                  <strong>{criterion.label}</strong>
                  <span>{criterion.weight}</span>
                  <span className="criterion-score-cell">
                    <span className="criterion-bar" aria-hidden="true">
                      <span style={criterionBarStyle(criterion.score)} />
                    </span>
                    <strong>{criterion.score}</strong>
                  </span>
                  <span>{criterion.contribution}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="decision-console credit-action-packet">
            <div className="section-heading">
              <div>
                <h2>Proactive terms action packet</h2>
                <span>{model.termProposal.summaryLabel}</span>
              </div>
              <span className="ready-state">{model.termProposal.readyStateLabel}</span>
            </div>
            <div className="terms-packet action-packet-list">
              {model.termProposal.packetRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
              <p>{model.termProposal.basis}</p>
            </div>
            <div className="packet-command-row" aria-label="Terms packet commands">
              {model.termProposal.commandLabels.map((label) => (
                <button key={label} type="button">
                  {label}
                </button>
              ))}
            </div>
            <div className="credit-action-table" aria-label="Human approval action packet">
              {model.approvalInbox.map((item) => (
                <div className="credit-action-decision-row" key={item.actionId}>
                  <span className="credit-action-type">
                    <strong>{item.actionLabel}</strong>
                    <small>{item.statusLabel}</small>
                  </span>
                  <div className="credit-action-basis">
                    <span>{item.basis}</span>
                    <div className="credit-provenance-strip">
                      <RecordStrip label={item.recordStripLabel} recordIds={item.recordIds} />
                    </div>
                  </div>
                  <span className="credit-approval-cell">
                    <ApprovalControls actionId={item.actionId} />
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-panel credit-action-queue" aria-label="David action queue">
            <div className="section-heading">
              <div>
                <h2>David action queue</h2>
                <span>{model.actionQueueSummaryLabel}</span>
              </div>
            </div>
            <div className="action-queue-table">
              <div>
                <span>Priority</span>
                <span>Item</span>
                <span>Account</span>
                <span>Status</span>
                <span>Age</span>
                <span>Next step</span>
              </div>
              {model.actionQueue.map((item) => (
                <div key={`${item.priority}-${item.item}`}>
                  <strong>{item.priority}</strong>
                  <span>{item.item}</span>
                  <span>{item.account}</span>
                  <span>{item.status}</span>
                  <span>{item.age}</span>
                  <span>{item.nextStep}</span>
                </div>
              ))}
            </div>
            <AuditVerifyChip
              hash={model.audit.valid ? model.audit.chainHeadHash : "hash chain blocked"}
              label="Credit arbitration audit"
              recordIds={model.arbitration.recordIds}
              state={model.audit.valid ? "verified" : "blocked"}
            />
          </section>

          <NegotiationGraph credit={model} />
        </section>
      </div>
    </CockpitShell>
  );
}

function criterionBarStyle(score: string): CSSProperties {
  return { "--criterion-score": `${score}%` } as CSSProperties;
}

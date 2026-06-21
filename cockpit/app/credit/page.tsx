import { ScalesIcon as Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { ShieldWarningIcon as ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { CockpitShell, Metric, RecordStrip, StatusRow } from "../cockpit-shell.tsx";
import { fetchCreditModel } from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";

export default async function CreditPage() {
  const session = await requireRouteAccess("/credit");
  const model = await fetchCreditModel();

  return (
    <CockpitShell
      active="credit"
      kicker="David workspace"
      session={session}
      subtitle="Resolve the Harbor credit arbitration queue with score, reason codes, record IDs, and human approval blockers above the fold."
      title="Credit Arbitration"
    >
      <section className="summary-grid" aria-label="Credit arbitration summary">
        <Metric icon={<Scales size={18} />} label="Customer" value={model.customerId} variant="primary" />
        <Metric delta={model.partialHold.basis} icon={<TrendUp size={18} />} label="Composite score" value={model.partialHold.compositeScore} />
        <Metric label="Release ratio" value={model.partialHold.releaseRatioPercent} />
        <Metric icon={<ShieldWarning size={18} />} label="Audit entries" value={String(model.audit.entries)} />
      </section>

      <section className="route-grid resolve" aria-label="David credit route">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Partial hold decision</h2>
              <span>Core-computed score and release ratio; no model dollars.</span>
            </div>
          </div>
          <div className="risk-board">
            <div>
              <span>Proposed release</span>
              <strong className="amount">{model.partialHold.proposedReleaseAmount}</strong>
            </div>
            <div>
              <span>Back-order hold</span>
              <strong className="amount">{model.partialHold.proposedBackOrderAmount}</strong>
            </div>
            <div>
              <span>Terms proposal</span>
              <strong>{model.termProposal.terms}</strong>
            </div>
          </div>
          <div className="decision-list">
            <StatusRow label="Sentinel blocker" status={model.sentinel.status} value={model.sentinel.reason} />
            <StatusRow label="Arbitration blocker" status={model.arbitration.status} value={model.arbitration.reason} />
            <StatusRow label="Term proposal" status={model.termProposal.status} value={model.termProposal.basis} />
          </div>
        </section>

        <section className="decision-console">
          <div className="section-heading">
            <div>
              <h2>Approval inbox</h2>
              <span>Human decision queue for credit and term actions.</span>
            </div>
          </div>
          <RecordStrip label="Sentinel record IDs" recordIds={model.sentinel.recordIds} />
          <RecordStrip label="Arbitration record IDs" recordIds={model.arbitration.recordIds} />
          <div className="inbox">
            {model.approvalInbox.map((item) => (
              <div className="inbox-row" key={item.actionId}>
                <span>{item.actionId}</span>
                <strong>{item.actionType}</strong>
                <span>{item.status}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

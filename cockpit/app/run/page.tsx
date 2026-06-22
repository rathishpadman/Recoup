import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { FileIcon as File } from "@phosphor-icons/react/dist/ssr/File";
import { PulseIcon as Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { RealtimeQueryControls } from "../realtime-query-controls.tsx";
import { RunStream } from "../run-stream.tsx";
import { CockpitShell, RecordStrip, StatusPill } from "../cockpit-shell.tsx";
import {
  fetchConnectorReadinessModel,
  fetchForensicsModel,
  fetchTraceModel,
  type TraceCockpitModel,
  type WorklistItem
} from "../cockpit-data.ts";
import { requireRouteAccess } from "../demo-auth.ts";
import { AgentTraceVisualizer, ToolStatusRail } from "../premium-components.tsx";

export default async function RunPage() {
  const session = await requireRouteAccess("/run");
  const [forensics, trace, connectors] = await Promise.all([
    fetchForensicsModel(),
    fetchTraceModel(),
    fetchConnectorReadinessModel()
  ]);
  const citedRecordCount = new Set(trace.events.flatMap((event) => event.recordIds)).size;
  const selectedScenario =
    forensics.worklist.find((item) => item.lineIds.includes(forensics.selected.lineId)) ?? forensics.worklist[0];
  const evidenceDocumentCount = forensics.selected.evidencePack.documents.length;
  const citedDecisionRecordCount = forensics.selected.evidencePack.recordIds.length;

  return (
    <CockpitShell
      active="run"
      kicker="Recoup / Deductions / Forensics"
      prelude={<ToolStatusRail connectors={connectors} />}
      session={session}
      subtitle="Cited evidence, recovery draft posture, and human approval state for Maya's active deduction run."
      title="Recoup deduction forensics"
    >
      <section className="run-command-ledger" aria-label="Maya run dossier summary">
        <article>
          <span>Scenario</span>
          <strong>{scenarioDisplayLabel(selectedScenario)}</strong>
          <small>{selectedScenario?.customerLabel ?? "Selected customer"}</small>
        </article>
        <article>
          <span>Exposure</span>
          <strong>{selectedScenario?.amount ?? "Review amount"}</strong>
          <small>{String(selectedScenario?.lineCount ?? 1)} lines in scope</small>
        </article>
        <article>
          <span>Reason</span>
          <strong>{scenarioReasonLabel(selectedScenario)}</strong>
          <small>{selectedScenario?.routingLabel ?? "Reviewer queue"}</small>
        </article>
        <article>
          <span>Evidence</span>
          <strong>{selectedScenario?.confidenceLabel ?? "Cited"}</strong>
          <small>
            {String(evidenceDocumentCount)} docs, {String(citedDecisionRecordCount)} records
          </small>
        </article>
        <article>
          <span>Recovery action</span>
          <strong>{forensics.selected.draft.actionLabel}</strong>
          <small>{forensics.selected.draft.amount}</small>
        </article>
        <article>
          <span>Human decision</span>
          <strong>{forensics.selected.draft.statusLabel}</strong>
          <small>{String(citedRecordCount)} review records</small>
        </article>
      </section>

      <section className="run-console-layout" aria-label="Maya recovery run workspace">
        <div className="run-workarea">
          <section className="route-grid run run-work-grid" aria-label="Deduction recovery dossier">
            <section className="surface-panel run-scenario-panel">
              <div className="section-heading">
                <div>
                  <h2>
                    <Pulse size={18} /> Scenario worklist ({String(forensics.worklist.length)})
                  </h2>
                  <span>Ranked recovery scenarios with cited evidence posture.</span>
                </div>
              </div>
              <div className="run-scenario-table" role="table" aria-label="Run scenario worklist">
                <div className="run-scenario-row head" role="row">
                  <span role="columnheader">#</span>
                  <span role="columnheader">Scenario</span>
                  <span role="columnheader">Recovery signal</span>
                </div>
                {forensics.worklist.map((item, index) => (
                  <div
                    aria-current={item.lineIds.includes(forensics.selected.lineId) ? "true" : undefined}
                    className="run-scenario-row"
                    key={item.scenarioId}
                    role="row"
                  >
                    <span role="cell">{String(index + 1)}</span>
                    <div role="cell">
                      <strong>{scenarioDisplayLabel(item)}</strong>
                      <span>{item.customerLabel}</span>
                      <small>{scenarioReasonLabel(item)}</small>
                    </div>
                    <div role="cell">
                      <span>{item.confidenceLabel}</span>
                      <small>
                        {item.evidenceLabel} / {item.queueLabel}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
              <div className="run-review-feed" aria-label="Live review feed">
                <div>
                  <strong>Live review feed</strong>
                  <span>Recovery activity</span>
                </div>
                <RunStream />
              </div>
            </section>

            <section className="surface-panel run-trace-panel">
              <div className="run-case-heading">
                <div>
                  <span>Active recovery dossier</span>
                  <h2>{scenarioDisplayLabel(selectedScenario)}</h2>
                  <p>
                    {selectedScenario?.customerLabel ?? "Selected account"} / {scenarioReasonLabel(selectedScenario)}
                  </p>
                </div>
                <StatusPill status={forensics.selected.draft.status} />
              </div>
              <div className="run-dossier-tabs" aria-label="Run dossier tabs">
                <span aria-current="true">Overview</span>
                <span>Evidence ({String(evidenceDocumentCount)})</span>
                <span>Decision</span>
                <span>Timeline</span>
              </div>
              <div className="run-dossier-summary" aria-label="Selected run dossier">
                <div>
                  <span>Exposure</span>
                  <strong>{selectedScenario?.amount ?? "Review amount"}</strong>
                </div>
                <div>
                  <span>Recovery line</span>
                  <strong>{selectedScenario?.customerLabel ?? "Selected account"}</strong>
                </div>
                <div>
                  <span>Evidence posture</span>
                  <strong>{selectedScenario?.confidenceLabel ?? "Cited evidence"}</strong>
                </div>
                <div>
                  <span>Draft amount</span>
                  <strong>{forensics.selected.draft.amount}</strong>
                </div>
              </div>
              <section className="run-what-happened" aria-label="Run scenario explanation">
                <h3>What happened</h3>
                <p>
                  {scenarioReasonLabel(selectedScenario)} is staged for recovery review against{" "}
                  {String(evidenceDocumentCount)} cited source documents. Maya has a draft action ready, but the
                  action stays in human review before anything external can dispatch.
                </p>
              </section>
              <section className="run-evidence-summary" aria-label="Run evidence summary">
                {forensics.retrievalStatus.map((source) => (
                  <article key={source.source}>
                    <File size={16} />
                    <div>
                      <strong>{String(source.count)}</strong>
                      <span>{source.source} retrievals</span>
                    </div>
                  </article>
                ))}
                <article>
                  <ShieldCheck size={16} />
                  <div>
                    <strong>{String(citedDecisionRecordCount)}</strong>
                    <span>Cited decision records</span>
                  </div>
                </article>
              </section>
              <div className="run-evidence-table" role="table" aria-label="Run evidence detail">
                <div className="run-evidence-row head" role="row">
                  <span role="columnheader">Artifact</span>
                  <span role="columnheader">Source</span>
                  <span role="columnheader">Citation</span>
                  <span role="columnheader">Verified</span>
                </div>
                {forensics.selected.evidencePack.documents.map((document) => (
                  <div className="run-evidence-row" key={document.documentId} role="row">
                    <div role="cell">
                      <strong>{document.documentType}</strong>
                    <span>{evidenceSummaryLabel(document.summary)}</span>
                    </div>
                    <span role="cell">{document.sourceLabel}</span>
                    <code role="cell">{document.citationId}</code>
                    <span role="cell">{document.verifiedLabel}</span>
                  </div>
                ))}
              </div>
              <section className="run-journey-strip" aria-label="Maya journey checkpoints">
                <div>
                  <h3>Maya journey</h3>
                  <span>{String(forensics.mayaJourney.length)} checkpoints</span>
                </div>
                <ol>
                  {forensics.mayaJourney.map((step) => (
                    <li key={`${step.label}-${step.timestamp}`}>
                      <span>{journeyStatusLabel(step.status)}</span>
                      <strong>{step.label}</strong>
                      <small>{step.timestamp}</small>
                    </li>
                  ))}
                </ol>
              </section>
              <details className="run-trace-secondary">
                <summary>
                  <span>
                    <ClockCounterClockwise size={16} /> Trace lanes
                  </span>
                  <strong>{String(trace.events.length)} review steps</strong>
                </summary>
                <AgentTraceVisualizer trace={trace} />
              </details>
              <details className="run-audit-secondary">
                <summary>
                  <span>Audit checkpoint</span>
                  <strong>{String(trace.events.length)} review trail</strong>
                </summary>
                <div className="run-audit-table integrated" role="table" aria-label="Run audit ledger">
                  <div className="run-audit-row head" role="row">
                    <span role="columnheader">Checkpoint</span>
                    <span role="columnheader">Status</span>
                    <span role="columnheader">Business basis</span>
                    <span role="columnheader">Citations</span>
                  </div>
                  {trace.events.map((event) => (
                    <div className="run-audit-row" key={event.id} role="row">
                      <strong role="cell">{auditStepTitle(event)}</strong>
                      <StatusPill status={event.status} />
                      <span role="cell">{auditBasisLabel(event)}</span>
                      <details className="run-record-details" role="cell">
                        <summary>{String(event.recordIds.length)} records</summary>
                        <RecordStrip label={`${event.id} citations`} recordIds={event.recordIds} />
                      </details>
                    </div>
                  ))}
                </div>
              </details>
            </section>
          </section>
        </div>

        <aside className="surface-panel run-sidecar-panel" aria-label="Run agent and audit sidecar">
          <div className="section-heading">
            <div>
              <h2>
                <Database size={18} /> MultimodalDock
              </h2>
              <span>Evidence agents and reviewer state.</span>
            </div>
          </div>
          <div className="run-agent-stack" aria-label="Sub-agent completion state">
            {forensics.multimodalDock.subAgents.map((agent) => (
              <details className="run-agent-card" key={agent.name} open>
                <summary>
                  <strong>{agent.name}</strong>
                  <span className="run-agent-state">{agent.statusLabel}</span>
                </summary>
                <dl>
                  <div>
                    <dt>Source</dt>
                    <dd>{agent.source}</dd>
                  </div>
                  <div>
                    <dt>Query</dt>
                    <dd>{agent.query}</dd>
                  </div>
                  <div>
                    <dt>Artifacts</dt>
                    <dd>{agent.artifacts}</dd>
                  </div>
                  <div>
                    <dt>Key artifact</dt>
                    <dd>{artifactDisplayLabel(agent.keyArtifact)}</dd>
                  </div>
                </dl>
                <span className="run-detail-affordance">View details</span>
              </details>
            ))}
          </div>
          <div className="run-policy-matrix" aria-label="Run policy gates">
            <div>
              <span>Session</span>
              <strong>Maya session</strong>
            </div>
            <div>
              <span>External action</span>
              <strong>Human approval</strong>
            </div>
            <div>
              <span>Output rule</span>
              <strong>Cited answers</strong>
            </div>
          </div>
          <div className="section-heading">
            <div>
              <h2>
                <Database size={18} /> Realtime evidence query
              </h2>
              <span>Answers stay tied to cited records.</span>
            </div>
          </div>
          <RealtimeQueryControls />
          <div className="run-sidecar-audit" aria-label="Sidecar audit checkpoint">
            <div>
              <strong>Audit checkpoint</strong>
              <span>{String(trace.events.length)} review steps</span>
            </div>
            {trace.events.map((event) => (
              <div key={`sidecar-${event.id}`}>
                <span>{auditSidecarLabel(event)}</span>
                <strong>{auditSidecarState(event)}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </CockpitShell>
  );
}

function auditStepTitle(event: TraceCockpitModel["events"][number]): string {
  if (event.id === "trace-riskmesh-harbor") {
    return "Credit hold checkpoint";
  }

  if (event.id === "trace-forensics-recovery") {
    return "Recovery handoff";
  }

  if (event.id === "trace-mcp-public-tools") {
    return "Tool boundary";
  }

  return event.label;
}

function auditBasisLabel(event: TraceCockpitModel["events"][number]): string {
  if (event.id === "trace-riskmesh-harbor") {
    return "Human hold remains required before credit action.";
  }

  if (event.id === "trace-forensics-recovery") {
    return "Recovery package is ready for reviewer decision.";
  }

  if (event.id === "trace-mcp-public-tools") {
    return "Read and draft tools stay approval-gated.";
  }

  return event.deterministicBasis;
}

function scenarioReasonLabel(item: WorklistItem | undefined): string {
  if (item === undefined) {
    return "Deduction review";
  }

  const normalized = item.scenarioType.toLowerCase();
  if (normalized.includes("shortage") && normalized.includes("pod")) {
    return "Shortage claim with signed POD";
  }

  if (normalized.includes("damaged") && normalized.includes("evidence")) {
    return "Damaged product, evidence received";
  }

  if (normalized.includes("valid") && normalized.includes("promo")) {
    return "Valid promo billed at list";
  }

  if (normalized.includes("otif") && normalized.includes("fine")) {
    return "OTIF fine review";
  }

  if (normalized.includes("pricing") && normalized.includes("chargeback")) {
    return "Pricing chargeback review";
  }

  if (normalized.includes("promo") && normalized.includes("overclaim")) {
    return "Promo overclaim review";
  }

  if (normalized.includes("duplicate")) {
    return "Duplicate deduction review";
  }

  return item.scenarioType.replace(/[-_]+/gu, " ");
}

function scenarioDisplayLabel(item: WorklistItem | undefined): string {
  if (item === undefined) {
    return "Deduction review";
  }

  const reason = scenarioReasonLabel(item);
  if (reason.includes("Shortage claim")) {
    return "Shortage POD review";
  }

  if (reason.includes("Damaged product")) {
    return "Damage evidence review";
  }

  if (reason.includes("Valid promo")) {
    return "Promo billing review";
  }

  if (reason.includes("OTIF")) {
    return "Service fine review";
  }

  if (reason.includes("Pricing")) {
    return "Pricing chargeback review";
  }

  if (reason.includes("Promo overclaim")) {
    return "Promotion overclaim review";
  }

  if (reason.includes("Duplicate")) {
    return "Duplicate deduction review";
  }

  return reason;
}

function evidenceSummaryLabel(summary: string): string {
  return summary.replace("POD-SIGNED-1", "the signed POD").replace("S3-L1", "the selected line");
}

function artifactDisplayLabel(artifact: string): string {
  if (artifact.startsWith("POD-")) {
    return "Signed POD proof";
  }

  if (artifact.startsWith("INV-")) {
    return "Invoice record";
  }

  if (artifact.toLowerCase().includes("no tpm")) {
    return "No TPM match required";
  }

  return artifact.replace(/[-_]+/gu, " ");
}

function auditSidecarLabel(event: TraceCockpitModel["events"][number]): string {
  if (event.id === "trace-riskmesh-harbor") {
    return "Hold checkpoint";
  }

  if (event.id === "trace-forensics-recovery") {
    return "Recovery package";
  }

  if (event.id === "trace-mcp-public-tools") {
    return "Tool access";
  }

  return auditStepTitle(event);
}

function auditSidecarState(event: TraceCockpitModel["events"][number]): string {
  if (event.id === "trace-riskmesh-harbor") {
    return "Held for reviewer";
  }

  if (event.id === "trace-forensics-recovery") {
    return "Draft ready";
  }

  if (event.id === "trace-mcp-public-tools") {
    return "Gated";
  }

  return event.status.replace(/_/gu, " ");
}

function journeyStatusLabel(status: string): string {
  if (status.toLowerCase().includes("pending")) {
    return "Pending";
  }

  if (status.toLowerCase().includes("complete")) {
    return "Done";
  }

  return status;
}

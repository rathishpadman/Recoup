import type { ReactNode } from "react";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { BriefcaseIcon as Briefcase } from "@phosphor-icons/react/dist/ssr/Briefcase";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { CircuitryIcon as Circuitry } from "@phosphor-icons/react/dist/ssr/Circuitry";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr/ClockCounterClockwise";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { FileTextIcon as FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { FunnelIcon as Funnel } from "@phosphor-icons/react/dist/ssr/Funnel";
import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { GraphIcon as Graph } from "@phosphor-icons/react/dist/ssr/Graph";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { ScalesIcon as Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { TrayIcon as Tray } from "@phosphor-icons/react/dist/ssr/Tray";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { WarningIcon as Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { ApprovalControls } from "./approval-controls.tsx";
import { GovernanceTabs } from "./governance-tabs.tsx";
import { RealtimeQueryControls } from "./realtime-query-controls.tsx";
import { RunStream } from "./run-stream.tsx";

const apiBaseUrl = process.env.RECOUP_API_URL ?? "http://127.0.0.1:4317";

interface ForensicsCockpitModel {
  surface: "forensics-analyst";
  worklist: WorklistItem[];
  selected: {
    lineId: string;
    evidencePack: {
      recordIds: string[];
      documents: Array<{ documentId: string; documentType: string; summary: string }>;
    };
    draft: {
      actionId: string;
      actionType: string;
      status: "pending_human";
      amount: string;
      basis: string;
    };
  };
  actionInbox: Array<{
    actionId: string;
    actionType: string;
    lineId: string;
    amount: string;
  }>;
  recoveryTracker: {
    totalExposure: string;
    projectedRecovery: string;
    projectedBilling: string;
    recoveryLines: number;
    billingLines: number;
  };
  retrievalStatus: Array<{ source: string; count: number }>;
  whatChanged: string;
  aiInsight: string;
}

interface CreditCockpitModel {
  surface: "credit-arbitration";
  customerId: string;
  sentinel: {
    status: string;
    reason: string;
    recordIds: string[];
  };
  arbitration: {
    status: string;
    reason: string;
    recordIds: string[];
  };
  partialHold: {
    compositeScore: string;
    releaseRatioPercent: string;
    proposedReleaseAmount: string;
    proposedBackOrderAmount: string;
    basis: string;
  };
  termProposal: {
    terms: string;
    status: "pending_human";
    basis: string;
  };
  approvalInbox: Array<{
    actionId: string;
    actionType: string;
    status: "pending_human";
    basis: string;
  }>;
  audit: {
    entries: number;
    valid: boolean;
  };
}

interface CfoSummaryCockpitModel {
  surface: "cfo-summary";
  metrics: Array<{ label: string; value: string }>;
  whatChanged: string;
  aiInsight: string;
  openDependencies: string[];
}

interface TraceCockpitModel {
  surface: "trace";
  events: Array<{
    id: string;
    label: string;
    kind: string;
    status: string;
    recordIds: string[];
    deterministicBasis: string;
  }>;
}

interface MemorySummaryCockpitModel {
  surface: "memory";
  categories: string[];
  records: Array<{
    id: string;
    category: string;
    trustLevel: string;
    scope: string;
    recordIds: string[];
  }>;
}

interface AgentGraphCockpitModel {
  surface: "agents";
  agents: Array<{
    name: string;
    capability: string;
    modelExecution: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    mode: string;
  }>;
}

interface ConnectorReadinessCockpitModel {
  surface: "connector-readiness";
  connectors: Array<{
    name: string;
    status: string;
    allowedOperations: string[];
    missingCredentialEnvNames: string[];
    missingSourceContractInputs: string[];
    proof: {
      credentialsConfigured: boolean;
      externalWritesAllowed: boolean;
      schemaValidated: boolean;
      sourceContractConfigured: boolean;
    };
    requiredInputs: string[];
    reason: string;
  }>;
}

interface WorklistItem {
  lineId: string;
  scenarioType: string;
  amount: string;
  verdict: string;
  confidence: string;
}

export default async function Page() {
  const [model, credit, cfo, trace, memory, agents, connectors] = await Promise.all([
    fetchForensicsModel(),
    fetchCreditModel(),
    fetchCfoModel(),
    fetchTraceModel(),
    fetchMemoryModel(),
    fetchAgentGraphModel(),
    fetchConnectorReadinessModel()
  ]);

  return (
    <main className="shell">
      <aside className="sidebar" aria-label="Recoup navigation">
        {/* Static anchor contract: href="#forensics" href="#credit" href="#cfo" */}
        <div className="brand-block">
          <div className="brand">Recoup</div>
          <span>Deduction recovery mesh</span>
        </div>
        <nav>
          <NavGroup
            label="Operate"
            items={[
              { current: true, href: "#forensics", icon: <Stack size={17} />, label: "Forensics" },
              { href: "#run", icon: <ClockCounterClockwise size={17} />, label: "Run trace" }
            ]}
          />
          <NavGroup
            label="Resolve"
            items={[
              { href: "#credit", icon: <Scales size={17} />, label: "Credit" },
              { href: "#cfo", icon: <Briefcase size={17} />, label: "CFO" }
            ]}
          />
          <NavGroup
            label="Govern"
            items={[
              { href: "#agents", icon: <UsersThree size={17} />, label: "Agents" },
              { href: "#connectors", icon: <Circuitry size={17} />, label: "Connectors" },
              { href: "#memory", icon: <Database size={17} />, label: "Memory" },
              { href: "#trace", icon: <GitBranch size={17} />, label: "Trace" }
            ]}
          />
        </nav>
        <div className="sidebar-note">
          <span>Mode</span>
          <strong>Supervised</strong>
          <small>External actions require human approval.</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" id="forensics">
          <div>
            <p className="micro">Maya Patel</p>
            <h1>Deduction Forensics</h1>
            <p className="topbar-copy">Closed-loop recovery workspace with cited evidence, draft actions, and approval gates.</p>
          </div>
          <div className="toolbar" aria-label="Forensics controls">
            <button type="button" aria-label="Refresh run" title="Refresh run">
              <ArrowClockwise size={18} />
            </button>
            <button type="button" aria-label="Filter worklist" title="Filter worklist">
              <Funnel size={18} />
            </button>
            <button type="button" aria-label="Search records" title="Search records">
              <MagnifyingGlass size={18} />
            </button>
          </div>
        </header>

        <section className="summary-grid" aria-label="Recovery summary">
          <Metric delta="scope: 8 deductions" icon={<ChartLineUp size={18} />} label="Total exposure" value={model.recoveryTracker.totalExposure} />
          <Metric
            delta="recovery queue"
            drillDown="Open recovery queue"
            icon={<TrendUp size={18} />}
            label="Projected recovery"
            value={model.recoveryTracker.projectedRecovery}
            variant="primary"
          />
          <Metric delta="draft only" icon={<ShieldCheck size={18} />} label="Billing prevention" value={model.recoveryTracker.projectedBilling} />
          <Metric
            delta="human approval"
            icon={<Tray size={18} />}
            label="Draft queues"
            value={`${String(model.recoveryTracker.recoveryLines)}/${String(model.recoveryTracker.billingLines)}`}
          />
        </section>

        <section className="content-grid">
          <section className="worklist" aria-label="Pre-triaged worklist">
            <div className="section-heading">
              <div>
                <p className="micro">8-line queue</p>
                <h2>Worklist</h2>
              </div>
              <span>{model.worklist.length} visible</span>
            </div>
            <div className="data-table" role="table" aria-label="Deduction worklist">
              <div className="table-row table-head" role="row">
                <span role="columnheader">Line</span>
                <span role="columnheader">Scenario</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Confidence</span>
                <span role="columnheader">Verdict</span>
                <span role="columnheader">Next action</span>
              </div>
              {model.worklist.map((item: WorklistItem) => {
                const isSelected = item.lineId === model.selected.lineId;

                return (
                  <article aria-selected={isSelected} className="table-row work-row" key={item.lineId} role="row">
                    <div role="cell">
                      <strong>{item.lineId}</strong>
                      <span>NorthBay evidence</span>
                    </div>
                    <span role="cell">{item.scenarioType}</span>
                    <div className="amount" role="cell">{item.amount}</div>
                    <GovernanceBadge value={item.confidence} />
                    <div className="verdict-cell" role="cell">
                      <StatusPill status={item.verdict} tone={item.verdict} />
                    </div>
                    <div className="next-action-cell" role="cell">
                      {isSelected ? (
                        <a aria-label={`Review selected ${item.lineId}`} className="next-action" href="#selected-line">
                          Review <ArrowRight size={13} />
                        </a>
                      ) : (
                        <span className="next-action-muted">Queued</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="decision-console" aria-label="Evidence and draft" id="selected-line">
            <div className="section-heading">
              <div>
                <p className="micro">Selected line</p>
                <h2>{model.selected.lineId}</h2>
              </div>
              <StatusPill status="recovery" tone="invalid" />
            </div>

            <div className="next-best-action flagship-action">
              <h3>
                <Circuitry size={18} />
                Next best action
              </h3>
              <div className="action-summary">
                <span>Recommended action</span>
                <strong>Recover the invalid deduction through a human-approved draft.</strong>
              </div>
              <div className="action-summary">
                <span>Why</span>
                <p>{model.selected.draft.basis}</p>
              </div>
              <div className="reason-grid">
                <span>Evidence-linked</span>
                <span>Draft only</span>
                <span>HITL gated</span>
              </div>
              <div className="action-paths" aria-label="Next best action paths">
                <span>Primary: approve draft</span>
                <span>Alternative: modify amount</span>
                <span>Defer: require reason</span>
              </div>
            </div>

            <div className="draft priority-draft">
              <h3>
                <Warning size={18} />
                Draft action
              </h3>
              <p>{model.selected.draft.basis}</p>
              <div className="draft-footer">
                <span className="amount">{model.selected.draft.amount}</span>
                <span>{model.selected.draft.status.replace("_", " ")}</span>
              </div>
              <ApprovalControls actionId={model.selected.draft.actionId} />
            </div>

            <div className="evidence">
              <h3>
                <FileText size={18} />
                Evidence pack
              </h3>
              {model.selected.evidencePack.documents.map((document) => (
                <div className="evidence-row" key={document.documentId}>
                  <span>{document.documentType}</span>
                  <strong>{document.documentId}</strong>
                  <p>{document.summary}</p>
                </div>
              ))}
              <div className="record-strip" aria-label="Evidence record IDs">
                {model.selected.evidencePack.recordIds.map((recordId, index) => (
                  <code key={`${recordId}-${String(index)}`}>{recordId}</code>
                ))}
              </div>
            </div>

            <div className="inbox">
              <h3>
                <Tray size={18} />
                Action inbox
              </h3>
              {model.actionInbox.slice(0, 5).map((action) => (
                <div className="inbox-row" key={action.actionId}>
                  <span>{action.actionType}</span>
                  <strong>{action.lineId}</strong>
                  <span className="amount">{action.amount}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="audit-rail stream" aria-label="SSE stream" id="run">
            <div className="section-heading">
              <div>
                <p className="micro">SSE stream</p>
                <h2>Run trace</h2>
              </div>
              <span>live replay</span>
            </div>
            <RunStream />
            <div className="insight">
              <strong>What changed</strong>
              <p>{model.whatChanged}</p>
            </div>
            <div className="insight">
              <strong>AI insight</strong>
              <p>{model.aiInsight}</p>
            </div>
            <div className="insight">
              <strong>Trend forecast</strong>
              <p>Recovery and Billing prevention remain projected until the approval audit trail records human decisions.</p>
            </div>
            <RealtimeQueryControls />
            <div className="retrieval">
              {model.retrievalStatus.map((status) => (
                <span key={status.source}>
                  {status.source}: {status.count}
                </span>
              ))}
            </div>
          </section>
        </section>

        <section className="surface-grid" aria-label="Credit and CFO surfaces">
          <section className="surface-panel" aria-label="Credit arbitration cockpit" id="credit">
            <div className="section-heading">
              <div>
                <p className="micro">David Kim</p>
                <h2>Credit arbitration</h2>
              </div>
              <span>{credit.customerId}</span>
            </div>
            <div className="surface-metrics">
              <Metric delta="deterministic" icon={<Graph size={18} />} label="Composite score" value={credit.partialHold.compositeScore} />
              <Metric delta="partial hold" icon={<Scales size={18} />} label="Release ratio" value={credit.partialHold.releaseRatioPercent} />
              <Metric delta="proposed" icon={<CheckCircle size={18} />} label="Ship release" value={credit.partialHold.proposedReleaseAmount} />
              <Metric delta="contained" icon={<Warning size={18} />} label="Back-order" value={credit.partialHold.proposedBackOrderAmount} />
            </div>
            <div className="risk-board">
              <div>
                <span>Watchlist</span>
                <strong>{credit.customerId}</strong>
                <small>{credit.sentinel.reason}</small>
              </div>
              <div>
                <span>Ranked option</span>
                <strong>Release {credit.partialHold.releaseRatioPercent}</strong>
                <small>{credit.partialHold.basis}</small>
              </div>
              <div>
                <span>Approval inbox</span>
                <strong>{credit.approvalInbox.length} pending</strong>
                <small>{credit.termProposal.status.replace("_", " ")}</small>
              </div>
            </div>
            <div className="decision-list">
              <StatusRow label="Sentinel" value={credit.sentinel.reason} status={credit.sentinel.status} />
              <StatusRow label="Arbitration" value={credit.arbitration.reason} status={credit.arbitration.status} />
              <StatusRow label="Terms" value={credit.termProposal.terms} status={credit.termProposal.status} />
            </div>
            <div className="record-strip" aria-label="Credit evidence record IDs">
              {[...credit.sentinel.recordIds, ...credit.arbitration.recordIds].map((recordId, index) => (
                <code key={`credit-${recordId}-${String(index)}`}>{recordId}</code>
              ))}
            </div>
          </section>

          <section className="surface-panel" aria-label="CFO summary" id="cfo">
            <div className="section-heading">
              <div>
                <p className="micro">Executive readout</p>
                <h2>CFO summary</h2>
              </div>
              <span>{cfo.surface}</span>
            </div>
            <div className="surface-metrics">
              {cfo.metrics.map((metric) => (
                <Metric key={metric.label} delta="board scope" icon={<Briefcase size={18} />} label={metric.label} value={metric.value} />
              ))}
            </div>
            <div className="executive-strip">
              <div>
                <span>Scope</span>
                <strong>{model.worklist.length} deductions</strong>
              </div>
              <div>
                <span>Audit</span>
                <strong>Hash-chain visible</strong>
              </div>
              <div>
                <span>Forecast</span>
                <strong>Pending approvals</strong>
              </div>
            </div>
            <div className="insight">
              <strong>What changed</strong>
              <p>{cfo.whatChanged}</p>
            </div>
            <div className="insight">
              <strong>AI insight</strong>
              <p>{cfo.aiInsight}</p>
            </div>
            <div className="dependency-list" aria-label="Open dependencies">
              {cfo.openDependencies.map((dependency) => (
                <span key={dependency}>{dependency}</span>
              ))}
            </div>
          </section>
        </section>

        <GovernanceTabs agents={agents} connectors={connectors} memory={memory} trace={trace} />
      </section>
    </main>
  );
}

async function fetchForensicsModel(): Promise<ForensicsCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/forensics`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Forensics cockpit model failed: ${String(response.status)}`);
  }

  return (await response.json()) as ForensicsCockpitModel;
}

async function fetchCreditModel(): Promise<CreditCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/credit`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Credit cockpit model failed: ${String(response.status)}`);
  }

  return (await response.json()) as CreditCockpitModel;
}

async function fetchCfoModel(): Promise<CfoSummaryCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/cfo`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`CFO cockpit model failed: ${String(response.status)}`);
  }

  return (await response.json()) as CfoSummaryCockpitModel;
}

async function fetchTraceModel(): Promise<TraceCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/trace`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Trace model failed: ${String(response.status)}`);
  }

  return (await response.json()) as TraceCockpitModel;
}

async function fetchMemoryModel(): Promise<MemorySummaryCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/memory`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Memory model failed: ${String(response.status)}`);
  }

  return (await response.json()) as MemorySummaryCockpitModel;
}

async function fetchAgentGraphModel(): Promise<AgentGraphCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/agents`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Agent graph model failed: ${String(response.status)}`);
  }

  return (await response.json()) as AgentGraphCockpitModel;
}

async function fetchConnectorReadinessModel(): Promise<ConnectorReadinessCockpitModel> {
  const response = await fetch(`${apiBaseUrl}/connectors`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Connector readiness model failed: ${String(response.status)}`);
  }

  return (await response.json()) as ConnectorReadinessCockpitModel;
}

function NavGroup({
  items,
  label
}: Readonly<{
  items: Array<{ current?: boolean; href: string; icon: ReactNode; label: string }>;
  label: string;
}>) {
  return (
    <div className="nav-group">
      <span>{label}</span>
      {items.map((item) => (
        <a aria-current={item.current ? "page" : undefined} href={item.href} key={item.href}>
          {item.icon}
          {item.label}
        </a>
      ))}
    </div>
  );
}

function Metric({
  delta,
  drillDown,
  icon,
  label,
  variant,
  value
}: Readonly<{ delta?: string; drillDown?: string; icon?: ReactNode; label: string; value: string; variant?: "primary" }>) {
  return (
    <article className={variant === undefined ? "metric" : `metric ${variant}`}>
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {delta === undefined ? null : <small>{delta}</small>}
      {drillDown === undefined ? null : <em>{drillDown}</em>}
    </article>
  );
}

function StatusRow({ label, status, value }: Readonly<{ label: string; status: string; value: string }>) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusPill status={status} />
    </div>
  );
}

function StatusPill({ status, tone }: Readonly<{ status: string; tone?: string }>) {
  const normalized = status.replace("_", " ");
  const icon =
    status === "valid" || status === "ready" || status === "human_decided" ? (
      <CheckCircle size={14} />
    ) : (
      <Warning size={14} />
    );

  return (
    <span className={`pill ${tone ?? status}`}>
      {icon}
      <span>{normalized}</span>
    </span>
  );
}

function GovernanceBadge({ value }: Readonly<{ value: string }>) {
  const blocked = value.toLowerCase().includes("blocked");

  return (
    <span className={`governance-badge ${blocked ? "blocked" : "ready"}`} role="cell">
      {blocked ? "threshold unset" : value}
    </span>
  );
}

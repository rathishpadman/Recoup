import { BankIcon as Bank } from "@phosphor-icons/react/dist/ssr/Bank";
import { CubeIcon as Cube } from "@phosphor-icons/react/dist/ssr/Cube";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { FolderIcon as Folder } from "@phosphor-icons/react/dist/ssr/Folder";
import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { NetworkIcon as Network } from "@phosphor-icons/react/dist/ssr/Network";
import { PulseIcon as Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { ReceiptIcon as Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { TruckIcon as Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { RecordStrip, StatusPill } from "./cockpit-shell.tsx";
import type {
  ConnectorReadinessCockpitModel,
  CreditCockpitModel,
  ForensicsCockpitModel,
  TraceCockpitModel
} from "./cockpit-data.ts";

type AuditState = "verified" | "blocked" | "pending_human";

export function ToolStatusRail({ connectors }: Readonly<{ connectors: ConnectorReadinessCockpitModel }>) {
  return (
    <section className="tool-status-rail" aria-label="Source readiness health">
      <div className="premium-section-heading">
        <div>
          <h2>ToolStatusRail</h2>
        </div>
        <div className="rail-actions">
          <span className="rail-provenance">{connectors.lastRefreshedLabel}</span>
          <button className="system-health-button" type="button">
            <span>System health</span>
            <Pulse size={15} />
          </button>
        </div>
      </div>
      <div className="tool-source-list">
        {connectors.sourceTiles.map((source) => {
          return (
            <article className={`source-readiness-row ${source.statusTone}`} key={source.key}>
              <span className="source-mark" aria-hidden="true">
                {renderSourceIcon(source.key)}
              </span>
              <span className={`source-status-dot ${source.statusTone}`} aria-hidden="true" />
              <div className="source-readiness-copy">
                <strong>{displaySourceLabel(source.label)}</strong>
                <span className="source-mode">{displaySourceMode(source.modeLabel)}</span>
                <span className="source-summary">{displaySourceSummary(source.key, source.summary)}</span>
              </div>
              <span className={`source-readiness-state ${source.statusTone}`}>
                {displaySourceState(source.key, source.stateLabel)}
              </span>
              <p>{displaySourceDetail(source.key, source.detail)}</p>
              <div className="tool-proof-row" aria-label={`${source.label} proof state`}>
                {source.proofItems.map((item) => (
                  <span key={item}>{displaySourceProof(item)}</span>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function displaySourceMode(modeLabel: string): string {
  if (modeLabel === "Proxy - Supabase") {
    return "Proxy - Supabase";
  }

  if (modeLabel === "Unavailable") {
    return "Unavailable";
  }

  if (modeLabel.toLowerCase().includes("synthetic")) {
    return "Proxy - Supabase";
  }

  if (modeLabel.toLowerCase().includes("read-only")) {
    return "Governed access";
  }

  return "Live source";
}

function displaySourceLabel(label: string): string {
  if (label === "SAP OData") {
    return "SAP OData";
  }

  if (label === "TPM") {
    return "TPM";
  }

  if (label === "3PL POD") {
    return "3PL POD";
  }

  if (label === "Bureau") {
    return "Bureau";
  }

  if (label === "Remittance / EDI") {
    return "Remittance";
  }

  if (label === "Contract Repo") {
    return "Contract Repo";
  }

  if (label === "MCP") {
    return "MCP";
  }

  return label;
}

function displaySourceState(sourceKey: string, stateLabel: string): string {
  if (stateLabel === "Setup") {
    return "Needs setup";
  }

  if (sourceKey === "mcp" && stateLabel === "Connected") {
    return "Connected";
  }

  if (stateLabel === "Synthetic" || stateLabel === "Proxy - Supabase") {
    return "Proxy - Supabase";
  }

  if (stateLabel === "Connected") {
    return "OK";
  }

  return stateLabel;
}

function displaySourceSummary(sourceKey: string, summary: string): string {
  if (summary === "Input required") {
    return "Input required";
  }

  if (sourceKey === "sap-odata") {
    return "ERP read ready";
  }

  if (sourceKey === "tpm") {
    return "Trade terms ready";
  }

  if (sourceKey === "pod-3pl") {
    return "POD demo proof";
  }

  if (sourceKey === "bureau") {
    return "Credit file ready";
  }

  if (sourceKey === "remittance-edi") {
    return "Cash advice ready";
  }

  if (sourceKey === "contract-repo") {
    return "Contract evidence ready";
  }

  if (sourceKey === "mcp") {
    return "Drafts governed";
  }

  if (summary === "Input required") {
    return "Source agreement";
  }

  if (summary === "Schema verified") {
    return "Schema checked";
  }

  if (summary === "Draft tools gated") {
    return "Drafts governed";
  }

  return summary;
}

function displaySourceDetail(sourceKey: string, detail: string): string {
  if (sourceKey === "sap-odata") {
    return "Read-only ERP schema checked for the run.";
  }

  if (sourceKey === "tpm") {
    return "Trade terms are matched to deduction evidence.";
  }

  if (sourceKey === "pod-3pl") {
    return "Demo POD proof is labelled before display.";
  }

  if (sourceKey === "bureau") {
    return "Credit-file reads stay inside governed review.";
  }

  if (sourceKey === "remittance-edi") {
    return "Cash advice is available for matching.";
  }

  if (sourceKey === "contract-repo") {
    return "Contract evidence is ready for citation.";
  }

  if (sourceKey === "mcp") {
    return "Draft actions stay behind the reviewer gate.";
  }

  if (detail.toLowerCase().includes("input required")) {
    return "Source contract pending approval.";
  }

  if (detail.toLowerCase().includes("draft tools")) {
    return "Draft actions remain approval-gated.";
  }

  if (detail.toLowerCase().includes("synthetic")) {
    return "Supabase proxy evidence is labelled before live cutover.";
  }

  return detail;
}

function displaySourceProof(item: string): string {
  if (item === "read-only") {
    return "review only";
  }

  if (item === "external writes blocked") {
    return "writes blocked";
  }

  if (item === "tools filtered") {
    return "tools governed";
  }

  if (item === "draft-only actions") {
    return "draft actions";
  }

  if (item === "no ERP write-back") {
    return "no ERP writes";
  }

  if (item === "synthetic labelled") {
    return "proxy labelled";
  }

  return item;
}

function renderSourceIcon(sourceKey: string) {
  switch (sourceKey) {
    case "bureau":
      return <Bank size={17} />;
    case "contract-repo":
      return <Folder size={17} />;
    case "mcp":
      return <Network size={17} />;
    case "pod-3pl":
      return <Truck size={17} />;
    case "remittance-edi":
      return <Receipt size={17} />;
    case "sap-odata":
      return <Database size={17} />;
    case "tpm":
      return <Cube size={17} />;
    default:
      return <Database size={17} />;
  }
}

export function MultimodalDock({
  dock,
  recordIds
}: Readonly<{ dock: ForensicsCockpitModel["multimodalDock"]; recordIds: string[] }>) {
  return (
    <section className="multimodal-dock" aria-label="Multimodal evidence dock">
      <div className="premium-section-heading">
        <div>
          <span>Sub-agents</span>
          <h2>MultimodalDoc</h2>
        </div>
      </div>
      <div className="dock-mode-toggle" aria-label="Evidence dock mode">
        {dock.modeOptions.map((option, index) => (
          <button aria-pressed={index === 0} key={option} type="button">
            {option}
          </button>
        ))}
        <span>{dock.languageLabel}</span>
      </div>
      <div className="dock-transcript-grid" aria-label="Current evidence question">
        <span>{dock.transcript.native}</span>
        <strong>{dock.transcript.english}</strong>
      </div>
      <div className="dock-state-grid">
        <span>
          <strong>{String(dock.subAgents.length)}</strong>
          sub-agents
        </span>
        <span>
          <strong>{String(recordIds.length)}</strong>
          cited records
        </span>
        <span>
          <strong>0</strong>
          external writes
        </span>
        <span>
          <strong>Policy</strong>
          {dock.policyLabel}
        </span>
      </div>
      <div className="agent-dock-list">
        {dock.subAgents.map((agent) => (
          <div className="agent-dock-row" key={agent.name}>
            <div className="agent-dock-heading">
              <strong>{agent.name}</strong>
              <code>{agent.statusLabel}</code>
            </div>
            <dl className="agent-dock-facts">
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
                <dd>{agent.keyArtifact}</dd>
              </div>
              <div>
                <dt>Details</dt>
                <dd>{agent.statusLabel}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <div className="dock-prompt">{dock.promptPlaceholder}</div>
      <RecordStrip label="Multimodal citation record IDs" recordIds={recordIds} />
    </section>
  );
}

export function AgentTraceVisualizer({ trace }: Readonly<{ trace: TraceCockpitModel }>) {
  return (
    <section className="agent-trace-visualizer" aria-label="Agent trace visualizer">
      <div className="premium-section-heading">
        <div>
          <span>Operational spine</span>
          <h2>Trace lanes</h2>
        </div>
        <Pulse size={18} />
      </div>
      <ol>
        {trace.events.map((event, index) => {
          const lane = traceLaneCopy(event);

          return (
            <li className={`trace-lane ${event.kind}`} key={event.id}>
              <div className="trace-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <div className="trace-lane-heading">
                  <strong>{lane.title}</strong>
                  <StatusPill status={event.status} />
                </div>
                <p>{lane.summary}</p>
                <span>{lane.basis}</span>
                <RecordStrip label={`${event.id} evidence families`} recordIds={lane.evidenceLabels} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function traceLaneCopy(event: TraceCockpitModel["events"][number]): {
  basis: string;
  evidenceLabels: string[];
  summary: string;
  title: string;
} {
  if (event.id === "trace-riskmesh-harbor") {
    return {
      basis: "Basis: arbitration read model",
      evidenceLabels: ["Customer", "Order", "Ledger"],
      summary: "Harbor hold remains staged for a human decision before any credit action can dispatch.",
      title: "Harbor decision checkpoint"
    };
  }

  if (event.id === "trace-forensics-recovery") {
    return {
      basis: "Basis: forensics run plus recovery drafter handoff",
      evidenceLabels: ["Dataset", "Draft action"],
      summary: "Shortage recovery evidence is packaged into a reviewer-ready draft action.",
      title: "Recovery handoff prepared"
    };
  }

  if (event.id === "trace-mcp-public-tools") {
    return {
      basis: "Basis: public tool manifest",
      evidenceLabels: ["Read tools", "Draft tools"],
      summary: "The MCP surface exposes read and draft operations only; write-capable actions stay filtered.",
      title: "Tool access constrained"
    };
  }

  return {
    basis: `Basis: ${event.provenance.replaceAll("_", " ")}`,
    evidenceLabels: event.recordIds,
    summary: event.label,
    title: event.kind
  };
}

export function NegotiationGraph({ credit }: Readonly<{ credit: CreditCockpitModel }>) {
  const provenanceLabel = credit.negotiation.provenance
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");

  return (
    <section className="negotiation-graph" aria-label="Risk Mesh negotiation graph">
      <div className="premium-section-heading">
        <div>
          <span>Supervisor arbitration</span>
          <h2>Risk Mesh supervisor</h2>
        </div>
        <GitBranch size={18} />
      </div>
      <div className="graph-core risk-mesh-layout">
        <div className="risk-mesh-orbit">
          <span aria-hidden="true" className="mesh-link mesh-link-1" />
          <span aria-hidden="true" className="mesh-link mesh-link-2" />
          <span aria-hidden="true" className="mesh-link mesh-link-3" />
          <span aria-hidden="true" className="mesh-link mesh-link-4" />
          <div className="graph-supervisor mesh-owner-node">
            <Stack size={20} />
            <div className="arbitration-score-cell mesh-score-readout">
              <strong>{credit.partialHold.compositeScore}</strong>
              <span>score</span>
            </div>
            <div>
              <strong>David</strong>
              <span>Owner</span>
            </div>
            <code>{credit.partialHold.releaseRatioPercent} release path</code>
          </div>
          {credit.negotiation.nodes.map((node, index) => (
            <article className={`graph-node orbit-node orbit-node-${String(index + 1)}`} key={node.functionName}>
              <div>
                <strong>{node.displayName}</strong>
                <code>{node.weight}</code>
              </div>
              <p>{node.position}</p>
              <span>{node.confidenceBand}</span>
              <RecordStrip label={`${node.functionName} record IDs`} recordIds={node.recordIds} />
            </article>
          ))}
        </div>
        <aside className="mesh-status-panel" aria-label="Risk Mesh negotiation status">
          <span>Negotiation status</span>
          <strong>Aligned</strong>
          <span>Consensus</span>
          <strong>{String(credit.negotiation.nodes.length + 1)} / {String(credit.negotiation.nodes.length + 1)}</strong>
          <span>Release path</span>
          <strong>{credit.partialHold.releaseRatioPercent}</strong>
          <span>Provenance</span>
          <code>{provenanceLabel}</code>
        </aside>
      </div>
      <div className="graph-timeline" aria-label="Arbitration timeline">
        {credit.negotiation.timeline.map((item, index) => (
          <div key={`${item.message}-${String(index)}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.message}</strong>
            <RecordStrip label={`Negotiation step ${String(index + 1)} record IDs`} recordIds={item.recordIds} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function AuditVerifyChip({
  hash,
  label,
  recordIds,
  state = "verified"
}: Readonly<{ hash: string; label: string; recordIds?: string[]; state?: AuditState }>) {
  const stateCopy =
    state === "verified"
      ? "verified deterministic audit state"
      : state === "blocked"
        ? "external action blocked by audit policy"
        : "audit hash assigned after human decision";

  return (
    <section className={`audit-verify-chip ${state}`} aria-label={`${label} audit verification`}>
      <div>
        {state === "blocked" ? <LockKey size={18} /> : <ShieldCheck size={18} />}
        <div>
          <strong>{label}</strong>
          <span>{stateCopy}</span>
        </div>
      </div>
      <code>{hash}</code>
      {recordIds === undefined ? null : <RecordStrip label={`${label} audit record IDs`} recordIds={recordIds} />}
    </section>
  );
}

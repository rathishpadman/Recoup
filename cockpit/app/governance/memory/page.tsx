import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { CockpitShell, RecordStrip } from "../../cockpit-shell.tsx";
import { fetchMemoryModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function MemoryGovernancePage() {
  const session = await requireRouteAccess("/governance/memory");
  const model = await fetchMemoryModel();
  const trustedRecords = model.records.filter((record) => record.trustLevel === "trusted").length;
  const scopedCases = new Set(model.records.map((record) => record.scope)).size;
  const categorySummaries = model.categories.map((category) => ({
    category,
    count: model.records.filter((record) => record.category === category).length,
    label: memoryCategoryLabel(category)
  }));

  return (
    <CockpitShell
      active="memory"
      kicker="Governance"
      session={session}
      subtitle="Scoped memory is displayed as trusted, bounded records rather than hidden prompt state."
      title="Memory"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface governance-workstation">
        <div className="governance-command-strip" aria-label="Memory governance posture">
          <div>
            <Database size={16} aria-hidden="true" />
            <span>Records</span>
            <strong>{String(model.records.length)}</strong>
          </div>
          <div>
            <Stack size={16} aria-hidden="true" />
            <span>Categories</span>
            <strong>{String(model.categories.length)}</strong>
          </div>
          <div>
            <LockKey size={16} aria-hidden="true" />
            <span>Trusted records</span>
            <strong>{String(trustedRecords)}</strong>
          </div>
          <div>
            <Database size={16} aria-hidden="true" />
            <span>Scopes</span>
            <strong>{String(scopedCases)}</strong>
          </div>
        </div>

        <div className="governance-split">
          <section className="surface-panel">
            <div className="section-heading">
              <div>
                <h2>Memory evidence</h2>
                <span>{String(model.records.length)} cited records grouped by business memory boundary.</span>
              </div>
            </div>

            <div className="memory-category-grid" aria-label="Memory category summary">
              {categorySummaries.map((category) => (
                <div className={category.count > 0 ? "active" : undefined} key={category.category}>
                  <strong>{category.label}</strong>
                  <span>{category.count > 0 ? `${String(category.count)} records` : "Configured boundary"}</span>
                </div>
              ))}
            </div>

            <div className="memory-record-list governance-table" aria-label="Memory records">
              <div className="governance-table-head memory-head">
                <span>Memory boundary</span>
                <span>Trust</span>
                <span>Scope</span>
              </div>
              {model.records.map((record) => {
                return (
                  <div className="memory-row governance-data-row" key={record.id}>
                    <div className="memory-record-title">
                      <strong>{memoryCategoryLabel(record.category)}</strong>
                      <span>{memoryRecordPurpose(record.category)}</span>
                      <code>{record.id}</code>
                    </div>
                    <span className={`memory-trust-state ${record.trustLevel}`}>{memoryTrustLabel(record.trustLevel)}</span>
                    <div className="memory-scope-cell">
                      <strong>{scopeLabel(record.scope)}</strong>
                      <code>{record.scope}</code>
                    </div>
                    <div className="memory-evidence-cell">
                      <span>{String(record.recordIds.length)} cited records</span>
                      <RecordStrip label={`${record.id} cited records`} recordIds={record.recordIds} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="governance-side-rail memory-proof-rail" aria-label="Memory policy evidence">
            <div className="governance-rail-section memory-provenance-summary">
              <strong>Memory source</strong>
              <span>{memoryBackendLabel(model.backend)}</span>
              <code>{model.backend}</code>
              <span>{memorySourceModeLabel(model.sourceMode)}</span>
              <code>{model.sourceMode}</code>
              <span>{memoryProvenanceLabel(model.provenance)}</span>
              <code>{model.provenance}</code>
            </div>
            <div className="governance-rail-section">
              <strong>Memory boundary</strong>
              <span>Records are displayed as scoped evidence, with raw storage keys kept secondary.</span>
            </div>
            <div className="governance-rail-section">
              <strong>Reviewer posture</strong>
              <span>Evidence counts lead each row; citations remain available without taking over the view.</span>
            </div>
            <div className="governance-rail-section">
              <strong>Trust contract</strong>
              <span>Semi-trusted or untrusted memory cannot be promoted to decision evidence without explicit state.</span>
            </div>
          </aside>
        </div>
      </section>
    </CockpitShell>
  );
}

function memoryBackendLabel(backend: string): string {
  const labels: Record<string, string> = {
    in_memory_fallback: "Deterministic demo fallback",
    sqlite: "SQLite runtime memory",
    supabase: "Supabase runtime memory"
  };

  return labels[backend] ?? humanizeKey(backend);
}

function memorySourceModeLabel(sourceMode: string): string {
  const labels: Record<string, string> = {
    deterministic_demo_fallback: "Deterministic fallback records",
    runtime_persisted: "Persisted runtime records"
  };

  return labels[sourceMode] ?? humanizeKey(sourceMode);
}

function memoryProvenanceLabel(provenance: string): string {
  const labels: Record<string, string> = {
    deterministic_demo_memory: "Demo memory, not a persisted runtime store",
    persisted_runtime_memory: "Runtime memory from configured storage"
  };

  return labels[provenance] ?? humanizeKey(provenance);
}

function memoryCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    agent_handoff_packets: "Agent Handoff",
    approval_records: "Approval Records",
    artifact_refs: "Artifact References",
    audit_refs: "Audit References",
    case_state: "Case State",
    compaction_summaries: "Compaction Summary",
    connector_state: "Connector State",
    evidence_refs: "Evidence References",
    session_state: "Session State",
    transaction_state: "Transaction State",
    workflow_state: "Workflow State"
  };

  return labels[category] ?? humanizeKey(category);
}

function memoryRecordPurpose(category: string): string {
  const purpose: Record<string, string> = {
    agent_handoff_packets: "Cross-agent handoff packet with cited records.",
    approval_records: "Human decision trail for held actions.",
    artifact_refs: "Evidence artifact references available to reviewers.",
    audit_refs: "Audit trail anchors for governed decisions.",
    case_state: "Case-level state retained for a bounded workspace.",
    compaction_summaries: "Compressed context retained after reviewer-safe compaction.",
    connector_state: "Readiness and source-state memory for connectors.",
    evidence_refs: "Evidence references linked to deductions and actions.",
    session_state: "Workspace continuity for the current reviewer session.",
    transaction_state: "Transaction-specific memory scoped to a cited line.",
    workflow_state: "Workflow position retained across governed handoffs."
  };

  return purpose[category] ?? "Scoped memory record with cited evidence.";
}

function memoryTrustLabel(trustLevel: string): string {
  if (trustLevel === "trusted") {
    return "Trusted";
  }

  if (trustLevel === "semi_trusted") {
    return "Semi-trusted";
  }

  return humanizeKey(trustLevel);
}

function scopeLabel(scope: string): string {
  const [kind, value] = scope.split(":", 2);

  if (kind === "case" && value !== undefined) {
    return "Case workspace";
  }

  if (kind === "session" && value !== undefined) {
    return "Reviewer session";
  }

  if (kind === "transaction" && value !== undefined) {
    return "Transaction line";
  }

  return "Scoped record";
}

function humanizeKey(value: string): string {
  return value
    .split(/[_-]/u)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

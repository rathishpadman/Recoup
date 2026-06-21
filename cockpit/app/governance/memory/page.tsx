import { CockpitShell, RecordStrip, StatusPill } from "../../cockpit-shell.tsx";
import { fetchMemoryModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function MemoryGovernancePage() {
  const session = await requireRouteAccess("/governance/memory");
  const model = await fetchMemoryModel();

  return (
    <CockpitShell
      active="memory"
      kicker="Governance"
      session={session}
      subtitle="Scoped memory is displayed as trusted, bounded records rather than hidden prompt state."
      title="Memory"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Categories</h2>
              <span>{String(model.categories.length)} scoped buckets</span>
            </div>
          </div>
          <div className="memory-category-list">
            {model.categories.map((category) => (
              <span key={category}>{category}</span>
            ))}
          </div>
          <div className="memory-record-list">
            {model.records.map((record) => (
              <div className="memory-row" key={record.id}>
                <strong>{record.category}</strong>
                <StatusPill status={record.trustLevel} />
                <code>{record.scope}</code>
                <RecordStrip label={`${record.id} record IDs`} recordIds={record.recordIds} />
              </div>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

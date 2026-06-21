import { CockpitShell, StatusPill } from "../../cockpit-shell.tsx";
import { fetchAgentGraphModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function AgentGovernancePage() {
  const session = await requireRouteAccess("/governance/agents");
  const model = await fetchAgentGraphModel();

  return (
    <CockpitShell
      active="agents"
      kicker="Governance"
      session={session}
      subtitle="Agent boundaries, handoff modes, and model execution posture are exposed as read-only operating evidence."
      title="Agent Operations"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Agent roster</h2>
              <span>{String(model.agents.length)} traceable specialists</span>
            </div>
          </div>
          <div className="agent-roster">
            {model.agents.map((agent) => (
              <div className="agent-row" key={agent.name}>
                <strong>{agent.name}</strong>
                <span>{agent.capability}</span>
                <StatusPill status={agent.modelExecution} />
              </div>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Handoff graph</h2>
              <span>Every edge remains a bounded service or tool boundary.</span>
            </div>
          </div>
          <div className="edge-list">
            {model.edges.map((edge) => (
              <div className="edge-row" key={`${edge.from}-${edge.to}-${edge.mode}`}>
                <strong>{edge.from}</strong>
                <code>{edge.mode}</code>
                <strong>{edge.to}</strong>
              </div>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

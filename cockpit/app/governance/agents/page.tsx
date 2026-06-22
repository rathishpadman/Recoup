import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/ssr/GitBranch";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
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
      <section className="governance-surface governance-workstation">
        <div className="governance-command-strip" aria-label="Agent governance posture">
          <div>
            <UsersThree size={16} aria-hidden="true" />
            <span>Specialists</span>
            <strong>{String(model.agents.length)}</strong>
          </div>
          <div>
            <GitBranch size={16} aria-hidden="true" />
            <span>Handoffs</span>
            <strong>{String(model.edges.length)}</strong>
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Decision posture</span>
            <strong>Guarded tools</strong>
          </div>
          <div>
            <Stack size={16} aria-hidden="true" />
            <span>External action</span>
            <strong>HITL gated</strong>
          </div>
        </div>

        <div className="governance-split">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Agent roster</h2>
              <span>{String(model.agents.length)} traceable specialists with bounded execution posture.</span>
            </div>
          </div>
          <div className="governance-table agent-roster" aria-label="Agent roster">
            <div className="governance-table-head">
              <span>Specialist</span>
              <span>Capability</span>
              <span>Model execution</span>
            </div>
            {model.agents.map((agent) => (
              <div className="agent-row governance-data-row" key={agent.name}>
                <strong>{agent.name}</strong>
                <span>{agent.capability}</span>
                <StatusPill status={agent.modelExecution} />
              </div>
            ))}
          </div>
        </section>

        <aside className="governance-side-rail" aria-label="Agent boundary evidence">
          <div className="governance-rail-section">
            <strong>Boundary stance</strong>
            <span>Detection, ranking, and routing remain services. Agents expose cited decisions through tool guardrails.</span>
          </div>
          <div className="governance-rail-section">
            <strong>External actions</strong>
            <span>No recovery, hold, term, route, or correspondence action can bypass human approval.</span>
          </div>
        </aside>
        </div>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Handoff graph</h2>
              <span>Every edge remains a bounded service or tool boundary.</span>
            </div>
          </div>
          <div className="edge-list governance-edge-grid">
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

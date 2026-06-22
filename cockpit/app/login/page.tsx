import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { fetchConnectorReadinessModel, fetchLoginModel } from "../cockpit-data.ts";
import { LoginForm } from "./login-form.tsx";

export default async function LoginPage() {
  const [connectors, login] = await Promise.all([fetchConnectorReadinessModel(), fetchLoginModel()]);

  return (
    <main className="state-shell">
      <section className="login-workstation" aria-labelledby="login-heading">
        <aside className="login-rail" aria-label="Entry controls">
          <div className="login-brand">
            <span className="state-mark" aria-hidden="true">
              <ShieldCheck size={20} weight="duotone" />
            </span>
            <div>
              <strong>Recoup</strong>
              <span>Governed recovery cockpit</span>
            </div>
          </div>
          <div className="login-rail-stack">
            <div>
              <LockKey size={16} aria-hidden="true" />
              <span>Human approval gate</span>
            </div>
            <div>
              <Database size={16} aria-hidden="true" />
              <span>Read-only source posture</span>
            </div>
            <div>
              <UsersThree size={16} aria-hidden="true" />
              <span>Role-scoped demo workspaces</span>
            </div>
          </div>
          <div className="login-policy">
            <strong>Runtime boundary</strong>
            <span>No ERP write-back path. Drafts, traces, and proposals remain reviewer-approved.</span>
          </div>
        </aside>

        <div className="state-panel login-entry-panel">
          <div className="login-entry-heading">
            <p className="micro">Tenant entry</p>
            <h1 id="login-heading">Open a governed cockpit workspace</h1>
            <p>
              Select one deterministic demo persona, enter the matching reviewer credentials, and continue into the
              role-scoped surface.
            </p>
          </div>
          <LoginForm personas={login.personas} />
          <div className="login-access-ledger" aria-label="Access boundary proof">
            <div>
              <span>Route access</span>
              <strong>Role scoped</strong>
            </div>
            <div>
              <span>Proxy proof</span>
              <strong>Signed per request</strong>
            </div>
            <div>
              <span>External action</span>
              <strong>Reviewer gated</strong>
            </div>
          </div>
        </div>

        <aside className="login-source-rack" aria-label="Source readiness at entry">
          <div className="login-rack-heading">
            <span>ToolStatusRail</span>
            <strong>{connectors.lastRefreshedLabel}</strong>
          </div>
          <div className="login-source-list">
            {connectors.sourceTiles.map((source) => (
              <div className="login-source-row" key={source.key}>
                <span className="login-source-mark" aria-hidden="true">
                  {source.mark}
                </span>
                <div>
                  <strong>{source.label}</strong>
                  <span>{source.summary}</span>
                </div>
                <small className={`login-source-state ${source.statusTone}`}>{source.stateLabel}</small>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

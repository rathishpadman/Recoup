import { CircuitryIcon as Circuitry } from "@phosphor-icons/react/dist/ssr/Circuitry";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { LockKeyIcon as LockKey } from "@phosphor-icons/react/dist/ssr/LockKey";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { CockpitShell, RecordStrip, StatusPill } from "../../cockpit-shell.tsx";
import { fetchConnectorReadinessModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function ConnectorGovernancePage() {
  const session = await requireRouteAccess("/governance/connectors");
  const model = await fetchConnectorReadinessModel();
  const allowedOperations = [...new Set(model.connectors.flatMap((connector) => connector.allowedOperations))].join(", ");

  return (
    <CockpitShell
      active="connectors"
      kicker="Governance"
      session={session}
      subtitle="SAP and non-SAP source readiness stays read-only, with credential, schema, and write-permission proof visible."
      title="Connector Readiness"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface governance-workstation">
        <div className="governance-command-strip" aria-label="Connector governance posture">
          <div>
            <Circuitry size={16} aria-hidden="true" />
            <span>Connectors</span>
            <strong>{String(model.connectors.length)}</strong>
          </div>
          <div>
            <Database size={16} aria-hidden="true" />
            <span>Sources</span>
            <strong>{String(model.sourceTiles.length)}</strong>
          </div>
          <div>
            <LockKey size={16} aria-hidden="true" />
            <span>Allowed operations</span>
            <strong>{allowedOperations}</strong>
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Last refresh</span>
            <strong>{model.lastRefreshedLabel}</strong>
          </div>
        </div>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Source readiness</h2>
              <span>Connector tiles reflect the read model, including synthetic and setup states.</span>
            </div>
          </div>
          <div className="governance-source-grid" aria-label="Source readiness">
            {model.sourceTiles.map((source) => (
              <article className={`governance-source-tile ${source.statusTone}`} key={source.key}>
                <div>
                  <span aria-hidden="true">{source.mark}</span>
                  <strong>{source.label}</strong>
                  <small className={`governance-source-state ${source.statusTone}`}>{source.stateLabel}</small>
                </div>
                <p>{source.summary}</p>
                <small>{source.modeLabel}</small>
                <div className="governance-proof-line">
                  {source.proofItems.map((proof) => (
                    <span key={proof}>{proof}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Source connectors</h2>
              <span>{String(model.connectors.length)} read-only sources</span>
            </div>
          </div>
          <div className="connector-list governance-table" aria-label="Connector readiness matrix">
            <div className="governance-table-head connector-head">
              <span>Connector</span>
              <span>Status</span>
              <span>Ops</span>
              <span>Proof</span>
            </div>
            {model.connectors.map((connector) => (
              <div className="connector-row governance-data-row" key={connector.name}>
                <div>
                  <strong>{connector.name}</strong>
                  <span>{connector.reason}</span>
                  <span>Source mode {connector.sourceMode?.replace(/_/gu, " ") ?? "unknown"}</span>
                  <span>Contract mode {connector.sourceContractMode?.replace(/_/gu, " ") ?? "unknown"}</span>
                </div>
                <StatusPill status={connector.status} />
                <code>{connector.allowedOperations.join(", ")}</code>
                <div className="connector-proof">
                  <span>Credentials {connector.proof.credentialsConfigured ? "ready" : "missing"}</span>
                  <span>Schema {connector.proof.schemaValidated ? "ready" : "required"}</span>
                  <span>Writes {connector.proof.externalWritesAllowed ? "allowed" : "blocked"}</span>
                </div>
                <RecordStrip
                  label={`${connector.name} missing inputs`}
                  recordIds={[
                    ...connector.missingCredentialEnvNames,
                    ...connector.missingSourceContractInputs,
                    ...(connector.toolDataTableNames ?? [])
                  ]}
                />
              </div>
            ))}
          </div>
        </section>
      </section>
    </CockpitShell>
  );
}

import { CockpitShell, RecordStrip, StatusPill } from "../../cockpit-shell.tsx";
import { fetchConnectorReadinessModel } from "../../cockpit-data.ts";
import { requireRouteAccess } from "../../demo-auth.ts";
import { GovernanceNav } from "../governance-nav.tsx";

export default async function ConnectorGovernancePage() {
  const session = await requireRouteAccess("/governance/connectors");
  const model = await fetchConnectorReadinessModel();

  return (
    <CockpitShell
      active="connectors"
      kicker="Governance"
      session={session}
      subtitle="SAP and non-SAP source readiness stays read-only, with credential, schema, and write-permission proof visible."
      title="Connector Readiness"
      toolbar={<GovernanceNav />}
    >
      <section className="governance-surface">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Source connectors</h2>
              <span>{String(model.connectors.length)} read-only sources</span>
            </div>
          </div>
          <div className="connector-list">
            {model.connectors.map((connector) => (
              <div className="connector-row" key={connector.name}>
                <div>
                  <strong>{connector.name}</strong>
                  <span>{connector.reason}</span>
                </div>
                <StatusPill status={connector.status} />
                <code>{connector.allowedOperations.join(", ")}</code>
                <div className="connector-proof">
                  <span>credentials {connector.proof.credentialsConfigured ? "ready" : "missing"}</span>
                  <span>schema {connector.proof.schemaValidated ? "ready" : "required"}</span>
                  <span>writes {connector.proof.externalWritesAllowed ? "allowed" : "blocked"}</span>
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

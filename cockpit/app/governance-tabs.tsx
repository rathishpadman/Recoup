"use client";

import { useState } from "react";

interface TraceCockpitModel {
  surface: "trace";
  events: Array<{
    id: string;
    label: string;
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
    reason: string;
  }>;
}

type GovernanceTab = "agents" | "connectors" | "memory" | "trace";

const tabLabels = {
  agents: { id: "agents", label: "Agent operations", micro: "Harness" },
  connectors: { id: "connectors", label: "Connector readiness", micro: "Integrations" },
  memory: { id: "memory", label: "Memory", micro: "Scoped state" },
  trace: { id: "trace", label: "Trace", micro: "Audit visible" }
} satisfies Record<GovernanceTab, { id: GovernanceTab; label: string; micro: string }>;
const tabs = [tabLabels.agents, tabLabels.connectors, tabLabels.memory, tabLabels.trace];

export function GovernanceTabs({
  agents,
  connectors,
  memory,
  trace
}: Readonly<{
  agents: AgentGraphCockpitModel;
  connectors: ConnectorReadinessCockpitModel;
  memory: MemorySummaryCockpitModel;
  trace: TraceCockpitModel;
}>) {
  const [activeTab, setActiveTab] = useState<GovernanceTab>("agents");
  const active = tabLabels[activeTab];

  return (
    <section className="governance-surface surface-panel" aria-label="Governance operations">
      <div className="governance-header">
        <div>
          <p className="micro">{active.micro}</p>
          <h2>{active.label}</h2>
        </div>
        <div className="governance-tabs" role="tablist" aria-label="Governance views">
          {tabs.map((tab) => (
            <button
              aria-controls={`${tab.id}-panel`}
              aria-selected={activeTab === tab.id}
              id={tab.id}
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
              }}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="governance-panel" id={`${activeTab}-panel`} role="tabpanel">
        {activeTab === "agents" ? <AgentOperations agents={agents} /> : null}
        {activeTab === "connectors" ? <ConnectorOperations connectors={connectors} /> : null}
        {activeTab === "memory" ? <MemoryOperations memory={memory} /> : null}
        {activeTab === "trace" ? <TraceOperations trace={trace} /> : null}
      </div>
    </section>
  );
}

function AgentOperations({ agents }: Readonly<{ agents: AgentGraphCockpitModel }>) {
  return (
    <div className="governance-layout">
      <div className="agent-roster">
        {agents.agents.map((agent) => (
          <div className="agent-row" key={agent.name}>
            <strong>{agent.name}</strong>
            <span>{agent.capability}</span>
            <code>{agent.modelExecution}</code>
          </div>
        ))}
      </div>
      <div className="edge-list" aria-label="Agent communication edges">
        {agents.edges.map((edge) => (
          <div className="edge-row" key={`${edge.from}-${edge.to}`}>
            <span>{edge.from}</span>
            <strong>{edge.mode}</strong>
            <span>{edge.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectorOperations({ connectors }: Readonly<{ connectors: ConnectorReadinessCockpitModel }>) {
  return (
    <div className="connector-list" aria-label="Enterprise connector readiness">
      {connectors.connectors.map((connector) => {
        const missingInputs = [...connector.missingSourceContractInputs, ...connector.missingCredentialEnvNames];

        return (
          <div className="connector-row" key={connector.name}>
            <div>
              <strong>{connector.name}</strong>
              <span>{connector.reason}</span>
            </div>
            <span className={`pill ${connector.status}`}>
              <span>{connector.status.replace(/_/gu, " ")}</span>
            </span>
            <code>{connector.allowedOperations.join(", ")}</code>
            <div className="connector-proof" aria-label={`${connector.name} readiness proof`}>
              <span>schema {connector.proof.schemaValidated ? "validated" : "required"}</span>
              <span>source {connector.proof.sourceContractConfigured ? "configured" : "required"}</span>
              <span>credentials {connector.proof.credentialsConfigured ? "configured" : "required"}</span>
              <span>writes {connector.proof.externalWritesAllowed ? "allowed" : "blocked"}</span>
            </div>
            <div className="record-strip">
              {(missingInputs.length === 0 ? ["ready"] : missingInputs).map((input) => (
                <code key={`${connector.name}-${input}`}>{input}</code>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MemoryOperations({ memory }: Readonly<{ memory: MemorySummaryCockpitModel }>) {
  return (
    <div className="governance-layout">
      <div className="memory-category-list" aria-label="Memory category list">
        {memory.categories.map((category) => (
          <span key={category}>{category}</span>
        ))}
      </div>
      <div className="memory-record-list" aria-label="Memory records">
        {memory.records.map((record) => (
          <div className="memory-row" key={record.id}>
            <strong>{record.category}</strong>
            <span>{record.trustLevel}</span>
            <code>{record.scope}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function TraceOperations({ trace }: Readonly<{ trace: TraceCockpitModel }>) {
  return (
    <div className="trace-list">
      {trace.events.map((event) => (
        <div className="trace-row" key={event.id}>
          <div>
            <strong>{event.label}</strong>
            <span>{event.deterministicBasis}</span>
          </div>
          <span className={`pill ${event.status}`}>
            <span>{event.status.replace("_", " ")}</span>
          </span>
          <div className="record-strip">
            {event.recordIds.map((recordId, index) => (
              <code key={`${event.id}-${recordId}-${String(index)}`}>{recordId}</code>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

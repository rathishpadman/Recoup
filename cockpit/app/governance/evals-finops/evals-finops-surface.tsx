import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { ScalesIcon as Scales } from "@phosphor-icons/react/dist/ssr/Scales";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import type { EvalFinopsCockpitModel } from "../../cockpit-data.ts";
import { RecordStrip, StatusPill } from "../../cockpit-shell.tsx";

export function EvalsFinopsSurface({ model }: Readonly<{ model: EvalFinopsCockpitModel }>) {
  const totalTokens = model.agentMetrics.reduce((total, agent) => total + agent.totalTokens, 0);
  const costStatus = model.unitEconomics.find((metric) => metric.metric === "Computed token cost")?.costStatus;

  return (
    <section className="governance-surface governance-workstation" data-testid="evals-finops-surface">
      <div className="governance-command-strip" aria-label="Evals and FinOps posture">
        <div>
          <ShieldCheck size={16} aria-hidden="true" />
          <span>Release</span>
          <strong>{statusLabel(model.releaseReadiness.status)}</strong>
        </div>
        <div>
          <Scales size={16} aria-hidden="true" />
          <span>Cost</span>
          <strong>{costStatusLabel(costStatus)}</strong>
        </div>
        <div>
          <Database size={16} aria-hidden="true" />
          <span>Tokens</span>
          <strong>{formatInteger(totalTokens)}</strong>
        </div>
        <div>
          <Stack size={16} aria-hidden="true" />
          <span>Blocked inputs</span>
          <strong>{String(model.blockedInputs.length)}</strong>
        </div>
      </div>

      <div className="governance-split">
        <section className="surface-panel">
          <div className="section-heading">
            <div>
              <h2>Quality gates</h2>
              <span>{String(model.evalGates.length)} release checks with deterministic basis and cited records.</span>
            </div>
          </div>
          <div className="governance-table" aria-label="Evals quality gates">
            <div className="governance-table-head trace-head">
              <span>Gate</span>
              <span>Score</span>
              <span>Status</span>
            </div>
            {model.evalGates.map((gate) => (
              <div className="trace-row governance-data-row" key={gate.gate}>
                <div>
                  <strong>{gateLabel(gate.gate)}</strong>
                  <span>{gate.deterministicBasis}</span>
                  <span>Threshold {gate.thresholdLabel}</span>
                </div>
                <code>{gate.scoreLabel}</code>
                <StatusPill status={gate.status} />
                <RecordStrip label={`${gate.gate} record IDs`} recordIds={gate.recordIds} />
              </div>
            ))}
          </div>

          <div className="section-heading">
            <div>
              <h2>Agent economics</h2>
              <span>{String(model.agentMetrics.length)} agent, workflow, and model rows from typed usage receipts.</span>
            </div>
          </div>
          <div className="governance-table" aria-label="Agent-wise usage metrics">
            <div className="governance-table-head connector-head">
              <span>Agent</span>
              <span>Runs</span>
              <span>Tokens/run</span>
              <span>Evidence</span>
            </div>
            {model.agentMetrics.map((agent) => (
              <div className="connector-row governance-data-row" key={`${agent.agentName}-${agent.workflowName}-${agent.modelId}`}>
                <div>
                  <strong>{agent.agentName}</strong>
                  <span>{workflowLabel(agent.workflowName)}</span>
                  <code>{agent.modelId}</code>
                  <span>{agent.deterministicBasis}</span>
                </div>
                <div className="connector-proof">
                  <span>{String(agent.runCount)} runs</span>
                  <span>{String(agent.blockedCount)} blocked</span>
                  <span>{String(agent.failedCount)} failed</span>
                </div>
                <div className="connector-proof">
                  <span>{agent.averageTokensPerRun} avg</span>
                  <span>{formatInteger(agent.totalTokens)} total</span>
                  <span>{agent.citedAnswerRateLabel} cited</span>
                </div>
                <div className="connector-proof">
                  <span>{String(agent.handoffCount)} handoffs</span>
                  <span>{String(agent.toolCallCount)} tools</span>
                  <span>{String(agent.guardrailTripCount)} guardrails</span>
                </div>
                <RecordStrip label={`${agent.agentName} usage records`} recordIds={agent.recordIds} />
              </div>
            ))}
          </div>

          <div className="governance-command-strip" aria-label="Prompt cache posture">
          <div>
              <Database size={16} aria-hidden="true" />
              <span>Cache hit</span>
              <strong>{model.promptCache.cacheHitRateLabel}</strong>
            </div>
            <div>
              <Stack size={16} aria-hidden="true" />
              <span>Cached input</span>
              <strong>{formatInteger(model.promptCache.cachedInputTokens)}</strong>
            </div>
            <div>
              <Stack size={16} aria-hidden="true" />
              <span>Uncached input</span>
              <strong>{formatInteger(model.promptCache.uncachedInputTokens)}</strong>
            </div>
            <div>
              <Scales size={16} aria-hidden="true" />
              <span>Savings</span>
              <strong>{model.promptCache.savingsLabel}</strong>
            </div>
          </div>

          <section>
            <div className="section-heading">
              <div>
                <h2>Unit economics</h2>
                <span>Cost and token rows stay blocked unless backed by approved pricing or provider cost import.</span>
              </div>
            </div>
            <div className="memory-category-grid" aria-label="Unit economics">
              {model.unitEconomics.map((metric) => (
                <div className={metric.costStatus === "pricing_not_configured_not_computed" ? undefined : "active"} key={metric.metric}>
                  <strong>{metric.metric}</strong>
                  <span>{metric.valueLabel}</span>
                  <small>{costStatusLabel(metric.costStatus)}</small>
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="governance-side-rail" aria-label="Evals and FinOps recommendations">
          <div className="governance-rail-section">
            <strong>Recommendations</strong>
            <span>{String(model.recommendations.length)} deterministic actions</span>
          </div>
          {model.recommendations.map((recommendation) => (
            <div className="governance-rail-section" key={recommendation.recommendationId}>
              <strong>{recommendation.title}</strong>
              <StatusPill status={recommendation.severity} />
              <span>{recommendation.recommendedAction}</span>
              <span>{recommendation.deterministicBasis}</span>
              <span>{recommendation.requiresHumanApproval ? "Human approval required" : "Read-only review"}</span>
              <RecordStrip label={`${recommendation.recommendationId} evidence`} recordIds={recommendation.recordIds} />
            </div>
          ))}

          <div className="governance-rail-section">
            <strong>Blocked inputs</strong>
            <span>{String(model.blockedInputs.length)} unavailable or incomplete sources</span>
          </div>
          {model.blockedInputs.map((input) => (
            <div className="governance-rail-section" key={input.inputId}>
              <strong>{inputLabel(input.inputId)}</strong>
              <span>{input.reason}</span>
              <RecordStrip label={`${input.inputId} required for`} recordIds={input.requiredFor} />
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    blocked: "Blocked",
    fail: "Fail",
    pass: "Pass"
  };

  return labels[status] ?? humanize(status);
}

function costStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    computed_from_owner_pricing: "Owner pricing",
    pricing_not_configured_not_computed: "Pricing blocked",
    reconciled_from_provider_cost_api: "Provider cost"
  };

  return status === undefined ? "Unavailable" : labels[status] ?? humanize(status);
}

function gateLabel(gate: string): string {
  return humanize(gate);
}

function inputLabel(inputId: string): string {
  return inputId.startsWith("recoup_model_pricing:") ? `Pricing for ${inputId.split(":")[1] ?? "model"}` : humanize(inputId);
}

function workflowLabel(workflowName: string): string {
  return humanize(workflowName);
}

function humanize(value: string): string {
  return value.replace(/[_-]/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

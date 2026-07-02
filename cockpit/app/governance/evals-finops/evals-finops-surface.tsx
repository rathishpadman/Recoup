import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { ClipboardTextIcon as ClipboardText } from "@phosphor-icons/react/dist/ssr/ClipboardText";
import { CoinsIcon as Coins } from "@phosphor-icons/react/dist/ssr/Coins";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import type { EvalFinopsCockpitModel } from "../../cockpit-data.ts";

interface SummaryCard {
  label: string;
  target: string;
  tone: "good" | "watch" | "info";
  value: string;
}

interface PersonaKpi {
  metricOne: string;
  metricOneTarget: string;
  metricTwo: string;
  metricTwoTarget: string;
  persona: string;
}

interface ActionRow {
  action: string;
  due: string;
  id: string;
  owner: string;
  priority: string;
  status: string;
}

export function EvalsFinopsSurface({ model }: Readonly<{ model: EvalFinopsCockpitModel }>) {
  const releaseGateCount = model.evalGates.length;
  const releaseGatePassCount = model.evalGates.filter((gate) => gate.status === "pass").length;
  const scoredEvalCount = model.evalGates.filter((gate) => hasNumericLabel(gate.scoreLabel)).length;
  const totalRuns = sum(model.agentMetrics.map((agent) => agent.runCount));
  const totalTokens = sum(model.agentMetrics.map((agent) => agent.totalTokens));
  const toolCalls = sum(model.agentMetrics.map((agent) => agent.toolCallCount));
  const handoffs = sum(model.agentMetrics.map((agent) => agent.handoffCount));
  const guardrailTrips = sum(model.agentMetrics.map((agent) => agent.guardrailTripCount));
  const inputTokens = model.promptCache.cachedInputTokens + model.promptCache.uncachedInputTokens;
  const outputAndReasoningTokens = Math.max(totalTokens - inputTokens, 0);
  const costMetrics = model.unitEconomics.filter((metric) => isRenderableKpiValue(metric.valueLabel));
  const computedCostMetrics = costMetrics.filter((metric) => metric.costStatus !== "pricing_not_configured_not_computed");
  const costConfidencePercent = costMetrics.length === 0 ? 0 : Math.round((computedCostMetrics.length / costMetrics.length) * 100);
  const evidenceRate = weightedPercentFromLabels(model.agentMetrics.map((agent) => ({
    count: agent.runCount,
    percentLabel: agent.citedAnswerRateLabel
  })));
  const averageTokensPerRun = totalRuns === 0 ? 0 : Math.round(totalTokens / totalRuns);
  const summaryCards: SummaryCard[] = [
    {
      label: "Release Gates",
      target: `target = ${String(releaseGateCount)}/${String(releaseGateCount)}`,
      tone: releaseGatePassCount === releaseGateCount ? "good" : "watch",
      value: `${String(releaseGatePassCount)}/${String(releaseGateCount)}`
    },
    {
      label: "Eval Coverage",
      target: `scored = ${String(scoredEvalCount)}/${String(releaseGateCount)}`,
      tone: scoredEvalCount === releaseGateCount ? "good" : "watch",
      value: `${String(scoredEvalCount)}/${String(releaseGateCount)}`
    },
    {
      label: "Cost Confidence",
      target: `${String(computedCostMetrics.length)} priced metrics`,
      tone: costConfidencePercent >= 80 ? "good" : "watch",
      value: `${String(costConfidencePercent)}%`
    },
    {
      label: "Pending Actions",
      target: "deterministic queue",
      tone: model.recommendations.length === 0 ? "good" : "info",
      value: formatInteger(model.recommendations.length)
    },
    {
      label: "Evals Run",
      target: "typed receipts",
      tone: totalRuns > 0 ? "good" : "info",
      value: formatInteger(totalRuns)
    }
  ];
  const personaKpis = buildPersonaKpis({
    averageTokensPerRun,
    costConfidencePercent,
    evidenceRate,
    guardrailTrips,
    releaseGateCount,
    releaseGatePassCount,
    scoredEvalCount,
    totalRuns
  });
  const actions = model.recommendations.slice(0, 4).map(mapActionRow);

  return (
    <section className="evals-finops-dashboard" data-testid="evals-finops-surface">
      <div className="evals-finops-toolbar" aria-label="Evals and FinOps filters">
        <span>Last 30 days</span>
        <span>{new Date(model.generatedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>

      <div className="evals-finops-kpi-strip" aria-label="Evals and FinOps KPI summary">
        {summaryCards.map((card) => (
          <article className={`evals-finops-kpi-card ${card.tone}`} key={card.label}>
            <div>
              {summaryIcon(card.label)}
              <span>{card.label}</span>
            </div>
            <strong>{card.value}</strong>
            <small>{card.target}</small>
            <i style={{ width: progressWidth(card) }} />
          </article>
        ))}
      </div>

      {model.agentMetrics.length > 0 ? (
        <section className="evals-finops-panel">
          <div className="evals-finops-panel-heading">
            <h2>Agent Scorecard</h2>
            <span>{formatInteger(totalRuns)} runs / {formatInteger(totalTokens)} tokens / {formatInteger(toolCalls)} tool calls</span>
          </div>
          <div className="evals-finops-scorecard-scroll">
            <table className="evals-finops-scorecard-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Runs</th>
                  <th>Goal Fulfilment</th>
                  <th>Tool Calls/run</th>
                  <th>Review Rate</th>
                  <th>Guardrails/run</th>
                  <th>Tokens/run</th>
                  <th>Evidence Hit%</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {model.agentMetrics.map((agent) => {
                  const agentCompletedRuns = Math.max(agent.runCount - agent.blockedCount - agent.failedCount, 0);
                  const reviewRate = formatPercent(agent.blockedCount, agent.runCount);
                  const guardrailRate = formatDecimal(agent.guardrailTripCount / Math.max(agent.runCount, 1), 1);
                  const toolCallsPerRun = formatDecimal(agent.toolCallCount / Math.max(agent.runCount, 1), 1);
                  const statusTone = agent.failedCount > 0 || agent.blockedCount > 0 ? "watch" : "good";

                  return (
                    <tr key={`${agent.agentName}-${agent.workflowName}-${agent.modelId}`}>
                      <td>
                        <strong>{agent.agentName}</strong>
                        <span>{workflowLabel(agent.workflowName)}</span>
                      </td>
                      <td>{formatInteger(agent.runCount)}</td>
                      <td className="good-text">{formatPercent(agentCompletedRuns, agent.runCount)}</td>
                      <td>{toolCallsPerRun}</td>
                      <td>{reviewRate}</td>
                      <td>{guardrailRate}</td>
                      <td>{agent.averageTokensPerRun}</td>
                      <td className="good-text">{agent.citedAnswerRateLabel}</td>
                      <td>
                        <span className={`evals-finops-status ${statusTone}`}>
                          {statusTone === "good" ? "Healthy" : "Review"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="evals-finops-grid">
        <section className="evals-finops-panel">
          <div className="evals-finops-panel-heading">
            <h2>Persona KPI Matrix</h2>
            <span>role-based KPI view</span>
          </div>
          <table className="evals-finops-persona-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Metric 1</th>
                <th>Metric 2</th>
              </tr>
            </thead>
            <tbody>
              {personaKpis.map((persona) => (
                <tr key={persona.persona}>
                  <td>{persona.persona}</td>
                  <td>
                    <strong>{persona.metricOne}</strong>
                    <span>{persona.metricOneTarget}</span>
                  </td>
                  <td>
                    <strong>{persona.metricTwo}</strong>
                    <span>{persona.metricTwoTarget}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="evals-finops-panel">
          <div className="evals-finops-panel-heading">
            <h2>Token Usage</h2>
            <span>typed usage receipts</span>
          </div>
          <div className="evals-finops-token-grid">
            <MetricTile label="Input" support="observed" value={formatCompact(inputTokens)} />
            <MetricTile label="Cached" support={model.promptCache.cacheHitRateLabel} value={formatCompact(model.promptCache.cachedInputTokens)} />
            <MetricTile label="Output + reasoning" support="derived" value={formatCompact(outputAndReasoningTokens)} />
            <MetricTile label="Guardrails" support="trips" value={formatCompact(guardrailTrips)} />
          </div>
          <div className="evals-finops-token-split" aria-label="Token usage ratios">
            <MetricTile label="Cache-to-write" support="cached / uncached" value={ratioLabel(model.promptCache.cachedInputTokens, model.promptCache.uncachedInputTokens)} />
            <MetricTile label="Handoffs" support="total" value={formatInteger(handoffs)} />
            <MetricTile label="Tool calls" support="total" value={formatInteger(toolCalls)} />
          </div>
        </section>
      </div>

      {costMetrics.length > 0 ? (
        <section className="evals-finops-panel">
          <div className="evals-finops-panel-heading">
            <h2>Cost Efficiency</h2>
            <span>{String(costMetrics.length)} reproducible cost or unit metrics</span>
          </div>
          <div className="evals-finops-efficiency-grid">
            {costMetrics.map((metric) => (
              <MetricTile
                key={metric.metric}
                label={metricLabel(metric.metric)}
                support={metricSupport(metric)}
                value={metricValueLabel(metric)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {actions.length > 0 ? (
        <section className="evals-finops-panel">
          <div className="evals-finops-panel-heading">
            <h2>Action Queue</h2>
            <span>top {String(actions.length)} deterministic recommendations</span>
          </div>
          <table className="evals-finops-action-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Owner</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.id}>
                  <td>{action.action}</td>
                  <td>{action.owner}</td>
                  <td>
                    <span className="evals-finops-status watch">{action.priority}</span>
                  </td>
                  <td>{action.due}</td>
                  <td>{action.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}

function MetricTile({ label, support, value }: Readonly<{ label: string; support: string; value: string }>) {
  return (
    <article className="evals-finops-metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{support}</small>
    </article>
  );
}

function buildPersonaKpis(input: {
  averageTokensPerRun: number;
  costConfidencePercent: number;
  evidenceRate: string;
  guardrailTrips: number;
  releaseGateCount: number;
  releaseGatePassCount: number;
  scoredEvalCount: number;
  totalRuns: number;
}): PersonaKpi[] {
  return [
    {
      metricOne: `${String(input.costConfidencePercent)}%`,
      metricOneTarget: "cost confidence",
      metricTwo: input.totalRuns === 0 ? "0" : formatInteger(input.totalRuns),
      metricTwoTarget: "agent runs"
    },
    {
      metricOne: `${String(input.releaseGatePassCount)}/${String(input.releaseGateCount)}`,
      metricOneTarget: "release gates",
      metricTwo: input.evidenceRate,
      metricTwoTarget: "evidence hit rate"
    },
    {
      metricOne: `${String(input.scoredEvalCount)}/${String(input.releaseGateCount)}`,
      metricOneTarget: "scored evals",
      metricTwo: formatPercent(input.guardrailTrips, Math.max(input.totalRuns, 1)),
      metricTwoTarget: "guardrail trip rate"
    },
    {
      metricOne: input.averageTokensPerRun === 0 ? "0" : formatInteger(input.averageTokensPerRun),
      metricOneTarget: "tokens/run",
      metricTwo: formatInteger(input.totalRuns),
      metricTwoTarget: "workflow runs"
    }
  ].map((persona, index) => ({
    persona: ["CFO", "Controller", "AI Governance", "Product Ops"][index] ?? "Persona",
    ...persona
  }));
}

function mapActionRow(recommendation: EvalFinopsCockpitModel["recommendations"][number]): ActionRow {
  return {
    action: actionTitle(recommendation),
    due: "Next review",
    id: recommendation.recommendationId,
    owner: actionOwner(recommendation),
    priority: recommendation.severity === "critical" ? "High" : recommendation.severity === "important" ? "Medium" : "Low",
    status: recommendation.requiresHumanApproval ? "Pending" : "Review"
  };
}

function actionTitle(recommendation: EvalFinopsCockpitModel["recommendations"][number]): string {
  const actionText = `${recommendation.title} ${recommendation.recommendedAction}`.toLowerCase();
  if (recommendation.recommendationId.startsWith("quality-gate-failed")) {
    return "Inspect eval gate variance";
  }
  if (recommendation.recommendationId.startsWith("pricing")) {
    return "Approve model pricing";
  }
  if (recommendation.recommendationId.startsWith("eval-labels")) {
    return "Approve eval labels";
  }
  if (recommendation.recommendationId.startsWith("guardrail")) {
    return "Review guardrail trips";
  }
  if (recommendation.recommendationId.includes("cache") || actionText.includes("cache")) {
    return "Review cache savings proof";
  }
  if (recommendation.recommendationId.includes("batch")) {
    return "Review async eval candidate";
  }

  return "Review deterministic recommendation";
}

function actionOwner(recommendation: EvalFinopsCockpitModel["recommendations"][number]): string {
  if (recommendation.recommendationId.startsWith("pricing")) {
    return "Finance";
  }
  if (recommendation.recommendationId.startsWith("eval-labels") || recommendation.recommendationId.startsWith("quality")) {
    return "Evaluator";
  }
  if (recommendation.recommendationId.includes("cache") || recommendation.recommendationId.includes("batch")) {
    return "Platform";
  }

  return "Governance";
}

function metricLabel(metric: string): string {
  if (metric === "Disputed amount denominator") {
    return "Disputed amount";
  }

  return metric;
}

function metricSupport(metric: EvalFinopsCockpitModel["unitEconomics"][number]): string {
  if (metric.metric === "Cached-token savings" && metric.valueLabel.startsWith("USD ")) {
    return "USD / owner pricing";
  }
  if (metric.costStatus === "reconciled_from_provider_cost_api") {
    return "provider cost";
  }
  if (metric.costStatus === "computed_from_owner_pricing") {
    return "owner pricing";
  }

  return "token KPI";
}

function metricValueLabel(metric: EvalFinopsCockpitModel["unitEconomics"][number]): string {
  if (metric.metric === "Cached-token savings" && metric.valueLabel.startsWith("USD ")) {
    return metric.valueLabel.replace("USD ", "");
  }
  if (/^\d+\.\d+$/u.test(metric.valueLabel)) {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    }).format(Number(metric.valueLabel));
  }

  return metric.valueLabel;
}

function isRenderableKpiValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !normalized.includes("pricing not configured") &&
    !normalized.includes("usage unavailable") &&
    !normalized.startsWith("no ")
  );
}

function hasNumericLabel(value: string): boolean {
  return Number.isFinite(Number(value));
}

function progressWidth(card: SummaryCard): string {
  if (card.value.includes("/")) {
    const [numerator, denominator] = card.value.split("/").map((value) => Number(value));
    return `${String(Math.min(Math.max(((numerator ?? 0) / Math.max(denominator ?? 1, 1)) * 100, 6), 100))}%`;
  }
  if (card.value.endsWith("%")) {
    return `${String(Math.min(Math.max(Number(card.value.replace("%", "")), 6), 100))}%`;
  }

  return card.tone === "good" ? "100%" : "62%";
}

function summaryIcon(label: string) {
  if (label === "Release Gates") {
    return <CheckCircle size={18} aria-hidden="true" />;
  }
  if (label === "Eval Coverage") {
    return <ClipboardText size={18} aria-hidden="true" />;
  }
  if (label === "Cost Confidence") {
    return <Coins size={18} aria-hidden="true" />;
  }
  if (label === "Pending Actions") {
    return <Stack size={18} aria-hidden="true" />;
  }

  return <ChartBar size={18} aria-hidden="true" />;
}

function weightedPercentFromLabels(values: Array<{ count: number; percentLabel: string }>): string {
  const totalCount = sum(values.map((value) => value.count));
  if (totalCount === 0) {
    return "0.0%";
  }
  const weighted = values.reduce((total, value) => total + parsePercent(value.percentLabel) * value.count, 0);
  return `${(weighted / totalCount).toFixed(1)}%`;
}

function parsePercent(value: string): number {
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratioLabel(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return numerator === 0 ? "0:1" : `${formatDecimal(numerator, 1)}:1`;
  }

  return `${formatDecimal(numerator / denominator, 1)}:1`;
}

function workflowLabel(workflowName: string): string {
  return workflowName.replace(/[_-]/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    notation: value >= 10_000 ? "compact" : "standard"
  }).format(value);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "0.0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatDecimal(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits
  }).format(value);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

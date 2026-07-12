import { CalculatorIcon as Calculator } from "@phosphor-icons/react/dist/ssr/Calculator";
import { ChartBarIcon as ChartBar } from "@phosphor-icons/react/dist/ssr/ChartBar";
import { CoinsIcon as Coins } from "@phosphor-icons/react/dist/ssr/Coins";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/ssr/Database";
import { LightningIcon as Lightning } from "@phosphor-icons/react/dist/ssr/Lightning";
import { StackIcon as Stack } from "@phosphor-icons/react/dist/ssr/Stack";
import { TimerIcon as Timer } from "@phosphor-icons/react/dist/ssr/Timer";
import type { PersonaFinopsCockpitModel } from "../../../src/services/evalsFinopsTypes.ts";

type WorkflowMetric = PersonaFinopsCockpitModel["workflowMetrics"][number];

export function PersonaFinopsSurface({ displayName, model, periodDays }: Readonly<{ displayName: string; model: PersonaFinopsCockpitModel; periodDays: 7 | 30 }>) {
  const pricingRows = uniquePricingRows(model.workflowMetrics);
  const personaLabel = model.persona === "maya" ? "Maya" : model.persona === "david" ? "David" : "Consolidated";

  return (
    <section className="persona-finops" data-testid="persona-finops-surface">
      <div className="persona-finops-context" aria-label="FinOps source status">
        <div>
          <strong>{displayName}</strong>
          <span className={`persona-finops-source ${model.sourceStatus.usage}`}>Usage source {statusLabel(model.sourceStatus.usage)}</span>
          <span className={`persona-finops-source ${model.sourceStatus.pricing}`}>Pricing source {statusLabel(model.sourceStatus.pricing)}</span>
          <span className={`persona-finops-source ${model.sourceStatus.recommendations}`}>Recommendations {statusLabel(model.sourceStatus.recommendations)}</span>
          <span className={`persona-finops-source ${freshnessStatusClass(model.freshnessStatus)}`}>{freshnessLabel(model.freshnessStatus)}</span>
        </div>
        <nav className="persona-finops-periods" aria-label="FinOps period">
          <a aria-current={periodDays === 7 ? "page" : undefined} href="?period=7">7 days</a>
          <a aria-current={periodDays === 30 ? "page" : undefined} href="?period=30">30 days</a>
        </nav>
        {model.sourceAsOf.usageIso === undefined ? null : <span>Usage through {formatDateTime(model.sourceAsOf.usageIso)}</span>}
        {model.sourceAsOf.pricingIso === undefined ? null : <span>Pricing effective {formatDate(model.sourceAsOf.pricingIso)}</span>}
      </div>

      {model.blockedInputs.length > 0 ? (
        <section className="persona-finops-alert" aria-label="Unavailable FinOps inputs">
          <strong>Source attention required</strong>
          <ul>{model.blockedInputs.map((input) => <li key={input.inputId}>{input.reason}</li>)}</ul>
        </section>
      ) : null}

      {model.workflowMetrics.length === 0 ? (
        <section className="persona-finops-empty">
          <Database size={22} />
          <div>
            <h2>No source-backed agent usage recorded</h2>
            <p>{personaLabel} FinOps will populate after typed usage receipts are stored for the selected period.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="persona-finops-kpis" aria-label="Agent cost engineering summary">
            <Kpi icon={<Lightning size={18} />} label="Runs" value={formatInteger(model.summary.runCount)} support="typed usage receipts" />
            {model.summary.totalCostLabel === undefined ? null : (
              <Kpi accent icon={<Coins size={18} />} label="Total cost" value={model.summary.totalCostLabel} support={`${periodDays}-day calculated spend`} />
            )}
            {model.summary.averageCostPerRunLabel === undefined ? null : (
              <Kpi icon={<Calculator size={18} />} label="Cost / run" value={model.summary.averageCostPerRunLabel} support="backend Decimal average" />
            )}
            {model.summary.costPerCitedAnswerLabel === undefined ? null : (
              <Kpi icon={<ChartBar size={18} />} label="Cost / cited answer" value={model.summary.costPerCitedAnswerLabel} support="verified citations only" />
            )}
            <Kpi icon={<Stack size={18} />} label="Tokens / run" value={model.summary.tokensPerRunLabel} support="backend calculated" />
            <Kpi icon={<Database size={18} />} label="Cache-hit rate" value={model.summary.cacheHitRateLabel} support="observed input tokens" />
            {model.summary.cacheSavingsLabel === undefined ? null : (
              <Kpi icon={<Database size={18} />} label="Cache savings" value={model.summary.cacheSavingsLabel} support="proven vs uncached price" />
            )}
            {model.summary.latencyP95Label === "Unavailable" ? null : (
              <Kpi icon={<Timer size={18} />} label="p95 latency" value={model.summary.latencyP95Label} support="provider receipt latency" />
            )}
          </section>

          <section className="persona-finops-panel" aria-labelledby="pricing-heading">
            <PanelHeading heading="Pricing and calculation" id="pricing-heading" note="Owner-approved, effective-dated model pricing" />
            {pricingRows.length === 0 ? (
              <div className="persona-finops-unavailable">
                <strong>Pricing unavailable</strong>
                <span>No exact model, tier, and effective-period pricing match is available.</span>
              </div>
            ) : (
              <div className="persona-finops-pricing-band">
                {pricingRows.map((row) => (
                  <div className="persona-finops-price-row" key={`${row.pricingId}-${row.serviceTier}`}>
                    <div className="price-model"><strong>{row.modelId}</strong><span>{row.serviceTier} tier · effective {formatDate(row.effectiveFrom)}{row.effectiveTo === undefined ? null : <> to {formatDate(row.effectiveTo)}</>}</span></div>
                    <PriceRate label="Input / 1M" value={rateLabel(row.currency, row.inputPer1mTokens)} />
                    <PriceRate label="Cached / 1M" value={rateLabel(row.currency, row.cachedInputPer1mTokens)} />
                    <PriceRate label="Output / 1M" value={rateLabel(row.currency, row.outputPer1mTokens)} />
                    <PriceRate label="Reasoning / 1M" value={rateLabel(row.currency, row.reasoningPer1mTokens)} />
                    <details className="price-proof"><summary>Pricing approval and source</summary><div><code>{row.pricingId}</code><span>Hash {shortId(row.pricingHash)}</span><span>Approved {row.approvedBy}</span><a href={row.providerSourceUrl} rel="noreferrer" target="_blank">Provider source</a><span>Retrieved {formatDateTime(row.sourceRetrievedAt)}</span></div></details>
                  </div>
                ))}
              </div>
            )}
            <div className="workflow-provenance-list">
              {model.workflowMetrics.map((metric) => (
                <details key={workflowKey(metric)}>
                  <summary>Workflow provenance · {metric.workflowLabel} · {metric.modelId} · {metric.serviceTier ?? "tier unavailable"}</summary>
                  <div>
                    <strong>Deterministic basis</strong><p>{metric.deterministicBasis}</p>
                    <strong>Calculation basis</strong><p>{metric.costCalculationBasis}</p>
                    <EvidenceList ids={metric.usageRunIds} label="Usage run IDs" />
                    <EvidenceList ids={metric.sourceReceiptIds} label="Source receipt IDs" />
                    <EvidenceList ids={metric.recordIds} label="Record IDs" />
                    <strong>Pricing provenance</strong>
                    {metric.pricingProvenance.length === 0 ? <p>Pricing provenance unavailable.</p> : metric.pricingProvenance.map((pricing) => (
                      <div className="workflow-pricing-proof" key={pricing.pricingId}>
                        <p>Pricing ID <code>{pricing.pricingId}</code></p>
                        <p>Pricing hash <code>{pricing.pricingHash}</code></p>
                        <p>Tier {pricing.serviceTier} · currency {pricing.currency}</p>
                        <p>Input / 1M {pricing.inputPer1mTokens} · cached input / 1M {pricing.cachedInputPer1mTokens} · output / 1M {pricing.outputPer1mTokens} · reasoning / 1M {pricing.reasoningPer1mTokens}</p>
                        <p>Effective {formatDateTime(pricing.effectiveFrom)}{pricing.effectiveTo === undefined ? " with no configured end" : ` to ${formatDateTime(pricing.effectiveTo)}`}</p>
                        <p>Approved by {pricing.approvedBy} · retrieved {formatDateTime(pricing.sourceRetrievedAt)}</p>
                        <p>Provider source <a href={pricing.providerSourceUrl} rel="noreferrer" target="_blank">{pricing.providerSourceUrl}</a></p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="persona-finops-panel" aria-labelledby="scorecard-heading">
            <PanelHeading heading="Workflow cost scorecard" id="scorecard-heading" note="Dollars attach to workflows; participating agents are trace evidence" />
            <div aria-label="Workflow cost scorecard table" className="persona-finops-scroll" role="region" tabIndex={0}>
              <table className="persona-finops-table scorecard-table">
                <thead><tr><th>Workflow / model</th><th>Runs</th><th>Success rate</th><th>Tokens / run</th><th>Tools / run</th><th>Evidence hit</th><th>Computed cost</th><th>Cost status</th><th>Detail</th></tr></thead>
                <tbody>{model.workflowMetrics.map((metric) => (
                  <tr key={workflowKey(metric)}>
                    <td><strong>{metric.workflowLabel}</strong><span>{metric.modelId} · {metric.serviceTier ?? "Tier unavailable"}</span></td>
                    <td>{formatInteger(metric.runCount)}</td>
                    <td>{metric.successRateLabel}</td>
                    <td>{metric.tokensPerRunLabel}</td>
                    <td>{metric.toolCallsPerRunLabel}</td>
                    <td>{metric.citedAnswerRateLabel}</td>
                    <td>{costLabel(metric)}</td>
                    <td><span className={`cost-status-pill ${metric.costStatus === "computed_from_owner_pricing" || metric.costStatus === "reconciled_from_provider_cost_api" ? "ok" : "off"}`}>{costStatusLabel(metric)}</span></td>
                    <td><details className="scorecard-detail"><summary>Token, cost, and trace detail</summary><div><span>Uncached input <strong>{formatInteger(metric.uncachedInputTokens)}</strong></span><span>Cached input <strong className="cache-value">{formatInteger(metric.cachedInputTokens)}</strong></span><span>Output <strong>{formatInteger(metric.outputTokens)}</strong></span>{metric.reasoningTokensStatus === "observed" ? <span>Reasoning <strong>{formatInteger(metric.reasoningTokens)}</strong></span> : null}<span>Trace evidence <strong>{metric.participatingAgentNames?.length ? metric.participatingAgentNames.join(", ") : "Not recorded"}</strong></span></div></details></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <div className="persona-finops-operational-grid">
          <section className="persona-finops-panel" aria-labelledby="trend-heading">
            <PanelHeading heading="Daily token and cache trend" id="trend-heading" note="Backend grouped by receipt date" />
            <div className="persona-finops-chart-wrap">
              <DailyTrendChart trend={model.dailyTrend} />
              <div className="finops-chart-legend">
                <span><i className="legend-swatch total" aria-hidden="true" />Total tokens</span>
                <span><i className="legend-swatch cached" aria-hidden="true" />Cached input</span>
              </div>
            </div>
          </section>

          <section className="persona-finops-panel" aria-labelledby="tokens-heading">
            <PanelHeading heading="Token and cache composition" id="tokens-heading" note="Exact receipt totals by workflow" />
            <div className="persona-finops-token-list">
              {model.workflowMetrics.map((metric) => (
                <div className="persona-finops-token-row" key={workflowKey(metric)}>
                  <strong>{metric.workflowLabel} <small>{metric.modelId} · {metric.serviceTier ?? "tier unavailable"}</small></strong>
                  <div aria-hidden="true" className="finops-stack">
                    {metric.uncachedInputTokens > 0 ? <i className="seg uncached" style={{ flexGrow: metric.uncachedInputTokens }} /> : null}
                    {metric.cachedInputTokens > 0 ? <i className="seg cached" style={{ flexGrow: metric.cachedInputTokens }} /> : null}
                    {metric.outputTokens > 0 ? <i className="seg output" style={{ flexGrow: metric.outputTokens }} /> : null}
                    {metric.reasoningTokensStatus === "observed" && metric.reasoningTokens > 0 ? <i className="seg reasoning" style={{ flexGrow: metric.reasoningTokens }} /> : null}
                  </div>
                  <div className="token-measures">
                    <TokenMeasure label="Uncached input" valueLabel={formatInteger(metric.uncachedInputTokens)} tone="uncached" />
                    <TokenMeasure label="Cached input" valueLabel={formatInteger(metric.cachedInputTokens)} tone="cached" />
                    <TokenMeasure label="Output" valueLabel={formatInteger(metric.outputTokens)} tone="output" />
                    {metric.reasoningTokensStatus === "observed" ? <TokenMeasure label="Reasoning" valueLabel={formatInteger(metric.reasoningTokens)} tone="reasoning" /> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
          </div>

          <section className="persona-finops-panel" aria-labelledby="proof-heading">
            <PanelHeading heading="Optimization and provenance" id="proof-heading" note="Evidence before optimization" />
            <div className="persona-finops-proof-grid">
              <div>
                <h3>Governed recommendations</h3>
                {model.recommendations.length === 0 ? <p>No governed optimization recommendations are available for this persona and period.</p> : <ul>{model.recommendations.map((recommendation) => <li key={recommendation.recommendationId}><strong>{recommendation.title}</strong><p>{recommendation.recommendedAction}</p><span>{recommendation.requiresHumanApproval ? "Human approval required" : "Advisory"}</span><div>{recommendation.recordIds.map((id) => <code key={id}>{id}</code>)}</div></li>)}</ul>}
              </div>
              <div>
                <h3>Workflow provenance and deterministic basis</h3>
                <p>Open a workflow provenance disclosure above for complete usage-run, source-receipt, record, formula, and pricing evidence.</p>
                <p>{model.provenance.deterministicBasis}</p>
                <span>{formatInteger(model.provenance.recordIds.length)} cited records</span>
              </div>
            </div>
          </section>
        </>
      )}

      {model.captureCoverage.length > 0 ? (
        <section className="persona-finops-panel" aria-labelledby="coverage-heading">
          <PanelHeading heading="Usage capture coverage" id="coverage-heading" note="Every known OpenAI workload; costs appear only where typed receipts exist" />
          <div aria-label="Usage capture coverage table" className="persona-finops-scroll" role="region" tabIndex={0}>
            <table className="persona-finops-table coverage-table">
              <thead><tr><th>Workload</th><th>Persona</th><th>Models</th><th>Capture status</th><th>Basis</th></tr></thead>
              <tbody>{model.captureCoverage.map((entry) => (
                <tr key={`${entry.workloadLabel}:${entry.persona}`}>
                  <td><strong>{entry.workloadLabel}</strong>{entry.workflowName === undefined ? null : <span>{entry.workflowName}</span>}</td>
                  <td>{coveragePersonaLabel(entry.persona)}</td>
                  <td>{entry.models.join(", ")}</td>
                  <td><span className={`cost-status-pill ${entry.captureStatus === "typed_receipts" ? "ok" : "off"}`}>{entry.captureStatus === "typed_receipts" ? "Typed receipts" : "Not captured"}</span></td>
                  <td>{entry.note}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function DailyTrendChart({ trend }: Readonly<{ trend: PersonaFinopsCockpitModel["dailyTrend"] }>) {
  if (trend.length === 0) {
    return <p className="finops-chart-empty">No daily receipts in the selected period.</p>;
  }
  const maxTotal = Math.max(...trend.map((day) => day.totalTokens), 1);
  const barWidth = 22;
  const gap = 10;
  const chartHeight = 150;
  const labelHeight = 26;
  const width = trend.length * (barWidth + gap) + gap;
  const labelStep = Math.max(1, Math.ceil(trend.length / 8));

  return (
    <svg
      aria-label="Daily total and cached token bars from typed usage receipts"
      className="finops-trend-chart"
      preserveAspectRatio="xMinYMax meet"
      role="img"
      viewBox={`0 0 ${width} ${chartHeight + labelHeight}`}
    >
      {trend.map((day, index) => {
        const x = gap + index * (barWidth + gap);
        const totalBar = Math.max(Math.round((day.totalTokens / maxTotal) * (chartHeight - 10)), 2);
        const cachedBar = Math.round((day.cachedInputTokens / maxTotal) * (chartHeight - 10));
        return (
          <g key={day.date}>
            <title>{`${day.date}: ${formatInteger(day.totalTokens)} tokens (${formatInteger(day.cachedInputTokens)} cached input) · ${formatInteger(day.recordIds.length)} records${day.cacheSavingsStatus === "computed_from_owner_pricing" ? ` · cache savings ${day.cacheSavingsLabel}` : ""}`}</title>
            <rect className="trend-bar-total" height={totalBar} rx="2" width={barWidth} x={x} y={chartHeight - totalBar} />
            {cachedBar > 0 ? <rect className="trend-bar-cached" height={cachedBar} rx="2" width={barWidth} x={x} y={chartHeight - cachedBar} /> : null}
            {index % labelStep === 0 ? (
              <text className="trend-label" textAnchor="middle" x={x + barWidth / 2} y={chartHeight + 16}>{day.date.slice(5)}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function coveragePersonaLabel(persona: PersonaFinopsCockpitModel["captureCoverage"][number]["persona"]): string {
  if (persona === "maya") return "Maya";
  if (persona === "david") return "David";
  return "Shared";
}

function Kpi({ accent = false, icon, label, support, value }: Readonly<{ accent?: boolean; icon: React.ReactNode; label: string; support: string; value: string }>) {
  return <div className={`persona-finops-kpi${accent ? " accent" : ""}`}><div>{icon}<span>{label}</span></div><strong>{value}</strong><small>{support}</small></div>;
}

function PanelHeading({ heading, id, note }: Readonly<{ heading: string; id: string; note: string }>) {
  return <div className="persona-finops-panel-heading"><h2 id={id}>{heading}</h2><span>{note}</span></div>;
}

function PriceRate({ label, value }: Readonly<{ label: string; value: string }>) {
  return <span className="price-rate"><small>{label}</small><strong>{value}</strong></span>;
}

function TokenMeasure({ label, tone, valueLabel }: Readonly<{ label: string; tone: string; valueLabel: string }>) {
  return <span className={`token-measure ${tone}`}><i aria-hidden="true" /><span>{label}</span><strong>{valueLabel}</strong></span>;
}

function EvidenceList({ ids, label }: Readonly<{ ids: string[]; label: string }>) {
  return <div><strong>{label}</strong>{ids.length === 0 ? <p>Unavailable</p> : <ul>{ids.map((id) => <li key={id}><code>{id}</code></li>)}</ul>}</div>;
}

function uniquePricingRows(metrics: PersonaFinopsCockpitModel["workflowMetrics"]) {
  const rows = new Map<string, WorkflowMetric["pricingProvenance"][number] & { modelId: string }>();
  for (const metric of metrics) {
    for (const pricing of metric.pricingProvenance) rows.set(`${pricing.pricingId}:${pricing.serviceTier}`, { ...pricing, modelId: metric.modelId });
  }
  return [...rows.values()];
}

function costLabel(metric: WorkflowMetric): React.ReactNode {
  return metric.costStatus === "computed_from_owner_pricing" && metric.computedCostAmount !== undefined && metric.computedCostCurrency !== undefined
    ? <strong className="cost-computed">{metric.computedCostCurrency} {metric.computedCostAmount}</strong>
    : <span className="cost-muted">Pricing unavailable</span>;
}

function costStatusLabel(metric: WorkflowMetric): string {
  if (metric.costStatus === "computed_from_owner_pricing") return "Calculated from effective owner pricing";
  if (metric.costStatus === "reconciled_from_provider_cost_api") return "Provider cost reconciled";
  const labels: Record<NonNullable<WorkflowMetric["costUnavailableReason"]>, string> = {
    ambiguous_pricing: "Ambiguous effective pricing",
    missing_service_tier: "Service tier unavailable",
    non_live_execution: "Non-live execution",
    pricing_period_mismatch: "Pricing period mismatch",
    pricing_provenance_incomplete: "Pricing provenance incomplete",
    unknown_model: "No effective pricing for model"
  };
  return metric.costUnavailableReason === undefined ? "Pricing unavailable" : labels[metric.costUnavailableReason];
}

function rateLabel(currency: string, amount: string): string { return `${currency} ${amount}`; }
function workflowKey(metric: WorkflowMetric): string { return `${metric.workflowName}:${metric.modelId}:${metric.serviceTier ?? "unknown"}`; }
function statusLabel(status: "available" | "unavailable"): string { return status === "available" ? "available" : "unavailable"; }
function freshnessLabel(status: PersonaFinopsCockpitModel["freshnessStatus"]): string {
  if (status === "not_configured") return "Freshness threshold not configured";
  if (status === "unavailable") return "Freshness unavailable";
  return status === "fresh" ? "Fresh" : "Stale";
}
function freshnessStatusClass(status: PersonaFinopsCockpitModel["freshnessStatus"]): "available" | "stale" | "unavailable" {
  if (status === "fresh") return "available";
  if (status === "stale") return "stale";
  return "unavailable";
}
function formatInteger(value: number): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string): string { return new Date(value).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }); }
function formatDateTime(value: string): string { return new Date(value).toLocaleString("en-US", { day: "numeric", hour: "numeric", minute: "2-digit", month: "short", year: "numeric" }); }
function shortId(value: string): string { return value.length > 12 ? `${value.slice(0, 12)}…` : value; }

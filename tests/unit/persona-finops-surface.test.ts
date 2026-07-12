import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PersonaFinopsCockpitModel } from "../../src/services/evalsFinopsTypes.ts";
import { PersonaFinopsSurface } from "../../cockpit/components/finops/persona-finops-surface.tsx";

function modelFixture(overrides: Partial<PersonaFinopsCockpitModel> = {}): PersonaFinopsCockpitModel {
  return {
    surface: "persona-finops",
    persona: "maya",
    generatedAtIso: "2026-07-11T12:00:00.000Z",
    period: { fromIso: "2026-06-11T12:00:00.000Z", toIso: "2026-07-11T12:00:00.000Z" },
    sourceAsOf: { pricingIso: "2026-07-01T00:00:00.000Z", recommendationsIso: "2026-07-10T00:00:00.000Z", usageIso: "2026-07-11T10:00:00.000Z" },
    freshnessStatus: "not_configured",
    provenance: {
      sourceKind: "derived_backend",
      sourceName: "persona-finops-model",
      deterministicBasis: "Exact persona workflows are filtered before aggregation.",
      recordIds: ["usage-1"]
    },
    sourceStatus: { pricing: "available", recommendations: "available", usage: "available" },
    blockedInputs: [],
    captureCoverage: [
      { captureStatus: "typed_receipts", models: ["gpt-5.4"], note: "Typed usage receipts are persisted per successful live query.", persona: "maya", workflowName: "maya_forensics_query", workloadLabel: "Maya Copilot query" },
      { captureStatus: "not_captured", models: ["gpt-realtime-2", "gpt-4o-mini-transcribe"], note: "Realtime audio sessions do not persist typed usage receipts; audio token pricing is not configured.", persona: "shared", workloadLabel: "Realtime voice query" }
    ],
    summary: {
      cacheHitRateLabel: "66.7%",
      costPerOutcomeLabel: "Requires verified outcomes",
      latencyP95Label: "240 ms",
      runCount: 4,
      tokensPerRunLabel: "12,500",
      averageCostPerRunLabel: "USD 0.0443",
      cacheSavingsLabel: "USD 0.0630",
      costPerCitedAnswerLabel: "USD 0.0443",
      totalCostLabel: "USD 0.1770"
    },
    dailyTrend: [{ cacheSavingsLabel: "USD 0.0630", cacheSavingsStatus: "computed_from_owner_pricing", cachedInputTokens: 28_000, date: "2026-07-10", recordIds: ["usage-1"], totalTokens: 50_000, uncachedInputTokens: 14_000 }],
    recommendations: [{ deterministicBasis: "Observed cache utilization.", recommendationId: "rec-1", recommendedAction: "Review the stable prefix with a human owner.", recordIds: ["receipt-1"], requiresHumanApproval: true, severity: "important", title: "Review cache prefix" }],
    workflowMetrics: [
      {
        workflowLabel: "Maya Forensics Query",
        workflowName: "maya_forensics_query",
        participatingAgentNames: ["Forensics Investigator", "Evidence Retriever"],
        modelId: "gpt-5.4",
        serviceTier: "default",
        runCount: 4,
        successRateLabel: "75.0%",
        tokensPerRunLabel: "12,500",
        toolCallsPerRunLabel: "3.0",
        citedAnswerRateLabel: "100.0%",
        humanReviewRateLabel: "Unavailable",
        inputTokens: 42_000,
        cachedInputTokens: 28_000,
        uncachedInputTokens: 14_000,
        outputTokens: 8_000,
        reasoningTokens: 2_000,
        reasoningTokensStatus: "observed",
        totalTokens: 50_000,
        guardrailTripCount: 1,
        guardrailTripCountStatus: "observed",
        costStatus: "computed_from_owner_pricing",
        computedCostAmount: "0.1770",
        computedCostCurrency: "USD",
        costCalculationBasis: "Backend Decimal formula.",
        pricingProvenance: [
          {
            pricingId: "price-1",
            pricingHash: "hash-1",
            serviceTier: "default",
            inputPer1mTokens: "2.50",
            cachedInputPer1mTokens: "0.25",
            outputPer1mTokens: "15.00",
            reasoningPer1mTokens: "15.00",
            currency: "USD",
            effectiveFrom: "2026-07-01T00:00:00.000Z"
            ,approvedBy: "human:finops-owner",
            providerSourceUrl: "https://openai.com/api/pricing/",
            sourceRetrievedAt: "2026-07-01T00:00:00.000Z"
          }
        ],
        usageRunIds: ["run-1"],
        sourceReceiptIds: ["receipt-1"],
        deterministicBasis: "Typed usage receipts grouped by exact workflow.",
        recordIds: ["usage-1"]
      }
    ],
    ...overrides
  };
}

function workflowMetricFixture(): PersonaFinopsCockpitModel["workflowMetrics"][number] {
  const metric = modelFixture().workflowMetrics[0];
  if (metric === undefined) {
    throw new Error("Persona FinOps workflow fixture is required.");
  }
  return metric;
}

describe("PersonaFinopsSurface", () => {
  it("scopes every supporting FinOps selector to the persona surface", () => {
    const css = readFileSync("cockpit/app/styles.css", "utf8");
    const supportingClasses = [
      "coverage-table",
      "finops-chart-empty",
      "finops-chart-legend",
      "finops-stack",
      "finops-trend-chart",
      "legend-swatch",
      "price-model",
      "price-proof",
      "price-rate",
      "scorecard-detail",
      "scorecard-table",
      "token-measure",
      "token-measures",
      "workflow-provenance-list"
    ];

    for (const className of supportingClasses) {
      expect(css).not.toMatch(new RegExp(`(^|\\n)\\.${className}(?:[\\s:{.#>]|$)`, "u"));
      expect(css).toContain(`.persona-finops .${className}`);
    }
  });

  it("keeps the mobile context row contained at 375px", () => {
    const css = readFileSync("cockpit/app/styles.css", "utf8");
    expect(css).toMatch(/\.persona-finops-context > div\s*\{[^}]*min-width:\s*0;[^}]*flex-wrap:\s*wrap;/su);
  });
  it("renders backend token, pricing, formula, workflow cost, and provenance evidence", () => {
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", model: modelFixture(), periodDays: 30 }));

    for (const label of [
      "Workflow cost scorecard",
      "Token and cache composition",
      "Pricing and calculation",
      "Optimization and provenance",
      "Total cost",
      "USD 0.1770",
      "Cost / run",
      "Cost / cited answer",
      "Cache savings",
      "Forensics Investigator",
      "USD 0.1770",
      "2.50",
      "0.25",
      "15.00",
      "Backend Decimal formula.",
      "receipt-1"
      ,"Maya Patel",
      "Tokens / run",
      "Cache-hit rate",
      "p95 latency",
      "Success rate",
      "Tools / run",
      "Evidence hit",
      "Daily token and cache trend",
      "USD 0.0630",
      "Review cache prefix"
      ,"Freshness threshold not configured",
      "Provider source",
      "Workflow provenance",
      "run-1",
      "usage-1",
      "Usage capture coverage",
      "Maya Copilot query",
      "Realtime voice query",
      "Typed receipts",
      "Not captured"
    ]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("$0");
    expect(html).not.toContain("Agent cost scorecard");
    expect(html).toContain('role="region" tabindex="0"');
    expect(html).toContain('class="persona-finops-pricing-band"');
    expect(html).toContain('class="persona-finops-operational-grid"');
    expect(html).toContain("Token, cost, and trace detail");
    expect(html).toContain("Pricing approval and source");
    expect(html).toContain("?period=7");
    expect(html).toContain("?period=30");
  });

  it("fails closed without rendering unavailable pricing as zero cost", () => {
    const unpricedMetric = { ...workflowMetricFixture() };
    delete unpricedMetric.computedCostAmount;
    delete unpricedMetric.computedCostCurrency;
    const unavailable = modelFixture({
      sourceStatus: { pricing: "unavailable", recommendations: "available", usage: "available" },
      blockedInputs: [{ inputId: "recoup_model_pricing", reason: "Model pricing source read failed." }],
      workflowMetrics: [
        {
          ...unpricedMetric,
          costStatus: "pricing_not_configured_not_computed",
          pricingProvenance: []
        }
      ]
    });
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", model: unavailable, periodDays: 30 }));

    expect(html).toContain("Pricing unavailable");
    expect(html).toContain("Model pricing source read failed.");
    expect(html).not.toContain("USD 0.0000");
    expect(html).not.toContain("$0");
  });

  it("renders an explicit source-backed empty state", () => {
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", model: modelFixture({ workflowMetrics: [] }), periodDays: 30 }));

    expect(html).toContain("No source-backed agent usage recorded");
    expect(html).not.toContain("0 runs");
  });

  it("keeps every receipt ID accessible in the workflow provenance disclosure", () => {
    const metric = workflowMetricFixture();
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", periodDays: 30,
      model: modelFixture({
        workflowMetrics: [{ ...metric, sourceReceiptIds: ["receipt-1", "receipt-2", "receipt-3", "receipt-4", "receipt-5", "receipt-6"] }]
      })
    }));

    expect(html).toContain("receipt-6</code>");
    expect(html).not.toContain("additional receipt retained");
    expect(html).toContain("<details");
    expect(html).toContain("Pricing ID <code>price-1</code>");
    expect(html).toContain("Pricing hash <code>hash-1</code>");
    expect(html).toContain("Input / 1M 2.50 · cached input / 1M 0.25 · output / 1M 15.00 · reasoning / 1M 15.00");
    expect(html).toContain("Approved by human:finops-owner");
    expect(html).toContain("https://openai.com/api/pricing/");
  });

  it.each([
    ["fresh", "available", "Fresh"],
    ["stale", "stale", "Stale"],
    ["not_configured", "unavailable", "Freshness threshold not configured"],
    ["unavailable", "unavailable", "Freshness unavailable"]
  ] as const)("renders %s freshness with semantic %s styling", (freshnessStatus, semanticClass, label) => {
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, {
      displayName: "Maya Patel",
      model: modelFixture({ freshnessStatus }),
      periodDays: 30
    }));

    expect(html).toContain(`persona-finops-source ${semanticClass}`);
    expect(html).toContain(`>${label}</span>`);
  });

  it("hides unavailable reasoning instead of rendering a zero or unavailable chip", () => {
    const metric = workflowMetricFixture();
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", periodDays: 30,
      model: modelFixture({ workflowMetrics: [{ ...metric, reasoningTokens: 0, reasoningTokensStatus: "unavailable" }] })
    }));

    expect(html).not.toContain("token-measure reasoning");
    expect(html).not.toMatch(/Reasoning[\s\S]{0,40}<strong>0<\/strong>/u);
  });

  it("hides the latency and outcome KPIs while they have no observed data", () => {
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", periodDays: 30,
      model: modelFixture({
        summary: {
          cacheHitRateLabel: "66.7%",
          costPerOutcomeLabel: "Requires verified outcomes",
          latencyP95Label: "Unavailable",
          runCount: 4,
          tokensPerRunLabel: "12,500"
        }
      })
    }));

    expect(html).not.toContain("p95 latency");
    expect(html).not.toContain("Requires verified outcomes");
    expect(html).not.toContain("Human review");
    expect(html).not.toContain("Total cost");
  });

  it("renders every mixed-model workflow calculation basis without assigning the first basis globally", () => {
    const first = workflowMetricFixture();
    const firstPricing = first.pricingProvenance[0];
    if (firstPricing === undefined) {
      throw new Error("Persona FinOps pricing fixture is required.");
    }
    const second = {
      ...first,
      workflowLabel: "Recovery Drafting",
      workflowName: "recovery_drafting",
      modelId: "gpt-5.4-mini",
      costCalculationBasis: "Mini tier basis using pricing-mini.",
      pricingProvenance: [{ ...firstPricing, pricingId: "pricing-mini" }]
    };
    const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, { displayName: "Maya Patel", periodDays: 30,
      model: modelFixture({ workflowMetrics: [{ ...first, costCalculationBasis: "Primary basis using pricing-primary." }, second] })
    }));

    expect(html).toContain("Primary basis using pricing-primary.");
    expect(html).toContain("Mini tier basis using pricing-mini.");
    expect(html).toContain("Maya Forensics Query");
    expect(html).toContain("Recovery Drafting");
  });

  it("explains each pricing failure mode without rendering a zero cost", () => {
    const labels = {
      ambiguous_pricing: "Ambiguous effective pricing",
      missing_service_tier: "Service tier unavailable",
      non_live_execution: "Non-live execution",
      pricing_period_mismatch: "Pricing period mismatch",
      unknown_model: "No effective pricing for model"
    } as const;
    for (const [reason, label] of Object.entries(labels)) {
      const metric = { ...workflowMetricFixture() };
      delete metric.computedCostAmount;
      delete metric.computedCostCurrency;
      const html = renderToStaticMarkup(createElement(PersonaFinopsSurface, {
        displayName: "Maya Patel",
        model: modelFixture({ workflowMetrics: [{ ...metric, costStatus: "pricing_not_configured_not_computed", costUnavailableReason: reason as keyof typeof labels, pricingProvenance: [] }] }),
        periodDays: 30
      }));
      expect(html).toContain(label);
      expect(html).not.toContain("USD 0.0000");
    }
  });
});

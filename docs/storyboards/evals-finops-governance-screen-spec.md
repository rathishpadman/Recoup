# Evals + FinOps Governance Screen Spec

Status: visual contract for Task 7 of the Evals + FinOps Governance plan.

Success check for this spec: a future build worker can implement the authenticated Governance route without inventing eval labels, usage rows, pricing, costs, savings, business outcomes, recommendations, evidence IDs, deterministic basis, or production values from mockup literals.

## 1. Route And Scope

Exact route:

- `/governance/evals-finops`

This screen belongs inside the authenticated cockpit Governance shell. It is not a landing page, public dashboard, or new home route. The final page must read from `EvalFinopsCockpitModel` and render blocked or unavailable states when the backend model cannot supply a metric.

Non-goals:

- Do not implement React, API, schema, eval, test, or production UI code from this document.
- Do not use mockup numbers, labels, IDs, costs, percentages, or status text as production values.
- Do not show dollar cost, cost-per-unit, or prompt-cache dollar savings unless the model says the value was computed from owner-approved pricing or reconciled from a trusted provider cost import.
- Do not dispatch recommendations, runtime configuration changes, pricing changes, model routing changes, external actions, approvals, or ERP writes from this screen.

## 2. Mockup Screen Contract

The seven PNGs in `mockups/imagegen/evals-finops-governance/` are visual contracts only. They show layout, density, hierarchy, and blocked-state posture. They are not data sources.

| Screen | Target file | Purpose | Required content |
| --- | --- | --- | --- |
| Governance overview | `mockups/imagegen/evals-finops-governance/01-overview-desktop.png` | First viewport for `/governance/evals-finops` | Release status strip, total token volume, cost status, blocked input count, compact Governance tab control |
| Quality gates | `mockups/imagegen/evals-finops-governance/02-quality-gates-desktop.png` | Eval health detail view | Gate matrix, pass/fail/blocked chips, score vs threshold, blocker reasons, record ID proof strip |
| Agent economics | `mockups/imagegen/evals-finops-governance/03-agent-economics-desktop.png` | Agent-wise operational metrics | Agent/workflow/model table, runs, blocked rate, tokens/run, handoffs, tool calls, guardrail trips |
| Unit economics | `mockups/imagegen/evals-finops-governance/04-unit-economics-desktop.png` | Cost efficiency and business-denominator view | Cost per case, tokens per case, cost per cited answer, cost per approved draft, prompt-cache savings, disputed-dollar denominator, cost blocked state when pricing is missing |
| Recommendations | `mockups/imagegen/evals-finops-governance/05-recommendations-desktop.png` | Deterministic action queue | Recommendation severity, deterministic basis, evidence IDs, human-approval flag, affected agent/workflow |
| Fail-closed state | `mockups/imagegen/evals-finops-governance/06-blocked-state-desktop.png` | Honest unavailable-source view | Missing pricing, missing eval labels, missing usage rows, unavailable provider cost import, cached-token savings blocked by missing pricing, no fabricated zero-cost metrics |
| Responsive state | `mockups/imagegen/evals-finops-governance/07-responsive-mobile.png` | Small viewport contract | Stacked health strip, horizontally scrollable metric tables, visible blocked-state messaging, no overlapping text |

## 3. Data Source Matrix

Every visible business value must map to `EvalFinopsCockpitModel`. React may format labels, wrap long IDs, choose badges, and arrange rows, but it must not calculate business facts beyond display-only presentation.

| Visible field or region | `EvalFinopsCockpitModel` source | Allowed UI formatting | Missing or blocked behavior |
| --- | --- | --- | --- |
| Surface identity | `surface` | Route-level sanity check; expected value is `evals-finops`. | If unexpected, render an unavailable state instead of a partial dashboard. |
| Generated timestamp or freshness | `generatedAtIso` | Human-readable freshness label. | If absent, show source freshness unavailable. |
| Overall source provenance | `provenance.sourceKind`, `provenance.sourceName`, `provenance.deterministicBasis`, `provenance.recordIds[]` | Compact source rail, proof chips, deterministic-basis text. | If record IDs or deterministic basis are missing, show governance model unavailable. |
| Release readiness status strip | `releaseReadiness.status` | Map `pass`, `fail`, `blocked` to status badges and concise human labels. | If blocked, show blocker count and required inputs; do not soften to warning-only copy. |
| Latest eval run ID | `releaseReadiness.latestEvalRunId` | Monospace proof chip or detail row. | If missing, show latest eval run unavailable. |
| Release blockers | `releaseReadiness.blockers[]` | Blocker list with gate, reason, score, threshold, and open dependencies. | If labels or thresholds are missing, show owner/source input required. |
| Quality gate names | `evalGates[].gate` | Convert known gate IDs to readable labels while preserving proof detail. | Unknown gate IDs can be shown as backend-provided text with a neutral label. |
| Quality gate status | `evalGates[].status` | Badge variants for pass, fail, blocked. | Missing status blocks the row; do not infer pass/fail from score. |
| Quality gate score | `evalGates[].scoreLabel` | Display label exactly as backend-supplied. | If unavailable, show `Unavailable` or `Blocked`, not `0` or `0%`. |
| Quality gate threshold | `evalGates[].thresholdLabel` | Display label exactly as backend-supplied. | If unavailable, show threshold input required. |
| Quality gate deterministic basis | `evalGates[].deterministicBasis` | Compact wrap in basis column or expandable row. | If missing, block the gate row from decision display. |
| Quality gate proof IDs | `evalGates[].recordIds[]` | Record ID chips with truncation only. | If empty, show proof unavailable and avoid decision-grade styling. |
| Agent name | `agentMetrics[].agentName` | Display backend string as the row title. | If missing, show unnamed agent unavailable; do not substitute roster guesses. |
| Workflow name | `agentMetrics[].workflowName` | Human-readable label may be derived from a known local mapping, with raw workflow in detail. | If unknown, show backend string; do not invent capability mapping. |
| Model ID | `agentMetrics[].modelId` | Monospace compact label. | If missing, show model unavailable. |
| Agent status label | `agentMetrics[].statusLabel` | Display backend label; badge only if status is clear. | Do not infer health from token count. |
| Run count | `agentMetrics[].runCount` | Integer display. | If usage rows are missing, show usage unavailable, not `0 runs` unless backend explicitly reports zero observed rows. |
| Blocked count | `agentMetrics[].blockedCount` | Integer display or rate if backend later supplies it. | Do not compute blocked rate without a valid denominator from the model. |
| Failed count | `agentMetrics[].failedCount` | Integer display or rate if backend later supplies it. | Do not treat missing failures as zero. |
| Total tokens | `agentMetrics[].totalTokens` | Tabular integer with compact suffix. | If usage is unavailable, show usage unavailable. |
| Average tokens per run | `agentMetrics[].averageTokensPerRun` | Display backend label. | If missing, show average unavailable; do not divide in React. |
| Handoff count | `agentMetrics[].handoffCount` | Integer display. | Missing usage rows block this value. |
| Tool call count | `agentMetrics[].toolCallCount` | Integer display. | Missing usage rows block this value. |
| Guardrail trip count | `agentMetrics[].guardrailTripCount` | Integer display with neutral or attention badge. | Missing usage rows block this value. |
| Cited answer rate | `agentMetrics[].citedAnswerRateLabel` | Display backend label. | If unavailable, show cited answer rate unavailable. |
| Agent deterministic basis | `agentMetrics[].deterministicBasis` | Basis text in row detail or tooltip. | If missing, block decision-grade usage interpretation. |
| Agent proof IDs | `agentMetrics[].recordIds[]` | Proof chips. | If empty, show proof unavailable. |
| Unit metric name | `unitEconomics[].metric` | Display backend metric label. | Unknown names can be shown as backend text only. |
| Unit metric value | `unitEconomics[].valueLabel` | Display backend label exactly. | If cost-related and pricing is blocked, show pricing required; never show a dollar zero. |
| Unit metric cost status | `unitEconomics[].costStatus` | Map status to computed, reconciled, or blocked chip. | For `pricing_not_configured_not_computed`, render blocked cost copy. |
| Unit metric deterministic basis | `unitEconomics[].deterministicBasis` | Basis text. | If missing, block the row from decision-grade interpretation. |
| Unit metric proof IDs | `unitEconomics[].recordIds[]` | Proof chips. | If empty, show proof unavailable. |
| Prompt cache status | `promptCache.status` | Status chip for active, no cached tokens, pricing blocked, or usage unavailable. | If usage unavailable, show token data unavailable and do not show hit-rate claims. |
| Cached input tokens | `promptCache.cachedInputTokens` | Integer display. | If usage unavailable, show unavailable; if zero is backend-observed, `no_cached_tokens_observed` must explain it. |
| Uncached input tokens | `promptCache.uncachedInputTokens` | Integer display. | If usage unavailable, show unavailable. |
| Cache hit rate | `promptCache.cacheHitRateLabel` | Display backend label exactly. | If unavailable, show cache hit rate unavailable. |
| Prompt-cache savings | `promptCache.savingsLabel`, `promptCache.savingsStatus` | Display savings only when status is `computed_from_owner_pricing`; otherwise show blocked/no cached tokens copy. | Missing pricing must never render `$0`, `none`, or implied no savings. |
| Prompt-cache deterministic basis | `promptCache.deterministicBasis` | Basis text. | If missing, block savings and cache interpretation. |
| Prompt-cache proof IDs | `promptCache.recordIds[]` | Proof chips. | If empty, show proof unavailable. |
| Recommendation severity | `recommendations[].severity` | Critical, important, advisory badge. | Unknown severity should render neutral and require review. |
| Recommendation title | `recommendations[].title` | Display backend title. | If missing, omit the card or show recommendation unavailable. |
| Recommended action text | `recommendations[].recommendedAction` | Display as read-only advisory copy. | Do not create buttons that dispatch changes from this screen. |
| Human approval flag | `recommendations[].requiresHumanApproval` | `Human approval required` or `Read-only display`. | If absent, default to approval required visually. |
| Recommendation basis | `recommendations[].deterministicBasis` | Required basis line in each card. | If missing, block the card. |
| Recommendation evidence IDs | `recommendations[].recordIds[]` | Required proof chips in each card. | If empty, block the card. |
| Blocked input ID | `blockedInputs[].inputId` | Monospace input or source label. | If present, show it in blocked inputs rail. |
| Blocked input reason | `blockedInputs[].reason` | Clear, source-owned reason text. | If reason is empty, show blocked input requires backend reason. |
| Blocked input required-for list | `blockedInputs[].requiredFor[]` | Compact list of affected regions. | If empty, show impacted surfaces unavailable. |

## 4. Required Blocked-State Copy

Use concise operational copy. The future UI can adapt exact line wrapping, but not the meaning.

| Missing condition | Required copy | Affected screen regions |
| --- | --- | --- |
| Missing owner-approved pricing | `Cost blocked: owner-approved model pricing is not configured. Token metrics remain visible; dollar cost and dollar savings are not computed.` | Header cost status, unit economics, prompt-cache savings, recommendations |
| Missing eval labels | `Release gate blocked: owner label manifest is missing. Labels must be supplied by the owner; Recoup will not synthesize labels.` | Release readiness, quality gates, blocked inputs, recommendations |
| Missing usage rows | `Usage unavailable: no typed agent usage rows are available for this window. Do not render zero usage, zero cost, or agent efficiency claims.` | Header token volume, agent economics, prompt cache, unit economics |
| Unavailable provider cost import | `Provider cost import unavailable: trusted provider cost buckets have not been imported. Use owner-approved pricing or keep dollar cost blocked.` | Source rail, cost status, unit economics |
| Cached tokens present but pricing missing | `Prompt-cache savings blocked: cached input tokens are observed, but dollar savings require owner-approved input and cached-input pricing.` | Prompt cache, unit economics |

Blocked-state rules:

- Missing pricing does not mean cost is zero.
- Missing usage rows do not mean no usage occurred.
- Missing labels do not mean an eval gate failed; it means the release gate is blocked.
- Missing provider cost import does not block token metrics, but it blocks provider-reconciled cost display.
- If multiple blocked inputs are present, the screen should keep the dense cockpit layout and show the blocked inputs rail instead of replacing the entire page with an empty state.

## 5. Explicit Mockup Literal Ban

The mockups may contain illustrative labels, IDs, counts, token totals, percentages, statuses, cost posture text, source labels, and recommendation text. Production code must not import, copy, hard-code, snapshot, or otherwise use those mockup literals as business values.

Mockup literals may only guide:

- Screen anatomy.
- Density and spacing.
- Table-led hierarchy.
- Status chip placement.
- Provenance rail placement.
- Responsive behavior.
- Blocked-state tone.

Production values must come from `EvalFinopsCockpitModel` or render as unavailable/blocked. This includes release status, token volume, gate scores, thresholds, record IDs, deterministic basis, agent names, model IDs, cache-hit labels, savings labels, cost values, recommendation titles, and recommendation action copy.

## 6. Accepted Visual Direction

Accepted direction:

- Dense Recoup cockpit governance surface with persistent sidebar, Governance tab strip, compact command strip, table-led work area, right-side provenance/blocked-input/recommendation rail, and restrained status chips.
- Neutral zinc/stone operational palette with sparse amber/red/green/blue state accents; no purple/blue AI-dashboard gradient language as the primary style.
- Desktop layout prioritizes scan density: release posture first, quality gate table next, then agent economics, unit economics, token optimization, sources, blockers, and recommendations.
- Mobile layout stacks the shell, health strip, rails, and tables while preserving horizontal scroll for dense comparison tables.
- Recommendation cards are read-only and evidence-forward: severity, title, action, human-approval flag, evidence IDs, and deterministic basis must all be visible or explicitly blocked.

Mockup target files:

- `mockups/imagegen/evals-finops-governance/01-overview-desktop.png`
- `mockups/imagegen/evals-finops-governance/02-quality-gates-desktop.png`
- `mockups/imagegen/evals-finops-governance/03-agent-economics-desktop.png`
- `mockups/imagegen/evals-finops-governance/04-unit-economics-desktop.png`
- `mockups/imagegen/evals-finops-governance/05-recommendations-desktop.png`
- `mockups/imagegen/evals-finops-governance/06-blocked-state-desktop.png`
- `mockups/imagegen/evals-finops-governance/07-responsive-mobile.png`

Known visual-contract note:

- The PNGs are generated from `mockups/evals-finops-governance/evals-finops-ui-mockup.html` hash-specific views. They remain acceptance targets for style and information architecture only, not exact data or production source truth.
- The June 30, 2026 remediation replaced the duplicated desktop PNGs with distinct focused screens: overview, quality gates, agent economics, unit economics, recommendations, fail-closed state, and responsive mobile.
- Current verification: desktop targets are `1440x1100`, mobile target is `390x1200`, and all seven target PNGs have distinct SHA-256 hashes.

## 7. Review Note

Reviewed against Task 7 constraints:

- No `$0` cost state is accepted. Missing pricing, missing provider cost import, and blocked savings must render blocked copy rather than zero dollar values.
- No fake business metric may be treated as production data. Any mockup token total, count, percentage, score, proof ID, or recommendation text is visual-only.
- Recommendation cards must include evidence IDs and deterministic basis before they can be displayed as actionable governance recommendations.
- Desktop and mobile visual contracts should show no obvious text overlap; long tables may scroll horizontally on mobile.
- Visual style remains dense Recoup cockpit governance: compact, table-led, provenance-forward, operational, and restrained.

## 8. Future Build Verification

Documentation and visual-contract pass only:

- `Test-Path` for this spec and all seven PNG targets.
- `git status --short`

Future production UI pass:

- Compare runtime screenshot for `/governance/evals-finops` against the accepted visual direction.
- Verify missing pricing does not render `$0`.
- Verify missing labels and missing usage rows render blocked/unavailable copy.
- Verify recommendations show deterministic basis and record IDs.
- Verify no mockup literals are used as production values.

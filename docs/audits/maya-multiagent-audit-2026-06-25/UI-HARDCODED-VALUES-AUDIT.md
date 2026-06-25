# UI Hardcoded-Values Audit — Maya shadcn Cockpit

**Date:** 2026-06-25 · **Mode:** static, no changes
**Question:** Does any frontend UI component display hardcoded business values instead of backend-sourced data?
**Scope:** all 16 files under `cockpit/components/maya/*` + `cockpit/app/forensics/shadcn/page.tsx`.

## Verdict

**🟢 PASS — no hardcoded business values found in the UI.** Every business-meaningful value rendered (amounts, verdicts, routing, customer, KPIs, evidence documents, citations, trace rows, source status) is **prop-driven from backend read models**. The string/number literals that exist fall into four legitimate categories (UI chrome, backend enum tags used for styling, fail-closed placeholders, and a sanctioned gap label) — none is fabricated business data.

Notably, this is **enforced automatically**: `tests/invariants/maya-shadcn-boundary.test.ts` (958 lines) and `tests/invariants/cockpit-no-business-logic.test.ts` assert the absence of business literals and the presence of prop reads on every CI run.

## Method

1. Grep all Maya components for business-shaped literals: currency (`$`), amounts (`1,234.56`), customer names (Greenleaf/Crestline/Harbor/NorthBay), record IDs (`S1-L1`, `INV-`, `USCU_`), percentages, dates → **0 matches**.
2. Grep for verdict/routing/status strings and `??` fallback defaults → all reads are `item.verdict`, `item.verdictLabel`, `item.routingLabel`, etc.; fallbacks are fail-closed.
3. Read the business-number renderers in full: `maya-run-kpi-strip.tsx`, `recommended-action-cell.tsx`, `source-readiness-strip.tsx`.
4. Read the enforcing invariant test to confirm coverage.

## Evidence — everything business is prop-driven

| Rendered value | Source | Evidence |
|---|---|---|
| Verdict + label | `item.verdict` / `item.verdictLabel` | `deduction-worklist-table.tsx:140-142`, `deduction-case-workspace.tsx:139` |
| Routing | `item.routingLabel` | `deduction-worklist-table.tsx:345`, `recovery-draft-review.tsx:229` |
| KPI value/support | `card.item.value` / `.support` | `maya-run-kpi-strip.tsx:118-119,167` |
| Customer / scenario / lines / evidence | `selectedWorklistItem?.*` | `deduction-case-workspace.tsx:76,166-169` |
| Recommended action | `item.recommendedActionLabel` | `recommended-action-cell.tsx:22` |
| Source status + label | `source.statusTone` / `source.stateLabel` | `source-readiness-strip.tsx`, `evidence-dossier.tsx:159` |
| Draft amount/basis/status | `draft.amount` / `.basis` / `.statusLabel` | enforced by boundary test :683-689 |
| Citations / trace rows | `response.citations` / `response.trace` | `agent-trace-panel.tsx`, `cited-answer-card.tsx` |

The displayed amount is explicitly labeled **"Backend amount, read-only"** with `aria-readonly` (boundary test :774-775) — the UI never computes or owns a dollar value.

## The literals that DO exist — and why each is acceptable

| Literal kind | Examples | Why it's not a business hardcode |
|---|---|---|
| **Backend enum tags in styling conditionals** | `statusTone === "blocked"`, `item.verdict === "valid"`, `source.statusTone === "synthetic"` | These compare a backend-provided enum (`MayaSourceTile["statusTone"]`, `item.verdict`) to choose an icon/color. The *rendered text* is always the backend field (`stateLabel`/`verdictLabel`). |
| **Fail-closed placeholders** | `?? "Unavailable"`, `"Not exposed"`, `"Priority field not exposed"`, `toBlockedConnectorReadiness(...)` setting `statusTone:"blocked"` on refresh failure (`source-readiness-strip.tsx:270,280`) | These show *absence* honestly instead of stale/fake data — the correct fail-closed pattern (matches I-30). |
| **UI chrome** | column headers, tab names ("Billing"/"Recovery"), ARIA labels, "Advisory:", "Forensics recommendation, advisory only", `navItems` | Static interface text, not business data. |
| **Sanctioned gap label** | `?? "Contract gap"` (`recovery-draft-review.tsx:79`, workspace, evidence-dossier) | The known read-model gap label for the demo scenario; the boundary test *requires* it (:659,:848). Generic category, no amount/customer/record. |
| **UI config constants** | `QUERY_QUESTION_CHARACTER_LIMIT = 500`, `sourceReadinessRefreshIntervalMs = 15*60*1000` | Interaction/polling config, not business values. |

## Transparency notes (not violations — judgment calls to be aware of)

1. **Positional KPI icon/tone [Low].** `renderKpiIcon(index)` / `kpiIconTone(index)` (`maya-run-kpi-strip.tsx:50-96`) assign the icon and color by **array position**, not by a backend-provided semantic key. The KPI *values* are backend-driven, but if the backend reorders KPIs, the icon/color meaning drifts.
   > **Proposed action (only if you want semantic stability):** have the read model supply an `iconKey`/`tone` per KPI and map from that instead of index. *Expert citation:* design-system guidance treats iconography as data-bound when icons carry meaning, not position (shadcn/Radix theming convention). Purely cosmetic — not a data-integrity issue.

2. **Client-composed narration copy [Informational].** The agent-trace process map composes some node labels/messages client-side (e.g. "Selected evidence recordIds seed the Maya query process map", `agent-trace-panel.tsx:251`) and the KPI gap card composes "Priority field not exposed". These describe *process/absence*, derived from backend data presence — not business truth (no amounts/verdicts). Consistent with the "symbolic process map" design. No action needed; just know this copy is authored in the component, not fetched.

3. **`beatTwoKpiCards` gap-card injection [Informational].** The KPI strip decides client-side to insert a "Read-model gap" card when no high-priority KPI is present (`maya-run-kpi-strip.tsx:37-48`). This is presentation handling of a *missing* backend field, not invention of a value — and the boundary test explicitly sanctions it (:862-873).

## Automated enforcement (a genuine strength to highlight)

`tests/invariants/maya-shadcn-boundary.test.ts` actively blocks regressions, e.g.:
- Forbids dollar-like literals, demo customer names, fixture evidence/action IDs, `S#-L#` IDs via regex (`obviousBusinessLiteralPatterns`, :24-45, :183-185).
- Forbids `const worklist = [`, `const kpiStrip = [`, `mockData`, `fixture`, specific fake values like `$2.74M`, `14.6 days`, `96%`, `May 24, 2025` (:163-181, :558).
- Requires prop reads (`model.worklist`, `draft.amount`, `item.verdictLabel`, …) across every beat.

This means "no hardcoded business values" is not just true today — it's a **CI gate** that fails the build if anyone reintroduces one.

## Bottom line

The frontend is **clean**: no hardcoded business values; all business data flows from backend read models; absences fail closed; and a comprehensive invariant test keeps it that way. The only optional improvement is making the KPI icon/tone backend-driven rather than positional — cosmetic, not a correctness gap.

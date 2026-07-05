# Maya Overview Remediation — Verification Checklist (2026-07-04)

Companion to `2026-07-04-maya-overview-feedback-remediation.md`. Give this to the implementing agent (Codex) and require it to answer **every checkbox with evidence** — the command output, file:line, or screenshot named in the "Proof" column. "Done" without proof does not count. Items marked **[approval-gated]** must NOT be implemented unless the user explicitly approved them; for those, the correct completed state may be "not started".

**Verdict vocabulary per item:** `DONE` (all proofs pass) / `PARTIAL` (state what is missing) / `NOT_STARTED` / `BLOCKED` (name the blocker).

---

## 0. Global gates (must all pass before any item counts)

- [ ] `npm.cmd run lint` — exit 0
- [ ] `npm.cmd run typecheck` — exit 0
- [ ] `npm.cmd run test` — full vitest suite green
- [ ] `npm.cmd run build` — passes
- [ ] `npm.cmd run test:e2e:maya-real` — passes against the real backend (kill stale `next dev` first if port conflict)
- [ ] All work is **committed** on the feature branch — paste `git log --oneline -10` and `git status --short` (must be clean)
- [ ] No purple/indigo styling drift; shadcn + `mayaAccent` teal tokens only
- [ ] No invented business values anywhere — every number/verdict/reason traces to the read model

---

## 1. "data proof" / "decision proof" chips removed from Maya header

| Check | Proof |
|---|---|
| Chips no longer render in Maya business header | Screenshot of Overview header; `rg -n "decision proof|data proof" cockpit/components/maya/` returns no header render sites |
| Hashes still available in a disclosure (tooltip / Source details) — NOT deleted from governance/audit pages | file:line of the new disclosure location; governance pages unchanged (`git diff --stat` shows no governance files) |
| Tests updated, not deleted | `tests/invariants/maya-shadcn-qa-contract.test.ts` + any e2e asserting `forensics-source-hash`/`forensics-receipt-hash` now expect the disclosure location; test run green |

## 2. Recoup Copilot launcher is a floating bottom-right FAB

| Check | Proof |
|---|---|
| `.maya-recoup-agent-float` is `position: fixed; right/bottom` in `cockpit/app/styles.css` | file:line |
| Launcher rendered once at shell level (not 3 `headerAction` sites) | `rg -n "RecoupAgentLauncher" cockpit/components/maya/` shows single render site |
| FAB visible on Overview, Worklist, AND case detail; hidden while the dock Sheet is open | 3 screenshots + 1 with dock open |
| Mobile: FAB does not cover last worklist row | 375px screenshot |
| `data-testid="recoup-agent-launcher"` + aria-label preserved; e2e updated | test run green |

## 3. KPI cards upgraded (icons, typography, verdict-coloured amounts)

| Check | Proof |
|---|---|
| Each of the 4 cards has a lucide icon chip in a status-token tile (neutral / green / red / amber) | Screenshot; file:line of icon mapping |
| Typography: label `text-xs uppercase tracking-wide`, count `text-3xl font-semibold tabular-nums`, amount `text-base font-semibold tabular-nums` | file:line |
| Amount colour: Valid→Billing **green**, Invalid→Recovery **red**, Partial→Split **amber**, total card default | Screenshot; classes use existing status tokens (`text-success`, `--status-danger-text`, `--status-warning-text`) |
| `buildOverviewSummaryCards` helper stays pure (icon mapping lives in the component) | `git diff cockpit/components/maya/maya-workspace-derived.ts` shows no icon field, or justified otherwise |
| Card values still equal backend aggregates | `test:e2e:maya-real` `assertRenderedOverviewSummaryCardsMatchBackend` passes |

## 4. Worklist verdict pills say Valid / Invalid / Partial + quick filter chips

| Check | Proof |
|---|---|
| Pills show exactly "Valid" / "Invalid" / "Partial" (bucket via `normalizeMayaVerdict`); original `verdictLabel` kept as tooltip | Screenshot + file:line, both Overview list and `deduction-worklist-table.tsx` (table/cards/rail) |
| Quick filter chips `All (n) · Valid (n) · Invalid (n) · Partial (n)` with real counts | Screenshot |
| Clicking "Invalid" filters rows and updates "Showing n of 8"; combines with the free-text filter | e2e covering `data-testid="maya-overview-verdict-filter"` green |
| No fabricated counts — chip counts equal bucket counts from `model.worklist` | code path shown |

## 5. **[approval-gated]** LLM reason writer (Tier 0/1/2 design)

Only if the user approved the backend change. If approved:

| Check | Proof |
|---|---|
| Zod fact packet per rule (8 rules in `src/core/rules/`), `.strict()`, hashed into the receipt | file:line per rule |
| "Reason Writer" step inside `runForensicsInvestigation` (Agents SDK, structured Zod output `{ narrative, citedRecordIds }`, budget hooks) | file:line; trace output showing the step |
| Groundedness gate: every number/date/doc-id in narrative ∈ fact packet; `citedRecordIds ⊆ packet`; verdict-agreement; 1 named retry then fallback | unit test demonstrating a rejected hallucinated narrative |
| Tier 2 fallback template per rule; pipeline never blocks on LLM failure | test with LLM key removed → run completes, reasons tagged `deterministic_fallback` |
| Supabase receipt columns `reason_narrative`, `reason_source`, `reason_model`, `reason_fact_hash`, `reason_generated_at`; migration file exists | migration path; `reason` NOT on raw source tables |
| Worklist why-line, case-detail band, email draft, copilot answer all read the SAME stored narrative | e2e comparing the four surfaces for one line |
| Groundedness eval added to `evals/` release-readiness harness | eval output |

If NOT approved: verify Codex did **not** touch `src/core/rules/`, receipts, or Supabase schema — `git diff --stat` proof.

## 6a. Case list scroll/visibility fix

| Check | Proof |
|---|---|
| Case list owns its scroll (max-height + `overflow-y: auto`), sticky sort header, row-count affordance | Screenshot at 1440×900 showing rows 6–8 reachable inside the list |
| All 8 rows still in DOM | `rowCount: 8` via snapshot/eval |

## 6b. **[approval-gated]** Degraded "needs evidence" row for receipt-less lines

If approved: seed a line without evidence → run completes with a grey "Needs evidence — cannot verdict" row excluded from the 4 KPI buckets (test proof). If not approved: no changes to the fail-closed throw; seeding docs (`materialize:real-evidence` + S9 example) may still exist — check docs only.

## 7a. Copilot opens in place on Overview (UI layer)

| Check | Proof |
|---|---|
| Clicking the FAB on Overview does NOT navigate to a case; dock opens over Overview | Screen recording/screenshots of the click |
| Idle state shows suggested investigations built from real worklist rows (`buildCopilotSuggestions` wired — was a known gap) | file:line where the helper's output renders; suggestions match top real cases |
| A case picker (or suggestion click) selects the case before "Run query" — schema still requires `selectedLineId` | demo of ask flow |
| "Client-selected case context" dev caption removed | `rg -n "Client-selected case context" cockpit/` → no matches |

## 7b. **[approval-gated]** Workspace-scope query contract

If approved: `POST /forensics/query` accepts workspace scope (or optional `selectedLineId`) with server-side record expansion, citations still mandatory, same auth; unit + e2e proof. If not approved: `rg -n "selectedLineId" src/services/cockpitApi.ts` shows the schema unchanged.

## 8. Source tile "MCP" → "MCP Gateway"

| Check | Proof |
|---|---|
| Label changed at all 4 sites in `src/services/cockpitModel.ts` (~2729, 2762, 2787, 2820) | `rg -n '"MCP"' src/services/cockpitModel.ts` → no bare-label matches |
| Tests updated: `tests/unit/cockpit.test.ts`, `tests/unit/cockpit-api.test.ts` | test run green |
| Tile renders without truncation in the source strip AND governance/connectors page | 2 screenshots |

## Extra findings (A–D from the review)

- [ ] **A** — "Run date unavailable" chip hidden or reworded behind the freshness disclosure (screenshot)
- [ ] **B** — SAP OData probe fixed → pill green `7/7 connected` on healthy env (screenshot); red-state behaviour still covered by its own test
- [ ] **C** — covered by 7a (suggestions wired) — cross-check
- [ ] **D** — case badge id form consistent (`S1-L1` style) across breakpoints (1440px + 768px screenshots)

---

## Sign-off table (Codex fills in)

| Item | Verdict | Evidence (command output / file:line / screenshot path) |
|---|---|---|
| 0 Global gates | | |
| 1 Proof chips | | |
| 2 FAB | | |
| 3 KPI cards | | |
| 4 Pills + filters | | |
| 5 LLM reasons [gated] | | |
| 6a List scroll | | |
| 6b Degraded row [gated] | | |
| 7a Dock in place | | |
| 7b Workspace scope [gated] | | |
| 8 MCP Gateway | | |
| A–D extras | | |

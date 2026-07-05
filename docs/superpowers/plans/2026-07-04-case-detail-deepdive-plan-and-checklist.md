# Maya Case Detail — Deep Dive, Rework Plan & Codex Checklist (2026-07-04)

**How this was produced:** live browser walkthrough of the running app (cockpit `:3000`, API `:4318`, logged in as Maya, case S1-L1 opened, copilot query executed end-to-end), line-level anatomy extraction from `docs/Recoup_Maya_Journey (1).html` (`renderCase`, `stepEl`, `evCard`, `verdictHTML`, `outcomeHTML`), a code deep dive of the query/investigation/memory/RAG wiring, and external UX research.

**Blueprint + mockup (both binding, different roles):**
- `2026-07-04-case-detail-blueprint.html` — structure + data binding: blocks B1–B7, drawers, copilot idle/running/complete/voice, email dialog. Every `{curly.path}` is a real read-model binding — never replace one with a literal; exact prop names in code win over the blueprint's spelling.
- `2026-07-04-case-detail-mockup.html` — **what the finished page looks like**, populated with REAL S3-L1 values captured live 2026-07-04. Build THIS appearance, bound via the blueprint's paths. Hardcoding any string from the mockup fails F9.2.
- The blueprint's orange `{path}` chips, blue B# tags, and dashed conditional boxes are **annotations — they must never appear in the product UI** (guarded by F1.7).

Authority order: this plan (behaviour/acceptance) → blueprint (bindings) → mockup (appearance) → reference HTML (visual inspiration only).

**Phase → artifact map (each phase builds a specific block — check both files before starting it):**

| Phase | Blueprint block | Mockup region |
|---|---|---|
| 1 Single-page skeleton | PANEL 1 order B1→B7 + PANEL 2 (drawer open) | full page top-to-bottom |
| 2 Dossier head | B2 | stepper + dossier head card (contrast callout) |
| 3 Investigation timeline | B3 | "Agent investigation · 5 steps" card |
| 4 Evidence fact cards | B4 | "Evidence retrieved" two-card grid (RAG badge) |
| 5 Verdict + outcome | B5, B6 | red verdict block + routing banner/draft/gate |
| 6 Copy purge | rules D1–D9 (applies across all panels) | — (absence of prose is the target) |
| 7 Copilot rework | PANEL 3 idle / 4 running / 5 complete | "Copilot dock — complete state" |
| 8 Reason narrative | B5 basis line + copilot verdict band | basis text shared across both |
| 9 Voice query | PANEL 6 | mic button + Listening pill note |
| Email (G-P7) | PANEL 7 | "Email dialog" block |

**Decisions locked with the user (2026-07-04):**
1. Team naming stays **Billing / Recovery** (no "Collections" rename).
2. **Backend changes are approved** for this phase: LLM reason-writer on receipts AND workspace-scope copilot queries are in scope (no longer gated).
3. Case detail becomes a **single scrolling page** like the reference; Agent Trace / Audit depth moves behind disclosures — no capability may be deleted.
4. **RAG vector store**: verified LIVE in this environment (vector-store file citations observed, e.g. `file-2jUrCkC64XYwCxcJT1YctF` in S1-L1 suggestion record IDs). Keep it wired and surface it meaningfully.

---

## A. Reference anatomy — what the HTML case detail actually is

Seven blocks, one scroll, top to bottom (`renderCase`):

| # | Block | Reference treatment |
|---|---|---|
| A1 | **Case rail** (left) | Compact: id chip (verdict-toned), customer, verdict tag, amount. No prose. |
| A2 | **Decision Flow pipe** | Stepper mounted at top; `run` state streams, `done` state settles. |
| A3 | **Dossier head** | Id chip + title, customer, one-line description; right side "Deducted (SAP)" amount + "N posted lines"; a **lines strip** of invoice chips; optional **contrast callout**: "Same fine type as S4 — the agents reach the opposite verdict because the delivery evidence differs." |
| A4 | **Agent investigation** | Streamed step timeline (~5–7 steps). Each step: agent icon + name + source + timestamp, one "did" line, citation chips, one toned "found" line. Final step carries `VERDICT: …`. |
| A5 | **Evidence retrieved — read-model facts** | Cards of **key/value rows** (e.g. `Ordered qty | 1,200`, `POD signed | Yes`) with a source badge. Facts, not sentences. |
| A6 | **Verdict block** | Verdict badge + **plain-language lead** ("This deduction is **valid**. Route to **Billing** — the customer's claim is supported by the evidence."), then "Deterministic basis — why the agent decided this", then Cited chips. |
| A7 | **Outcome block** | Routing banner (`VALID → route to Billing` + route line + amount); "Recommended action — prepared by the Recovery Drafter, gated for you" as **action packages** (icon, title, one-liner, amount); inline **recovery draft letter** preview (non-valid verdicts); optional **prevention rule** panel ("Billing feedback loop — prevent recurrence"); **gate row**: `Mark evidence reviewed` toggle → enables `Approve & route to Billing/Recovery`, plus `Inspect basis` and a lock note "External send remains gated". |

Copilot in the reference: idle = suggested investigations; running = conductor + agent checklist streaming; complete = checklist + verdict panel. (Current app already implements this skeleton — verified live: Idle/Running/Complete chips, "Agents complete · 10 steps", "Forensics Investigator complete / Recovery Drafter complete".)

## B. Live findings — current app vs reference (browser test 2026-07-04)

**Working and real (keep):**
- Decision Flow stepper renders from real state — S1-L1 shows Scenario/Agents/Verdict/Action **done** with real captions ("Damaged product, evidence received", "4 evidence documents", "Valid deduction", "Route to Billing draft") and "Your approval" **current**. Driven by `deriveDecisionFlowSteps(detail, item, approvalResponse)` — no static data found. Post-approval transition covered by `test:e2e:maya-approval-lifecycle`.
- Email: "Draft email to Billing" renders next to "Open approval" and is **disabled pre-approval** (verified in DOM: `disabled: true`). Route `cockpit/app/api/email/route.ts` re-verifies approval server-side; Resend configured.
- Copilot: live OpenAI Agents SDK run observed (Running → Complete, 16 citations, 16 record IDs, 10 trace steps, Forensics Investigator → Recovery Drafter handoff).
- Worklist reasons are now sentence-quality ("Carrier damage evidence and photos support the deduction, so the agents routed the line to Billing.").

**Gaps vs reference (the work):**

| # | Gap | Severity |
|---|---|---|
| G1 | Page is 5 tabs + nested sub-tabs (Draft has Summary/Evidence/Message/Audit basis), not one scroll. The verdict story is fragmented. | High |
| G2 | **Wall-of-English problem confirmed.** One case screen carries ~14 prose/status fragments that state no fact: "Read-only draft status — Draft status is displayed for this opened line…", "Notes unavailable — No notes read/write contract is exposed…", "Displayed from the selected draft source. Calculation detail remains source-owned.", "This is a draft packet. The screen only prepares a human review posture…", three separate "Human approval required" notices, six "Timeline source details" buttons, "Source fields pending", "Recipient: Source detail pending". | High |
| G3 | Evidence rendered as counts + disclosure buttons ("18 artifacts", "Evidence source details"), not read-model **fact cards** (A5). The data exists (`evidencePack.documents` rows with qty/dates/hashes). | High |
| G4 | No verdict **lead sentence**; "Deterministic basis summary" exists but reads as a caption, not A6's verdict block. | Medium |
| G5 | No **recommended-action packages**, no inline draft letter preview, no routing banner (A7). Draft content is spread across the Draft tab's sub-tabs. | High |
| G6 | No **contrast callout** (A3) — the data supports it: S4 (OTIF fine valid → Billing) vs S5 (OTIF fine contradicted by 3PL timestamp → Recovery) is exactly the reference's pair. | Medium |
| G7 | No **agent investigation timeline** on the case page — the data exists in the Agent Trace tab (10 hook rows with agent names, phases, tools, sources) but is presented as a governance table, not a story. | High |
| G8 | **Bug/inconsistency found live:** S1-L1 header strip shows Evidence IDs / Receipt IDs / Content hashes / Provenance all "**Unavailable**" while the dossier card says "4 evidence documents and 16 record IDs are attached". Root-cause and fix (per-line vs per-case packet mismatch). | High |
| G9 | Amount confusion: header $8,200.00 (case) vs Draft packet $2,700.00 (line) with only "Calculation detail remains source-owned" as explanation. Label both explicitly ("Case total" / "This line"). | Medium |
| G10 | "Confidence: Threshold required" chip is unexplained jargon. | Low |
| G11 | `data proof` / `decision proof` chips still on every Maya screen (already item 1 of the Overview remediation — still open). | Medium |
| G12 | Copilot dock: "Client-selected case context" dev caption still present; suggestion cards dump raw record-ID lists ("Basis: prompt derived from selected decision deduction-decision:S1-L1 … Record IDs: S1-L1, SAP-90000002, …") into the primary view. | Medium |
| G13 | Copilot is case-bound; workspace-scope questions impossible (schema mandates `selectedLineId`). Backend change now **approved**. | High |
| G14 | Vector-store (RAG) citations are live but invisible as such — file ids appear inline with no "semantic retrieval" affordance; `cockpitModel` already carries provenance text ("returned by OpenAI vector store semantic retrieval; score …") that never surfaces meaningfully. | Medium |
| G15 | Reference's **prevention rule** panel (A7) has no equivalent. Must be advisory-only (no ERP writeback — invariant). | Low (optional) |

## C. Agentic capability inventory — REUSE, do not rebuild

Verified in code and/or live this session. Codex must wire the new UI to these; re-implementing any of them is scope creep.

| Capability | Where | Status |
|---|---|---|
| Overnight deterministic investigation (8 rules, receipts, verdicts) | `src/agents/forensics.ts` (`runForensicsInvestigation`) | Live |
| Live OpenAI Agents SDK query sessions (hooks: agent_start/tool/handoff/end; deterministic answer guard; raw-model-text suppressed) | `src/services/forensicsQuerySession.ts`, `src/agents/liveForensicsStream.ts` | Live (observed) |
| Agent memory — per-line recall + scope-memory + case-recall persistence + token-usage receipts to Supabase | `cockpitApi.ts:1585–1639` (`loadMayaForensicsQueryRecallContext`, `persistMayaForensicsQueryScopeMemory`, `persistMayaForensicsCaseRecallMemory`) | Live |
| RAG — OpenAI vector store semantic retrieval feeding evidence docs (`retrieval.docs`), provenance strings incl. score | `src/adapters/openAiVectorStore.ts`, `docRepo.ts`, `cockpitApi.ts:1247+`, `cockpitModel.ts:2557` | Live in this env (file-id citations observed) |
| MCP gateway governed tools (`query.answer`, `audit.read` on Maya allow-list; mcpTrace rows in answers) | `src/mcp/*`, trace observed live | Live |
| Prompt caching (`promptCacheKey`, cached-token counts in modelExecution) | `config/openaiPromptCache.ts`, query session | Live |
| Budget/retry governance per phase (`runBudget.recordTokenUsage/recordRetry`, step budgets, retry caps) | `cockpitApi.ts` query wiring | Live |
| **Realtime voice query (OpenAI Realtime API)** — client secret + tool routes + browser session | `cockpit/app/realtime-*`, `app/api/query/realtime-*` — used on `/run` page only | **Dormant for Maya** (candidate: voice copilot later; do not delete) |
| SSE live refresh | `app/api/forensics/events` | Live |
| Audit hashes / receipts / HITL approval gates | approval service + audit tabs | Live |
| Email send + sent-status readback (Resend, human-gated) | `cockpit/app/api/email/route.ts` | Live |

## D. "Too much English" — research-backed rewrite rules

Grounding: progressive-disclosure and dashboard-density guidance ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/), [UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/), [LogRocket](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/), [UX Pilot dashboard principles](https://uxpilot.ai/blogs/dashboard-design-principles)). Distilled into enforceable rules for this codebase:

1. **Outcome first:** the first readable element after the stepper must state verdict + route + amount in one sentence (A6 lead). Everything else supports it.
2. **Facts as key/value, never sentences:** if a value can be a labelled datum (`POD signed — Yes`), it must not be prose. Applies to evidence cards, case context, draft packet.
3. **One notice per concept per screen:** "human approval required" appears once (the gate row), not three times. Repeats are deleted, not reworded.
4. **No self-describing UI:** text that explains what the screen is doing ("This overview exposes status and evidence context only", "No notes read/write contract is exposed") is removed; if legally/governance-relevant, it moves into a single `Details` disclosure.
5. **Empty states are one line:** "Notes unavailable" — nothing more.
6. **Progressive disclosure for provenance:** record IDs, hashes, source contracts live behind one consistent disclosure pattern (`Source details`), never inline in the primary reading path — but always reachable (audit invariant).
7. **Labels over captions:** "Case total $8,200 · This line $2,700" replaces "Displayed from the selected draft source. Calculation detail remains source-owned."
8. Every sentence that survives must contain at least one case-specific fact. If it would be true for every case, it's chrome — cut it.
9. **Drawer triggers are labels, never sentences:** collapsible/drawer headers read `<label> · <real count/value>` ("Agent trace · 10 steps"), collapsed by default. A drawer hides depth, not deleted chrome — content inside drawers obeys rules 1–8 too.

## E. Execution plan for Codex (phased)

> Operating rules: one implementer per phase; tests first where behaviour changes; shadcn + `mayaAccent` teal only; no invented values; every removed caption's information must remain reachable via disclosure if it carries governance proof; keep all `data-testid` hooks or update tests in the same change. The realtime voice, MCP, memory, RAG capabilities in §C must remain functional (invariant tests must stay green).

**Phase 1 — Single-page dossier skeleton (G1, G11)**
Restructure `deduction-case-workspace.tsx` into the A2→A7 scroll: stepper (exists) → dossier head → agent investigation → evidence facts → verdict block → outcome block. Tabs die. **Drawer rule (explicit):** every former tab's deep content (Agent Trace, Audit, plus Evidence packet details, Line source details, Draft source details) becomes a `Collapsible` drawer in the scroll — **collapsed by default**, expanded state not persisted across cases. Drawer trigger = a minimal fact-bearing header only: `<label> · <real count/value>` (e.g. "Agent trace · 10 steps", "Audit · hash pending", "Evidence packet · 4 documents") — no explanatory sentence on the trigger, no prose inside the drawer that violates the D rules (D1–D8 apply inside drawers too; a drawer is where facts live, not where deleted sentences hide). Nothing the tabs showed may become unreachable. Remove the proof chips from the Maya header into the freshness disclosure (finishes Overview item 1).

**Phase 2 — Dossier head + lines strip + contrast callout (A3, G6, G9)**
Head: id chip, title, customer, one-line reason; right: "Deducted (SAP)" case amount + posted-lines count; invoice/line chips strip (line ids exist on the work item). Amount labels per rule D7. Contrast callout computed from real data only: another worklist item with the same rule family and a different verdict bucket (S4/S5 pair) — derive in `maya-workspace-derived.ts` (`findContrastCase(worklist, selected)`), render only when a real pair exists.

**Phase 3 — Agent investigation timeline (A4, G7)**
New `agent-investigation-timeline.tsx` fed from the EXISTING trace rows (agent name, phase, tool, retrievalSource, label) — the same data the Agent Trace tab shows, restyled as the reference's step list: icon, agent, source, "did" line, citation chips, toned "found" line, final step carries the verdict. No new backend. Streaming affordance: animate steps on first open (CSS only), settle instantly on revisit.

**Phase 4 — Evidence fact cards (A5, G3, G8, G14)**
Replace count-chips with fact cards from `evidencePack.documents` rows: title, source badge, key/value rows (doc id, type, qty/date fields present on the document), verification state. Vector-store-retrieved docs get a "Semantic retrieval · score 0.xx" badge from the existing provenance string (G14). **Fix G8 first** (failing test → fix): per-line packet strip must show the same availability as the dossier card; root-cause the "Unavailable" mismatch on S1-L1.

**Phase 5 — Verdict + outcome blocks (A6, A7, G4, G5)**
Verdict block: badge + lead sentence template over real verdict/route (three fixed lead forms as in the reference, values from the model) + deterministic-basis body (the receipt narrative — ties into the approved LLM reason-writer) + cited chips. Outcome block: routing banner, action packages derived from `recommendedActionLabel` + draft packet rows, inline draft letter preview (the drafted message already exists in the Draft tab's Message sub-tab), gate row = existing approval buttons + **"Mark evidence reviewed" toggle gating the approve button** (client-side pre-gate; the server HITL gate is unchanged) + `Draft email to Billing/Recovery` (exists) + lock note. Optional G15 prevention panel: advisory-only copy derived from rule type; no writeback.

**Phase 6 — Copy purge (D rules, G2, G10)**
Sweep the case page against rules D1–D8. Every deletion is listed in the PR description with where its information now lives. "Confidence: Threshold required" becomes a tooltip on the verdict badge or is dropped if it carries no per-case value.

**Phase 7 — Copilot answer rework + workspace scope (G12, G13; backend approved)**

The answer must render as a **verdict story** (reference pattern: question bubble → conductor narrative → agent checklist → verdict band → drawers), not a flat paragraph with chip metadata. Component spec — `query-evidence-dock.tsx` + `cited-answer-card.tsx`:

*7.1 Question bubble* — submitted question, right-aligned, accent surface. (Exists; keep.)

*7.2 Conductor block* — icon tile + "Conductor" label + ONE composed sentence:
`Investigating {workItemId} — {customer}. Running {N} specialist agents across {sourceList}, then returning a verdict.`
- `N` = real sub-agent roster length (`dock.subAgents` / `modelExecution.agentNames`) — never a hardcoded 5.
- `sourceList` = distinct source labels from the selected evidence packet (e.g. "SAP OData, Supabase, POD, Contract Repo"); max 4, then "+k more".
- Implement as `buildConductorSummary(input)` in `maya-workspace-derived.ts`, unit-tested; any missing field drops its clause — never invent.

*7.3 Agents checklist* — section label "Agents running" while Running → "Agents complete" on settle:
- Rows = REAL agents: unique `agentName` in first-appearance order from trace `agent_start` hooks; fallback before response = the `dock.subAgents` roster.
- Row = icon tile (map agent name → lucide icon, teal token set) + display name + right-side state: spinner while pending → check when that agent's `agent_end` hook exists (or response settled).
- Running state: roster renders with spinners while `POST /forensics/query` is in flight; on response, settle each row from real trace hooks. Client-side reveal only — no fabricated timestamps or fake progress claims.
- Stretch (backend approved, optional): stream real hook events over SSE (`liveForensicsStream` already emits them server-side; `/api/forensics/events` is the transport precedent) so checks flip on actual `agent_end`. If skipped, record as NOT_STARTED with rationale — do not fake it.

*7.4 Verdict band* — filled, verdict-toned panel (valid=success / invalid=danger / partial=warning):
- Line 1: `{VERDICT}` badge.
- Line 2: `Route: {queue} · {recommendedActionLabel} · {amount}` — all three from the selected work item.
- Line 3 (small): the stored reason narrative (Phase 8) or `deterministicBasis` — the SAME string the worklist and case page show.

*7.5 Drawers* (all `Collapsible`, collapsed by default, `label · count` triggers per rule D9):
- `Citations · {n} records` — cited record chips; vector-store docs carry "Semantic retrieval · score 0.xx" badge from real provenance.
- `Trace · {n} steps` — existing trace rows (today's Trace details content).
- `Model execution · {mode}` — prompt-cache / token-usage disclosure (existing content).
The old flat answer paragraph + "16 citations / 16 record IDs / Basis available in trace details" chip row is REPLACED by 7.2–7.5; every datum it showed must exist in the band or a drawer.

*7.6 Suggestion cards (idle state)* — question text + one `n records` chip only; the "Basis: prompt derived from… Record IDs: …" dump moves behind the Source details disclosure. Remove the "Client-selected case context" caption.

*7.7 Workspace scope (backend)* — `POST /forensics/query` accepts `scope:"workspace"` (or optional `selectedLineId`): server expands the record set to the settlement run, memory recall keys off the run, citations stay mandatory, same auth/budget/rate limits. The Overview Copilot launcher (current top command rail — the earlier FAB requirement is SUPERSEDED per the 2026-07-04 audit) opens the dock **in place** (no case navigation) with workspace suggestions ("Which cases should I start with?", "Total invalid exposure?") built from real worklist rows, plus a **case picker** (`Select` over the 8 real work items) so a case-scoped question can be asked from Overview without navigating. Case pages keep case scope. Zod schema + unit + integration + e2e in the same change.

**Phase 8 — LLM reason-writer integration point (approved earlier today)**
Implemented per `2026-07-04-maya-overview-feedback-remediation.md` §5 (fact packets, Agents SDK reason writer, groundedness gate, fallback tier, receipt columns). The case page consumes `reason_narrative` in the verdict block; worklist, email drafts, copilot basis read the same field. If that workstream lands separately, this phase is only the read-side binding.

**Phase 9 — Voice query in the copilot (mount the existing realtime capability)**

Everything needed already exists and is Maya-authorized — this phase mounts it in the dock; building any new voice pipeline is scope creep:
- `cockpit/app/realtime-browser-session.ts` — WebRTC session with the OpenAI Realtime API: captures mic (`getUserMedia({ audio: true })`), plays the model's spoken answer (`remoteAudio`), exposes snapshots (`status`, `message`, `answer`, `deterministicBasis`, `recordIds`), enforces **"blocked uncited output"** and **"no raw audio retained"** policies.
- `cockpit/app/api/query/realtime-client-secret/route.ts` — mints the session secret; `allowDemoSessionRoles: ["maya"]` **already permits Maya**.
- `cockpit/app/api/query/realtime-tool/route.ts` — governed tool bridge so the voice model answers via `query.answer` (same MCP-governed, citation-mandatory path as text).
- Reference UI to adapt: `RealtimeQueryControls` (`cockpit/app/realtime-query-controls.tsx`, currently mounted only on `/run`).

Spec:
1. Mic button in the dock next to "Run query" — `aria-label="Ask by voice"`, lucide `Mic`, teal token set. Visible in idle and complete states; hidden while a text query is in flight.
2. Press → start `startRealtimeBrowserSession` scoped to the SAME record set as the text path (case scope on case pages; workspace scope on Overview once 7.7 lands). Status chip reuses the existing dock chip: `Requesting` → `Connecting` → `Listening` (recording indicator: pulsing dot — a visible recording affordance is mandatory) → `Answered`.
3. The spoken question flows to the model over WebRTC; the model calls the governed realtime tool; the snapshot's `answer` + `recordIds` + `deterministicBasis` render into the SAME answer layout as text (7.2–7.5) tagged `mode: voice`. No separate voice-answer UI.
4. Uncited/blocked output renders the explicit blocked state (existing policy string), never silent failure. Mic permission denied → one-line notice + text path untouched.
5. Stop button ends the session; closing the dock closes the session (no orphaned WebRTC peer — verify in teardown test). Voice sessions respect the same budget hooks and are read-only: no approval, no email, no state mutation by voice.

**Phase 10 — Verification & evidence**
`lint`, `typecheck`, full `test`, `build`, `test:e2e:maya-real`, `test:e2e:maya-approval-lifecycle`, plus new e2e: single-page scroll renders all seven blocks with real data; approve flow flips stepper + enables email; copilot workspace question answers with citations; RAG badge appears when vector evidence present; voice session answers with ≥1 citation and tears down cleanly. Screenshots: case detail desktop/mobile, copilot idle/running/complete + listening, before/after word-count on the case page (target: ≥50% reduction in non-fact prose).

## F. Codex verification checklist (fill and return)

Verdicts: `DONE` / `PARTIAL` / `NOT_STARTED` / `BLOCKED` — **every row needs its named proof pasted or path-referenced**. A phase counts as complete only when every row in its block is DONE. **Return these tables completed as your final checklist**, plus `git log --oneline` for the branch and a clean `git status`.

**Measurement rules (apply to every row):**
1. Every criterion is verified by a **command with an exact expected value** — exit code 0, an exact count equality (`rendered == backend`), `rg` returning exactly 0 (or exactly N) matches, or a string equality. A criterion answered with prose instead of a measured value is FAILED.
2. Screenshots are taken at **1440×900 (desktop)** and **375×812 (mobile)**; each screenshot proof names its file path under `output/playwright/e2e/visual/`.
3. Where a threshold applies it is numeric and stated in the row (e.g. ≥50% word reduction, ≤12px alignment delta, ≤20s answer latency).
4. Counting method for copy metrics: word count of text nodes outside `code`/`pre`/drawer content on the case route, measured by a repeatable DOM eval script committed to `scripts/` — before/after values pasted in the row.
5. "Green suite" always means the named command + exit 0 + the pass-count line pasted (e.g. `127 files / 1081 tests`).

### F0 — Global gates

| # | Success criterion | Proof |
|---|---|---|
| F0.1 | `npm.cmd run lint` exit 0 | output |
| F0.2 | `npm.cmd run typecheck` exit 0 | output |
| F0.3 | Full `npm.cmd run test` green | output tail |
| F0.4 | `npm.cmd run build` passes | output tail |
| F0.5 | `test:e2e:maya-real` + `test:e2e:maya-approval-lifecycle` pass | output tails |
| F0.6 | All work committed; `git status --short` clean | git log + status |

### F1 — Single-page skeleton (Phase 1)

| # | Success criterion | Proof |
|---|---|---|
| F1.1 | Case page a11y tree contains NO `tablist`; the five old tabs are gone | browser a11y snapshot excerpt |
| F1.2 | DOM section order = blueprint blocks B1→B7 (stepper → dossier head → investigation → evidence → verdict → outcome → drawers), per `2026-07-04-case-detail-blueprint.html` PANEL 1 | e2e asserting `data-testid` order against the B1–B7 list |
| F1.3 | Five drawers (Agent trace, Audit, Evidence packet, Line source, Draft source) present and `data-state="closed"` on case open | e2e assertion |
| F1.4 | Every drawer trigger matches `^<label> · <value>$` (no sentences, no periods) | e2e regex over trigger text |
| F1.5 | Field-loss audit: every field the 5 tabs rendered is mapped old-testid → new location | mapping table in PR body + invariant tests green |
| F1.6 | Proof chips absent from Maya header; hashes reachable in freshness/details disclosure | rg output + screenshot |
| F1.7 | Zero blueprint annotation artifacts in product UI: no `{curly.path}` literals, no B# tags, no dashed "RENDER ONLY IF" boxes rendered | `rg "\{item\.|\{doc\.|\{trace\[|RENDER ONLY IF" cockpit/` → 0 matches in rendered strings + visual pass vs the mockup |

### F2 — Dossier head (Phase 2)

| # | Success criterion | Proof |
|---|---|---|
| F2.1 | "Case total" and "This line" labels render with the two real amounts (S1: $8,200 / $2,700) | screenshot + e2e text assert |
| F2.2 | Lines strip chip count equals the item's real line ids from `/api/forensics` | e2e comparison |
| F2.3 | `findContrastCase` unit tests: S4/S5 pair found; no-pair returns undefined; unknown verdict fails closed | test file + run output |
| F2.4 | Callout renders both case ids + rule family, hides when no pair exists | e2e both states + screenshot |

### F3 — Investigation timeline (Phase 3)

| # | Success criterion | Proof |
|---|---|---|
| F3.1 | Steps sourced from existing trace rows — zero literal step arrays in the component | file:line + rg for hardcoded steps |
| F3.2 | Rendered step count equals backend trace row count for the case | e2e comparison |
| F3.3 | Each step shows real agent name, source, label; citation chips ⊆ case record ids | e2e spot-check |
| F3.4 | Final step carries verdict chip equal to `item.verdict` | e2e |
| F3.5 | No fabricated timestamps — time shown only if backend provides it | rg audit in PR |

### F4 — Evidence fact cards (Phase 4)

| # | Success criterion | Proof |
|---|---|---|
| F4.1 | Card count equals `evidencePack.documents` length | e2e |
| F4.2 | Card bodies are key/value rows only — no sentence prose inside cards | DOM audit + screenshot |
| F4.3 | "Semantic retrieval · score" badge appears ONLY on vector-provenance docs, score parsed from real provenance string | unit test on parser + e2e |
| F4.4 | **G8 regression**: failing test reproducing S1-L1 "Unavailable" strip vs "4 documents/16 record IDs" mismatch, then fix, then green | red→green test output + root-cause note |

### F5 — Verdict + outcome blocks (Phase 5)

| # | Success criterion | Proof |
|---|---|---|
| F5.1 | Lead sentence: 3 bucket variants, values from model; unknown bucket fails closed to explicit unavailable | unit tests (4 cases) |
| F5.2 | Basis body string === worklist reason string for the same line | e2e equality |
| F5.3 | Cited chips ⊆ evidence-pack record ids | unit |
| F5.4 | Routing banner text `{VERDICT} → route to {queue}` + real amount | e2e |
| F5.5 | Action package rows derived from real draft/action fields; amounts real | e2e + file:line |
| F5.6 | Inline draft preview content === existing draft Message content | e2e equality |
| F5.7 | "Mark evidence reviewed" toggle: approve disabled before, enabled after; server HITL gate unchanged; email disabled pre-approval, enabled + functional post-approval | e2e pre/post + approval-lifecycle suite |
| F5.8 | Prevention panel (if built): advisory copy only — component makes no fetch/POST | rg in component; else NOT_STARTED |

### F6 — Copy purge (Phase 6)

| # | Success criterion | Proof |
|---|---|---|
| F6.1 | Non-fact prose word count on case page reduced ≥50% | before/after counts + method |
| F6.2 | "human approval required" appears exactly once in case-page DOM | e2e count |
| F6.3 | Each of the 14 G2 fragments absent from primary view | rg per fragment |
| F6.4 | PR table maps every removed string → deleted or disclosure location | PR body |
| F6.5 | Governance/audit pages untouched | `git diff --stat` |

### F7 — Copilot rework (Phase 7 spec 7.1–7.7)

| # | Success criterion | Proof |
|---|---|---|
| F7.1 | Conductor sentence composed by `buildConductorSummary` with real N + real source list; clause-drop on missing fields | unit tests + e2e text |
| F7.2 | Agents checklist rows = real roster (trace `agent_start` order; roster fallback pre-response); no hardcoded count | file:line + e2e |
| F7.3 | Running: spinners while request in flight; Complete: checks settle from real `agent_end` hooks; label flips "Agents running"→"Agents complete" | screenshots of both states + e2e |
| F7.4 | Verdict band: bucket-toned; `Route: {queue} · {action} · {amount}` all real; basis line === stored narrative | e2e |
| F7.5 | Citations / Trace / Model-execution drawers collapsed by default with `label · count` triggers | e2e |
| F7.6 | Old flat answer + chip row removed; datum-loss audit shows every old value now in band or drawer | mapping note + invariant tests |
| F7.7 | `rg "Client-selected case context" cockpit/` → 0 matches; suggestion cards show question + `n records` chip only, id dump in disclosure | rg + screenshot |
| F7.8 | Workspace scope: schema accepts it (unit), server expands run-level records + run-keyed memory (integration), citations mandatory (test), Overview FAB opens dock in place with run-level suggestions (e2e), case pages stay case-scoped (e2e) | 5 distinct proofs |
| F7.9 | SSE live hook streaming (stretch): checks flip on real events — or NOT_STARTED with rationale | recording or rationale |

### F8 — Reason narrative read-side (Phase 8)

| # | Success criterion | Proof |
|---|---|---|
| F8.1 | Verdict block reads `reason_narrative` when present, falls back to `deterministicBasis`, tags source | unit |
| F8.2 | Worklist row, verdict block, email draft body, copilot basis show the SAME string for one line | e2e comparing 4 surfaces |

### F10 — Voice query (Phase 9)

| # | Success criterion | Proof |
|---|---|---|
| F10.1 | Mic button in dock: `aria-label="Ask by voice"`, present in idle + complete states, absent while a text query is in flight | e2e (3 state assertions) |
| F10.2 | Voice path reuses `startRealtimeBrowserSession` — 0 new WebRTC/audio transport code (`git diff` adds no new peer-connection setup outside the existing module) | `git diff --stat` + file:line of the single import |
| F10.3 | Session record scope === the text path's record set for the same context (case or workspace) | unit comparing the two request payloads |
| F10.4 | Spoken question → answer rendered in the 7.2–7.5 layout with ≥1 citation, ≤20s from question end (fake-media e2e via Playwright `--use-fake-device-for-media-stream`, or a mocked session unit if flaky) | test output + screenshot of `Listening` state with recording indicator |
| F10.5 | Blocked/uncited output renders the explicit blocked state string; mic-permission-denied renders a one-line notice and text input still works | 2 e2e assertions |
| F10.6 | Dock close ⇒ session closed: 0 live `RTCPeerConnection` after close (teardown assertion) | test output |
| F10.7 | Voice is read-only: no approval/email/mutation call sites reachable from the voice path | rg over the voice component for fetch targets |

### F9 — Cross-cutting invariants

| # | Success criterion | Proof |
|---|---|---|
| F9.1 | §C inventory intact: memory persistence, MCP trace, prompt cache, budget hooks, SSE, realtime routes all untouched and tested | full suite + `git diff --stat` scoped |
| F9.2 | No invented values in any new UI; missing data → explicit unavailable state | spot-check list in PR |
| F9.3 | shadcn + `mayaAccent` teal only; no purple/indigo drift | screenshot review |
| F9.4 | Evidence screenshots delivered: case page (collapsed + expanded drawers, desktop + mobile), copilot idle/running/complete, pre/post approval | file paths |

---

## G. Consolidated pending items from the 2026-07-04 Overview audit (Codex: execute with this plan)

Carried over from `2026-07-04-overview-remediation-verification-status.md` (worktree `maya-reference-workspace-prod-baseline`). These are IN SCOPE for this execution round unless marked otherwise. Superseded items (bottom-right FAB, internal 5-row scroll) are closed — do not resurrect them.

| # | Item (audit verdict) | Action + measurable success criterion | Proof |
|---|---|---|---|
| G-P1 | Commit/clean branch (PARTIAL) | Before Phase 1 work starts: commit the current worktree in logical units (one concern per commit, `<type>: <description>` format). Criterion: `git status --short` = 0 lines; every commit message maps to a checklist item or the audit's feedback pass. | `git log --oneline` + empty status |
| G-P2 | LLM reason writer (NOT_STARTED — **approved 2026-07-04, no longer gated**) | Execute per Overview remediation §5 + Phase 8 here. Criteria: 8/8 rules emit `.strict()` fact packets; receipt columns `reason_narrative/reason_source/reason_model/reason_fact_hash/reason_generated_at` exist via migration; groundedness eval = **0 violations** across all seeded lines; LLM-key-removed run completes with 8/8 reasons tagged `deterministic_fallback`. | migration file + eval output + fallback e2e |
| G-P3 | Degraded "needs evidence" row (NOT_STARTED, still approval-gated) | **Do NOT implement without an explicit one-line user approval.** If approved: a seeded line without evidence renders one grey "Needs evidence — cannot verdict" row, excluded from all 4 KPI buckets (bucket sums unchanged), run completes. If not approved: `git diff` shows 0 changes to the fail-closed throw. | seeded-line e2e OR diff proof |
| G-P4 | Case picker in Overview dock (PARTIAL) | Covered by Phase 7.7. Criterion: from Overview, select any of the 8 real work items in the dock and run a case-scoped query without navigation; picker options == worklist ids (8/8). | e2e |
| G-P5 | Workspace-scope contract (PARTIAL) | Covered by Phase 7.7 / F7.8 — the audit's "no backend change made" is now resolved by the approval; implement it, don't re-defer it. | F7.8's 5 proofs |
| G-P6 | SAP OData probe failed (BLOCKED) | Environment/credential task, NOT UI: fix the probe target/credentials so `/connectors` returns `statusTone:"ready"` for `sap-odata`. Criteria: real-backend e2e source-readiness output shows 7/7 ready and the pill renders green; the controlled red-state test still passes separately. Never fake green. | e2e output line + screenshot |
| G-P7 | **NEW — email delivery-status readback is dormant** (found in code review: UI shows only the send response's provider id; the route's GET readback is never called) | After a successful send, render a "Check delivery status" action calling `GET /api/email?providerEmailId=…&lineId=…&actionId=…&recipientGroup=…`; display id, last event, created timestamp — safe metadata only. Criteria: status renders within 1 click post-send; `rg` shows 0 client-side occurrences of the Resend key; env-absent → inline error not a crash. | e2e (env-gated) + rg |
| G-P8 | **NEW — memory recall is invisible** (recall context loads server-side per line; the dock never shows it) | Expose a safe summary in the query response (counts + scopes only, no memory bodies) and render an idle-state chip `Case memory · N records` when N>0, absent when N=0. Criterion: chip count equals backend recall record count; 0 memory bodies in the client payload. | unit on response shape + e2e both states |

**Sources (research):** [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [UXPin — Progressive Disclosure](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/) · [LogRocket — Progressive disclosure types & use cases](https://blog.logrocket.com/ux-design/progressive-disclosure-ux-types-use-cases/) · [UX Pilot — Dashboard design principles](https://uxpilot.ai/blogs/dashboard-design-principles)

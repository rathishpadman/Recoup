# Recoup VS Code Handoff Status

Date: 2026-06-22
Workspace: `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup`
Branch: `codex/guardrail-riskmesh-hardening`
Remote: `https://github.com/rathishpadman/Recoup.git`
Remote branch: `origin/codex/guardrail-riskmesh-hardening`
PR URL: not opened for this local session branch

## Current Git Status

- Active work is on local session branch `codex/guardrail-riskmesh-hardening`.
- The Windows EOL verification fix was preserved in commit `7fccd47 Preserve Windows verification newline fixes`.
- The current session has seven pushed commits after the user-requested git-prioritization checkpoint: `e42530b Harden runtime guardrail gates`, `24ba638 Harden cockpit auth proxy boundaries`, `1e0d18a Rework cockpit persona surfaces`, `457737a Document cockpit visual handoff evidence`, `842a0f5 Update handoff with commit checkpoint`, `8953871 Record pushed branch in handoff`, and `51bdaf1 Record browser skill setup in handoff`.
- Fresh pre-commit verification passed before those commits: `npm.cmd run test:e2e` passed after the Next app-route env-loader fix, and `npm.cmd run verify` passed with ESLint green, TypeScript green, Vitest `67` files / `401` tests green, and Dependency Cruiser green (`97` modules / `249` dependencies).
- Safe upstream push completed with no rebase and no force-push. The first push attempt hit a transient `curl 55` connection reset and did not create the remote branch; a checked retry succeeded and set upstream tracking for `origin/codex/guardrail-riskmesh-hardening`.
- Prior pushed-branch notes are historical and no longer describe the active local branch.

## Restart-Ready Handoff - Read First

This file is the restart anchor for the next Codex session after a machine reboot. Do **not** restart broad discovery from scratch.

Current live checkpoint after user-approved continuation:

- Human UI verification is now an explicit required gate before marking any UI/UX surface passed. The cockpit is running for reviewer inspection at `http://localhost:3000`; the API is running at `http://127.0.0.1:4317`.
- Browser skill status: the bundled browser plugin skill was copied into the user skill directory at `C:\Users\rathi\.codex\skills\control-in-app-browser\SKILL.md`, with a local note pointing at `C:\Users\rathi\.codex\plugins\cache\openai-bundled\browser\26.611.62324\scripts\browser-client.mjs`.
- 2026-06-22 10:05 +05:30 restart check: the user skill file and bundled `browser-client.mjs` both exist, and `[plugins."browser@openai-bundled"] enabled = true` is present in `C:\Users\rathi\.codex\config.toml`. The browser runtime was still not exposed because `[features] js_repl` was set to `false`; that local Codex feature flag has now been changed to `true`. This current session cannot dynamically gain the missing tool, so restart Codex once more before expecting the Browser skill to control the in-app browser. Until that restart/tool exposure, Playwright remains the fallback verification path.
- Fresh David `/credit` desktop visual reviewer `Godel` scored the post-Risk-Mesh-overlap screenshot `3/5 FAIL`. The old Risk Mesh collision is resolved, but the middle Partial hold workbench / Proactive terms action packet still read too generated, with cramped score copy, text-heavy action rows, and raw IDs too prominent.
- A narrow RED/GREEN fix landed locally for David `/credit`: `tests/invariants/cockpit-no-business-logic.test.ts` now protects unclipped score-basis copy, compact `credit-action-decision-row` structure, and low-emphasis `credit-provenance-strip` record IDs. The RED failure was observed, then focused verification passed: `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts` (`23/23`), `npm.cmd run typecheck`, and `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts tests\unit\cockpit.test.ts` (`39/39`).
- The first full `npm.cmd run test:e2e` retry after this fix failed after ~174s at `input[name="loginId"]` because Next served a 500 dev error for `./config/env.ts` importing `./governed.js` through `cockpit/app/api/approval/route.ts`. Root cause: Next/Turbopack could not resolve the NodeNext `.js` source import in the app-route graph after approval-route compilation. Fix: app API routes now import `loadLocalRuntimeEnvFiles` from new `config/localRuntimeEnv.ts`, while `config/env.ts` re-exports that loader for Node runtime callers. RED coverage was added in `tests/invariants/cockpit-route-architecture.test.ts`; route/runtime verification passed: `npm.cmd run test -- tests\invariants\cockpit-route-architecture.test.ts tests\invariants\runtime-config.test.ts tests\unit\realtime-next-routes.test.ts` (`32/32`) and `npm.cmd run typecheck`.
- The stale Next dev server had to be restarted after the module-boundary fix. After restart, `/login` returned HTTP `200` with `input[name="loginId"]`, and a fresh full `npm.cmd run test:e2e` passed, refreshing `output/playwright/e2e/*`. The pass took ~296s because the script captures the full responsive matrix with repeated fresh login contexts; logs show repeated `/login` and `/run` renders around 3s each.
- A selector-specificity issue then appeared in the quick David screenshot: the older `.credit-action-table > div` grid rule overrode the new compact decision-row grid. A RED regression tightened the CSS selector requirement, and the fix now uses `.credit-arbitration-workstation .credit-action-table > .credit-action-decision-row`. `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts` passed (`23/23`), and the refreshed `output/playwright/e2e/david-credit-1440.png` shows compact horizontal action rows.
- Do not mark David `/credit` visually closed yet. It still needs human inspection on the live server, refreshed e2e screenshot evidence, and a fresh reviewer or explicit human acceptance at `>=4/5`.
- Maya `/forensics` remains closed for the active desktop gate (`4.0/5 PASS`); Maya `/run` remains open (`3.7/5 FAIL`); CFO `/cfo` remains closed for the active desktop gate (`4.1/5 PASS`). Overall cockpit is not final-complete.

Fresh verification after the latest David `/credit` Risk Mesh CSS/test change:

- `npm.cmd run test:e2e` passed on port `3044` and refreshed `output/playwright/e2e/*`.
- `npm.cmd run verify` passed after that change: ESLint green, TypeScript green, Vitest `67` files / `399` tests green, Dependency Cruiser green (`96` modules / `247` dependencies).
- The latest `david-credit-1440.png` was visually inspected after e2e refresh. The Risk Mesh overlap fix is present, but David `/credit` is **not reviewer-closed** yet; it needs a fresh desktop-only visual reviewer score before moving from open P0 to closed.

Latest runtime screenshots to inspect first:

- `output/playwright/e2e/maya-forensics-1440.png`
- `output/playwright/e2e/maya-run-1440.png`
- `output/playwright/e2e/david-credit-1440.png`
- `output/playwright/e2e/david-command-1440.png`
- `output/playwright/e2e/cfo-1440.png`
- `output/playwright/e2e/login-1440.png`
- `output/playwright/e2e/governance-agents-1440.png`
- `output/playwright/e2e/governance-connectors-1440.png`
- `output/playwright/e2e/governance-memory-1440.png`
- `output/playwright/e2e/governance-trace-1440.png`

Fresh-session startup protocol:

1. Read only this top handoff block, `AGENTS.md`, `INVARIANTS.md`, `docs/superpowers/plans/2026-06-21-cockpit-imagegen-comparison.md`, and `docs/superpowers/plans/2026-06-21-full-solution-sdd-review-checklist.md` before acting. Do not load the full SDD unless a specific pending item names a section.
2. Use subagents intentionally: one writer per disjoint write scope, read-only planners/reviewers in parallel, then a separate visual/spec/code reviewer. Do not let a subagent run silently: default wait `60s`, extend to `120s` only with useful activity, then interrupt for a `30s` checkpoint and close/restart/take over.
3. Do not read or print `.env.local`. Auth details are in Supabase tables and runtime env loaders; use the existing API/session paths rather than exposing secrets.
4. Mobile is deferred. Desktop `1440x900` is the current critical visual gate.
5. Never mark a visual route complete below `4/5`. Historical passes are superseded by the latest desktop-only reviewer when scores conflict.
6. Preserve backend/read-model wiring. React routes may format data but must not invent dollars, scores, statuses, record IDs, or decision facts.

Priority order for the next session:

| Priority | Item | Current state | Next action |
|---|---|---|---|
| P0 | David `/credit` desktop visual | `Beauvoir the 2nd` scored pre-fix screenshot `3.2/5 FAIL`; `Lagrange the 2nd` added RED invariant and CSS fix; e2e and full verify are green after the fix. | Spawn a fresh desktop-only visual reviewer on `output/playwright/e2e/david-credit-1440.png`. If score is still `<4`, continue only the Risk Mesh/hierarchy slice. |
| P1 | Maya `/run` desktop visual | `3.7/5 FAIL`; raw `ToolStatusRail` / `MultimodalDock`, snake-case feed labels, cramped rail copy. | Use `Leibniz the 2nd` plan: update `ToolStatusRail`, `/run` sidecar label, `MultimodalDock` label, `run-stream.tsx` label fallback, and route-scoped CSS. |
| P1 | Login/governance desktop visual | Login `3.3/5 FAIL`; governance `3.1-3.4/5 FAIL`. | Use `Hooke the 2nd` plan: remove raw `ToolStatusRail`, demote schema/table substrate, soften memory keys/chips, shorten hash-heavy trace rows while preserving evidence access. |
| P1 | Full-solution SDD line-by-line review | Still pending and broader than persona UI. | Continue from the checklist; do not scope it only to Maya/David/CFO persona pages. |
| P1/P2 | Business capability gaps | R-score/R-drift, full Behavioral Containment, production arbitration calibration, run/eval budgets/labels, post-approval audit display. | Keep claims visibly blocked/deferred or implement with cited deterministic basis and HITL; do not invent Appendix G constants. |

## Active 2026-06-21 Cockpit UI Revamp Status

Current active goal addition: close the desktop-first Recoup v1.2 cockpit as a premium SaaS multi-agent product, using the ImageGen cue boards as the visual target rather than the rough screenbook. Mobile is explicitly deferred for this pass.

Scope correction captured during the active session:

- ImageGen visual comparison is **all-persona**, not Maya-only: Maya, David credit, David D5, and CFO runtime screenshots must each be compared against their matching ImageGen cue before the cockpit visual pass is done.
- Backend/read-model wiring is **all-view**, not Maya-only: every created cockpit view/component should render operational/business facts from API/read-model fields unless the element is explicitly demo chrome and labelled as such.
- SDD review is **full-solution**, not persona-only: the checklist must cover capabilities A/B/C/D, invariants, agents/tools/services, audit/HITL, MCP, memory, eval/verify, cockpit, OpenAI usage, and demo readiness. Persona v1.2 is one subsection of that broader review.

Important new standing instruction:

- `AGENTS.md` now includes section `5.1 Cockpit UI anti-slop standard`.
- That section captures the user's Catalog of Tells as a permanent cockpit review gate: avoid generic AI-dashboard typography, colors, card-everything layouts, nested cards, raw backend enum labels, decorative motion, fake stats, and uniform generated spacing.
- Future subagents working on Maya, David credit, David D5, or CFO should be given that AGENTS section plus the relevant ImageGen cue.

User-critical feedback to preserve:

- The UI must not look like an LLM-generated dashboard.
- The sidebars must feel like real product rails: broad IA, icon-led navigation, compact identity/org footer, and no nested sidebar cards/chips/pills that look generated.
- The ImageGen cues are not merely inspiration; runtime screens must converge on their topology and density.
- Do not use ImageGen raster output as SVG icons. Use a disciplined vector icon system from the existing icon library for crisp, accessible product navigation.
- Do not create static React-only mock UI. Persona screens should render from API/read-model fields; UI may format labels, but no dollars/scores/status facts should be invented in React.

Current cue sources:

- `mockups/imagegen/maya-forensics-journey.png`
- `mockups/imagegen/david-credit-arbitration.png`
- `mockups/imagegen/david-command-center-dark.png`
- `mockups/imagegen/cfo-executive-readout.png`

Tracked review artifacts added during this pass:

- `docs/superpowers/plans/2026-06-21-cockpit-imagegen-comparison.md`: all-persona ImageGen comparison with current visual scores and P0/P1 visual backlog.
- `docs/superpowers/plans/2026-06-21-full-solution-sdd-review-checklist.md`: full-solution SDD/backend checklist with P0/P1/P2 items across HITL, audit, Realtime, Risk Mesh, containment, CFO close, and verification.

Active workflow gate status:

- The desktop cockpit visual program is **not final-complete**. Latest desktop-only reviewer `Beauvoir the 2nd` scored Maya `/forensics` `4.0/5 PASS`, David D5 `/credit/command` `4.4/5 PASS`, and CFO `/cfo` `4.1/5 PASS`; reopened Maya `/run` `3.7/5 FAIL`, `/login` `3.3/5 FAIL`, and governance routes `3.1-3.4/5 FAIL`; and reopened David `/credit` at `3.2/5 FAIL` before `Lagrange the 2nd` landed the Risk Mesh overlap fix. David now needs fresh desktop re-review against `output/playwright/e2e/david-credit-1440.png`. Current durable rule: a score below `4/5` is a failed visual gate, never a completed visual-audit gate; `1/5`, `2/5`, and `3/5` must stay fail/pending. Mobile is deferred for this pass.
- Subagent-driven workflow is now the required execution mode for remaining P0/P1 slices: implementer subagent -> spec-compliance reviewer -> code-quality reviewer -> focused tests -> visual audit -> handoff update. Stale or slow subagents must be terminated or replaced rather than waited on indefinitely. Default wait is `60s`; extend to `120s` only when an agent is visibly active, has produced useful partials, or is running tests; then interrupt for a `30s` checkpoint before close/restart/takeover.
- Workflow verifier subagent `Sagan` reviewed coverage and returned **partial/not complete**. Follow-up SDD/backend reviewer `Fermat` confirmed the highest-risk remaining gaps were Realtime demo-session auth, process-local approval finality, role-principal mapping, static audit chips, and missing Crestline containment handoff. Realtime query proxy auth is now patched for Maya-only demo sessions. Durable approval finality is now closed for the configured cockpit API durable-memory path after spec reviewer `Wegener` and code-quality reviewer `Laplace` passed the slice. Role-principal mapping is now closed for the bounded demo-proxy scope: direct API auth remains exact principal+token, demo proxy identities are role-derived with request-bound HMAC proof, approval allows Maya/David only, Realtime remains Maya-only, CFO approval is rejected, and final reviewer `James` found no Critical/Important/Minor issues. Run-control/eval release readiness now has an explicit failing aggregate gate: blocked run control, blocked eval labels, or failing metrics produce release `fail` instead of being treated as acceptable. Real audit-hash surfacing is now closed for `/credit` and `/cfo`; Governance Trace fidelity is now closed for deterministic Risk Mesh audit entries; CFO proof/status display labels are now model-owned; David `/credit` toolbar, Account-360 detail/summary rows, Sentinel detail, approval record-strip, action queue summary, partial-hold, and terms-packet labels are now model-owned. Crestline/M6 is now **partial thin-real** through a cited risk-review readout, not missing; full Behavioral Containment action closure, R-score/R-drift execution, production arbitration calibration, configured run budgets/eval labels, and post-approval audit display remain open.
- David HITL implementation was handled by implementer subagent `Huygens`. Spec reviewer `Dalton` passed the initial service/UI wiring, code reviewer `Mendel` found a real browser-session auth gap, and fix worker `Anscombe` added session-cookie approval auth plus guard fixes. Reviewer `Avicenna` then caught a shared-auth side effect; the final David approval patch kept demo-session approval auth scoped to `/api/approval`. A later bounded patch allows Maya-only demo sessions for the two Realtime query proxies and explicitly rejects David/CFO.
- David visual convergence used the subagent workflow. Visual worker `Rawls` was shut down after a non-useful wait window. Reviewer `Parfit` scored the first refreshed screenshot `3/5 FAIL`; reviewer `Hegel` scored a local David-only pass; stricter all-persona reviewer `Descartes` later reopened David at `2/5 FAIL`; reviewer `Halley` scored the first topology remediation `3/5 FAIL`; reviewer `Bohr` scored the refreshed `/credit` screenshot `4/5 PASS`; all-persona auditor `Bernoulli` reopened David `/credit` at `3/5 FAIL`; worker `Carver` then remediated David and reviewer `Meitner` scored it `4/5 PASS`.
- Current live subagent workflow: route/persona inventory explorer `Confucius` completed and confirmed Maya/David/CFO were API/read-model backed while D5 was missing at that time; UI auditor `Descartes` completed and reopened David plus all remaining visual gates; focused Maya reviewer `Aristotle` scored the remediated Maya `/forensics` screenshot `4/5 PASS`; backend worker `McClintock` verified David hold/terms approvals already pass through governed REST/service wiring; D5 worker `Arendt` added `/credit/command` and fixed its typecheck issue; docs worker `Kepler` added the anti-slop workflow rules; visual reviewers `Halley`, `Gibbs`, and `Beauvoir` scored earlier surfaces `3/5 FAIL`; reviewer `Bohr` scored David `/credit` `4/5 PASS`; reviewer `Chandrasekhar` scored D5 `/credit/command` `4/5 PASS`; CFO reviewer `Averroes` scored the first board-pack pass `3/5 FAIL`; CFO reviewer `Peirce` scored the remediated `/cfo` screenshot `4/5 PASS`; run-copy worker `Feynman` was closed after a one-second stale wait while its useful file changes had already landed; reviewer `Curie` scored the refreshed `/run` screenshot `4/5 PASS`; all-persona auditor `Bernoulli` reopened David `/credit` and D5 `/credit/command` at `3/5 FAIL` and identified login plus governance routes as `2/5 FAIL` / not screenshot-gated; David reviewer `Meitner` then scored `/credit` `4/5 PASS`; D5 reviewer `Raman` scored the fixed-grid `/credit/command` screenshot `4/5 PASS`; login/governance worker `Goodall` was interrupted and closed after a bounded wait, returning partial markup only; main integration completed the shared CSS/data wiring; visual reviewer `Copernicus` scored login, agents, connectors, and trace `4/5 PASS`, initially held memory at `3/5 FAIL`, then scored the curated memory rewrite `4/5 PASS`; code reviewer `Planck` found two Important issues (hidden memory citations and malformed ARIA table roles), both were fixed and `Planck` re-reviewed Ready/Yes.
- Backend/read-model reviewer `Ramanujan` rechecked all persona views: `/forensics` and `/run` pass data wiring; `/credit`, `/credit/command`, and `/cfo` were partial because some display facts, thresholds, generated IDs, command-centre rows, or assurance/basis labels still lived in route code/read-model demo shape. Since then, D5 command-centre rows are model-owned, CFO assurance/proof/status labels are model-owned, and `/credit` readout toolbar, Account-360 detail/summary rows, Sentinel detail rows/record-strip label, approval record-strip labels, action queue summary, partial-hold score/split/criteria labels, and terms-packet labels are model-owned. Current `/credit` residual route text is route chrome/table headers/buttons/aria, not business facts. Do not claim the overall goal complete until the remaining SDD gaps and final verify close.
- Latest explicit subagent workflow after the user's repeated workflow concern: explorer `Kepler the 2nd` found the exact real-hash plumbing gap, backend reviewer `Carson the 2nd` audited all-view read-model wiring and flagged remaining static/provenance gaps, visual reviewer `Halley the 2nd` confirmed no documented sub-`4/5` completion but reopened P1 premium caveats, implementer `Epicurus the 2nd` completed the real audit-hash slice with red-test evidence, spec reviewer `Sagan the 2nd` passed it, and code-quality reviewer `Hypatia the 2nd` returned Ready/Yes with no Critical or Important issues. All those agents were closed after use.
- Latest 2026-06-22 parallel workflow: implementation worker `Cicero the 2nd` fixed the sidebar active-route bug and Maya logout suppression in `cockpit/app/cockpit-shell.tsx` with an invariant assertion; focused verification passed (`npm.cmd run typecheck`, `tests/invariants/cockpit-no-business-logic.test.ts` `21/21`). Read-only SDD/status reviewer `Mencius the 2nd` corrected the stale checklist at that checkpoint before the final rerun: Crestline/M6 was partial thin-real, Capability D was not complete, production R-score/R-drift and run/eval gates remained open, and full SDD line-by-line review was still pending. Visual auditor `Linnaeus the 2nd` scored Maya `/forensics` `3.5/5 FAIL` and identified sidebar/footer clipping, sidecar clipping, squeezed worklist queue, and card-everything density as blockers. A focused controller pass then fixed sidebar density/footer visibility, model-owned compact queue labels, worklist grid width, sidecar compactness, and screenshot capture reliability. Fresh reviewer `Faraday the 2nd` scored the recaptured Maya `/forensics` desktop screenshot `4/5 PASS`; residual polish is productizing raw component labels like `ToolStatusRail` / `MultimodalDoc`. After D5/test lint fixes, fresh broad e2e and `npm.cmd run verify` both passed.
- Latest explicit parallel reviewer wave after the user's subagent concern: SDD reviewer `Copernicus the 2nd` confirmed the remaining full-solution gaps are R-score/R-drift execution, full Behavioral Containment, production arbitration calibration, run-control/eval budgets/labels, and post-approval audit display. Backend/read-model auditor `Kant the 2nd` confirmed major surfaces are API/read-model backed through `cockpit-data.ts` and `src/services/cockpitModel.ts`, with residual centralized demo fixtures, component-local display overlays, and D5 discoverability as concerns. Visual reviewer `Feynman the 2nd` mixed mobile into scores after mobile was deferred, so that output is future mobile backlog only. Corrected desktop-only visual reviewer `Beauvoir the 2nd` reopened Maya `/run`, David `/credit`, `/login`, and governance routes below `4/5`. All four agents were closed after use.
- Durable approval finality slice details: `/approval` now prepares the approval through service-layer validation, claims insert-only durable finality as `approval:<actionId>` before `approvals.decide` consumes process-local finality when SQLite/Supabase memory is configured, maps duplicate claims to `409`, maps durable claim/write outages to `503`, persists the service audit hash back to the approval record, and preserves normal memory upsert behavior for non-finality records. Verification: `npm.cmd run typecheck` passed; `npm.cmd run test -- tests\unit\cockpit-api.test.ts` passed (`32/32` at that point; now `37/37` after role/auth tests); targeted backend/invariant suite passed (`13` files / `142` tests). Residual: if the post-service audit-hash enrichment write fails after a durable claim succeeds, the client sees `503` while process-local finality is already consumed; treat as an operational hardening follow-up, not a blocker for this bounded slice.
- Role-principal mapping slice details: new `config/cockpitHumanPrincipals.ts` centralizes `maya -> human:maya-lead`, `david -> human:david-lead`, and `cfo -> human:cfo-lead`. Next proxy routes attach request-bound proof headers (`purpose`, method/path, body hash, issuedAt, nonce, role, principal) after verifying signed demo sessions. The API rejects direct role-derived principals unless they match the configured direct principal, accepts signed proxy principals only for route allowlists, consumes proxy nonces to block replay, rejects body tampering, and requires `RECOUP_DEMO_SESSION_SECRET` rather than falling back to `RECOUP_COCKPIT_AUTH_TOKEN`. Verification: typecheck passed and targeted backend/auth/invariant suite passed (`13` files / `142` tests). Reviewer history: `Hooke` failed the first broadening attempt; `Godel` passed the intermediate spec; `Archimedes` found replay/static-secret issues; both fixes are now implemented/tested; final reviewer `James` passed the request-bound proxy-proof slice with no Critical/Important/Minor issues.
- Maya `/run` visual remediation was previously scored `4/5 PASS` by reviewer `Curie`, but latest desktop-only reviewer `Beauvoir the 2nd` reopened it at `3.7/5 FAIL` for raw `ToolStatusRail` / `MultimodalDock` labels, snake-case feed labels, and cramped rail copy. Treat `/run` as open P1 desktop polish until a fresh desktop reviewer scores `>=4/5`.

Current runtime screenshot evidence:

- `output/playwright/desktop-review/maya-forensics-1440.png`
- `output/playwright/desktop-review/david-credit-1440.png`
- `output/playwright/desktop-review/cfo-1440.png`
- Full e2e screenshots also exist under `output/playwright/e2e/`, including `maya-run-1440.png`, `david-command-1440.png`, `login-1440.png`, `governance-agents-1440.png`, `governance-connectors-1440.png`, `governance-memory-1440.png`, and `governance-trace-1440.png`.

Latest Maya desktop capture:

- Path: `output/playwright/e2e/maya-forensics-1440.png`
- Viewport: `1440x900`
- Latest verification: `npm.cmd run typecheck` passed; focused cockpit/invariant contract tests passed after the Maya source/journey work (`4` files / `80` tests); after the sidebar/logout slice, `tests/invariants/cockpit-no-business-logic.test.ts` passed (`21/21`); after the latest layout/queue pass, `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-v12-contract.test.ts tests\invariants\cockpit-no-business-logic.test.ts` passed (`3` files / `42` tests). A narrow Maya-only Playwright desktop capture succeeded and refreshed `output/playwright/e2e/maya-forensics-1440.png` after asserting the `Recoup deduction forensics` H1.
- Current visual state: the screen now follows the ImageGen topology more closely with `ToolStatusRail`, dense product nav with visible Maya/footer/sign-out, Maya journey chip, scenario-led worklist with model-owned compact queue labels (`Billing` / `Review`), central evidence dossier, six-step Maya journey, and right `MultimodalDoc` sidecar with readable recovery draft gate. Reviewer `Faraday the 2nd` scored this screenshot `4/5 PASS`. The previous all-route `npm.cmd run test:e2e` timeout was resolved by stopping stale repo-owned API watchers and rerunning on a fresh port. Fresh broad e2e now passed and refreshed `output/playwright/e2e/*` screenshots.

Latest Maya `/run` desktop capture:

- Path: `output/playwright/e2e/maya-run-1440.png`
- Viewport: `1440x900`
- Latest verification before reviewer: `npm.cmd run typecheck` passed, focused cockpit/realtime tests passed (`39/39`), and `npm.cmd run test:e2e` passed with refreshed screenshots.
- Visual state: `/run` has a product-like source rail, dense module sidebar, scenario worklist, active recovery dossier, named MultimodalDock subagents, guarded Realtime evidence query, and audit checkpoint rail. Reviewer `Curie` scored it `4/5 PASS`, but latest desktop-only reviewer `Beauvoir the 2nd` reopened it at `3.7/5 FAIL`; fix raw labels and rail/feed copy before re-closing.

Latest David desktop capture:

- Path: `output/playwright/e2e/david-credit-1440.png`
- Viewport: `1440x900`
- Visual state: latest remediation reshaped the page into the ImageGen arbitration topology: compact Account-360 header, slimmer Sentinel warning rail, release workbench, proactive terms action packet with command buttons, David action queue, and topology-like Risk Mesh with owner/link/status panel. David approval REST was verified by `McClintock` (`tests/unit/cockpit-api.test.ts`, 28 tests passed). Reviewer `Meitner` previously scored the refreshed `/credit` screenshot `4/5 PASS`, but latest desktop-only reviewer `Beauvoir the 2nd` reopened it at `3.2/5 FAIL` because the Risk Mesh supervisor graphic overlaps the center value/name and hierarchy is weaker than the cue. Treat this as the top visual P0.

Latest David D5 desktop capture:

- Path: `output/playwright/e2e/david-command-1440.png`
- Viewport: `1440x900`
- Visual state: `/credit/command` now exists as a backend-wired dark D5 command centre using `fetchCreditModel`, scoped CSS module styling, and e2e screenshot capture. It includes command sidebar, tool status rail, monitor tape, stat strip, exposure board, live bureau feed, behavioral signal rails, active arbitrations, re-underwriting, Risk Mesh queue, audit status, and system feed. Reviewers `Gibbs` and `Beauvoir` both scored earlier screenshots `3/5 FAIL`; reviewer `Chandrasekhar` scored a later pass `4/5 PASS`; all-persona auditor `Bernoulli` reopened D5 at `3/5 FAIL`, then `Meitner` exposed a CSS grid bug that made the body render blank at `2/5 FAIL`. The latest fixed-grid pass uses explicit grid placement, removed primary `Pending ERP`, refreshed e2e screenshots, and reviewer `Raman` scored D5 `4/5 PASS`. D5 visual audit is closed for the active desktop persona route.

Latest CFO desktop capture:

- Path: `output/playwright/e2e/cfo-1440.png`
- Viewport: `1440x900`
- Visual state: board-pack remediation now renders report metadata, CFO board metric ledger, model-backed AuditVerifyChip, proof posture table, open dependency table, change ledger, AI insight, and provenance footer from the CFO read model. First reviewer `Averroes` scored the intermediate pass `3/5 FAIL`; after raw-hash/ID copy was removed and hierarchy tightened, reviewer `Peirce` scored `/cfo` `4/5 PASS`. Residual polish is non-blocking: the page is still more austere/internal than the cue.

Latest login/governance desktop captures:

- Paths: `output/playwright/e2e/login-1440.png`, `output/playwright/e2e/governance-agents-1440.png`, `output/playwright/e2e/governance-connectors-1440.png`, `output/playwright/e2e/governance-memory-1440.png`, and `output/playwright/e2e/governance-trace-1440.png`.
- Viewport: `1440x900`.
- Visual state: `/login` renders a product entry workstation with a governed identity rail, role-scoped persona selector, access-boundary ledger, and connector read-model `ToolStatusRail`. Governance routes render command strips, icon navigation, source/proof tiles, compact structured data rows, side proof rails, and a curated memory evidence surface with citations kept reachable. Reviewer `Copernicus` previously scored these `4/5 PASS`, but latest desktop-only reviewer `Beauvoir the 2nd` reopened `/login` at `3.3/5 FAIL` and governance routes at `3.1-3.4/5 FAIL` for whitespace, raw component labels, schema/table substrate, raw memory keys/chips, hash-heavy primary surfaces, and diagnostic feel.

Current implementation slice:

- `AGENTS.md`: added cockpit anti-slop standard from the user's Catalog of Tells.
- `src/agents/riskMesh.ts`: exposes existing partial-hold scores/weights through the Harbor context so UI charts can render real backend data.
- `src/services/cockpitModel.ts`: expanded Maya, David, and CFO read models with display-ready but deterministic fields: scenario-level worklist, source tiles, MultimodalDock rows, approval action labels, Account-360 detail/summary rows, Sentinel signals, criteria rows, human labels, CFO board metrics, dependency table rows, provenance, and latest David `/credit` readout/Sentinel/action-queue/partial-hold/terms display labels.
- `cockpit/app/cockpit-data.ts`: mirrors the expanded API contracts, including the latest David `/credit` Account-360 detail/summary rows plus readout/Sentinel/action-queue/partial-hold/terms label fields.
- `cockpit/app/cockpit-shell.tsx`: persona module rail is now the single product rail; module rows with real routes are actual links and filtered through `session.allowedRoutes`.
- `cockpit/app/premium-components.tsx`: source rail user-facing label changed from literal `ToolStatusRail` to `Source readiness`; graph uses human function labels; source rail and MultimodalDock rows now consume read-model data instead of local static arrays/timestamps.
- `cockpit/app/forensics/page.tsx`: Maya source rail moved above KPIs; scenario-level worklist, evidence-centered workbench, model-backed dock, and model-backed approval controls added; approval now appears after evidence to match the anti-rubber-stamp journey.
- `cockpit/app/forensics/page.tsx`: latest Maya remediation reduced squeezed worklist columns, moved AuditVerify above the dock, and added a real journey-node spine.
- `cockpit/app/credit/page.tsx`: David now renders Account-360, Sentinel alert, score criteria table, Risk Mesh graph, and Action packet; no React-side dollar/score arithmetic. The route now consumes model-owned readout toolbar labels, Account-360 detail/summary rows, Sentinel detail/record-strip labels, approval record-strip labels, action queue summary, partial-hold score/split/criteria labels, and terms-packet labels.
- `src/services/cockpitModel.ts`, `cockpit/app/cockpit-data.ts`, and `cockpit/app/credit/page.tsx`: latest audit-hash slice exposes real Risk Mesh `chainHeadHash`, `arbitrationHash`, and `entryHashes`; CFO `provenance.auditHash` now uses the real Risk Mesh chain-head entry hash instead of the previous 12-character summary digest; Credit passes the model hash directly to `AuditVerifyChip`.
- `cockpit/app/credit/command/page.tsx` and `cockpit/app/credit/command/command.module.css`: D5 dark command centre route now renders from the credit read model with scoped styling and e2e screenshot coverage.
- `cockpit/app/cfo/page.tsx`: CFO now renders report metadata, board KPI ledger, model-backed AuditVerifyChip, proof posture table, dependency table, change ledger, AI insight, and provenance footer from `CfoSummaryCockpitModel`; no top connector rail, no primary raw hashes/record IDs, and no route-local executive label helpers or proof-count construction.
- `cockpit/app/login/page.tsx` and `cockpit/app/login/login-form.tsx`: login now renders a product entry workstation backed by `fetchConnectorReadinessModel`, with role-scoped persona selection, access-boundary proof, and a source-status rail instead of a centered generic auth card.
- `cockpit/app/governance/agents/page.tsx`, `cockpit/app/governance/connectors/page.tsx`, `cockpit/app/governance/memory/page.tsx`, `cockpit/app/governance/trace/page.tsx`, and `cockpit/app/governance/governance-nav.tsx`: governance routes now render dense URL-backed control surfaces from the existing read models; memory was curated away from raw schema/chip-cloud presentation while preserving all cited record IDs.
- `cockpit/app/styles.css`: desktop density pass, integrated Maya workbench, removal of thick colored accent bars/inset rails, and persona-specific David/CFO classes. Large shared stylesheet diff existed from the broader active revamp; avoid unrelated churn.
- `cockpit/app/styles.css`: latest hardening converts the Maya source rail from card strip to compact row instrumentation, removes global/heading tracking, removes gradients/pseudo accent bars/inset rails, shortens source state noise, flattens nested card selectors, and replaces David's score orb with a score ledger.
- `cockpit/app/styles.css`: latest Maya remediation separates the workbench into three panes, restores compact source proof detail, improves the product rail density, allows key worklist/evidence text to wrap, removes sidecar internal scrolling, and compacts the action inbox.
- `tests/unit/cockpit.test.ts`: asserts expanded read-model fields.
- `tests/invariants/cockpit-no-business-logic.test.ts`: updated route-nav, scenario worklist, model-backed approval controls, evidence-before-approval, and hard anti-generated-UI invariants. It now blocks 2px+ directional rails, inset rails, pseudo accent bars, uppercase/tracking-wide tells, non-zero letter spacing, gradients, orb naming, nested card selectors, and spacious card padding/min-height regressions across cockpit CSS/markup.
- `tests/invariants/cockpit-v12-premium-components.test.ts`: updated premium contract for Source readiness, model-backed dock/source tiles, and David/CFO persona layout classes.
- `tests/e2e/cockpit-premium-e2e.ts`: updated runtime assertions for Account-360, Action packet, CFO board metric ledger, CFO provenance footer, and D5 screenshots.

Subagent audit results captured:

- Historical visual anti-slop subagent: scored the then-current screenshots Maya `2/5`, David `1/5`, CFO `2/5`; flagged generic KPI strips, nested/card-everything composition, raw proof/debug strings, and David's score/graph trope. Later reviewer-scored remediation closed Maya `/forensics`, Maya `/run`, David `/credit`, D5 `/credit/command`, and CFO `/cfo` at `4/5`.
- CSS/invariant subagent: confirmed no active uppercase/tracking/gradient/glass violations, but flagged `forensics-kpi-strip`, `cfo-kpi-strip`, `executive-strip`, and `graph-score-ring` as remaining generated-dashboard tells plus regex gaps.
- Historical full-solution SDD/wiring subagent result: highest-risk gap was David HITL approval wiring. It also flagged Maya evidence-open gating as copy-only, the dock as read-model-backed rather than live Realtime, missing Crestline containment handoff, missing David D5 at that time, and CFO AuditVerify/drilldown gaps. David HITL, D5, CFO visual/readout, Maya-only Realtime proxy auth, bounded cockpit API durable approval finality, local role-principal mapping, Credit/CFO real audit-hash surfacing, deterministic Governance Trace audit-entry fidelity, login persona read-model ownership, and Governance Memory provenance honesty have since landed, but Crestline containment, R-score/R-drift, run-control/eval budgets/labels, post-approval audit display, and broader read-model ownership remain open.
- Follow-up SDD/backend reviewer `Fermat`: David HITL local browser scope is now closed, but P0/P1 gaps remain: approval finality stored only in a process-local `Set`, role-specific human principal mapping incomplete, Crestline containment read model missing, and some audit chips not backed by real hashes. The SDD/config arbitration-weight wording contradiction is closed: SDD §5.7 / Appendix G now document owner-ratified Day-1 governed config seed values while keeping production calibration VERIFY-PROD. Realtime proxy auth for `/run` is now widened only for Maya demo-session cookies on both query routes; David/CFO demo cookies remain rejected.

Corrections applied after those audits:

- Runtime class families `forensics-kpi-strip`, `cfo-kpi-strip`, `executive-strip`, and `graph-score-ring` were removed and replaced with `scenario-metric-ledger`, `board-metric-ledger`, `control-ledger`, and `arbitration-score-cell`.
- SDD/config arbitration-weight wording is reconciled: the SDD no longer calls the Day-1 arbitration P&L weights placeholders or pending expert input, and it preserves the rule that Codex must never invent or change expert-owned constants. Production arbitration-weight calibration remains VERIFY-PROD.
- `tests/invariants/cockpit-no-business-logic.test.ts` now blocks the removed class families, `score-ring`/`score-orb`, broader pseudo-element accent bars, inset rails, and camelCase uppercase/tracking style props.
- Source readiness now emits seven product sources in cue order: SAP OData, TPM, 3PL POD, Bureau, Remittance / EDI, Contract Repo, MCP. The 3PL POD source is explicitly synthetic-labelled rather than shown as live.
- `ToolStatusRail` now renders source tiles with Phosphor icons instead of letter-only source marks.

Recent verification during the active revamp:

- `npm.cmd run lint` passed after the David/CFO read-model-backed revamp.
- `npm.cmd run typecheck` passed after the David/CFO read-model-backed revamp.
- `npm.cmd run test -- tests\invariants\cockpit-v12-premium-components.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\unit\cockpit.test.ts` passed after the David/CFO read-model-backed revamp.
- `npm.cmd run test:e2e` passed after the David/CFO read-model-backed revamp and wrote screenshots to `output/playwright/e2e/`.
- `npm.cmd run verify` passed earlier after the rail/orb/anti-tell hardening: `66` test files, `349` tests, and no dependency-cruiser violations. This is **historical evidence**, not the current final gate.
- After the subagent-driven anti-tell patch, `npm.cmd run typecheck` passed and `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-premium-components.test.ts tests\unit\cockpit.test.ts` passed (`25` tests).
- After the login fallback and dock policy-label fix, `npm.cmd run test:e2e` passed and wrote refreshed screenshots to `output/playwright/e2e`.
- Current final gate status: **green but not sufficient for goal completion**. Fresh `npm.cmd run verify` passed after the latest David Risk Mesh CSS/test fix: ESLint passed, TypeScript passed, Vitest passed (`67` files / `399` tests), and Dependency Cruiser found no violations (`96` modules / `247` dependencies`). This proves the current repo gate, but not the remaining full-solution SDD/business capability gaps or pending desktop visual re-review.
- Login e2e root cause and fix: `npm.cmd run test:e2e` initially exposed a hydration race where the login form submitted as `GET /login?loginId=...&password=...` before the client handler mounted. The login form now has a server POST fallback to `/api/demo-login`, and the API route accepts both JSON and formData, redirecting on form POST with the signed session cookie. After adding the `voice/text citation parity` policy label to the dock read model, `npm.cmd run test:e2e` passed and wrote refreshed screenshots to `output/playwright/e2e`.
- David HITL focused verification after reviewer fixes: `npm.cmd run lint` passed, `npm.cmd run typecheck` passed, and `npm.cmd run test -- tests\unit\realtime-next-routes.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\unit\cockpit-api.test.ts` passed (`51` tests).
- Current full repo gate after David HITL reviewer loop: `npm.cmd run verify` passed with `66` test files, `354` tests, and no dependency-cruiser violations.
- David visual focused verification after the latest reviewer-driven pass: `npm.cmd run typecheck` passed, `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-premium-components.test.ts tests\unit\cockpit.test.ts` passed (`26` tests), and `npm.cmd run test:e2e` passed with refreshed screenshots under `output/playwright/e2e/`.
- Historical full repo verification after the David HITL/visual patch: `npm.cmd run verify` passed with ESLint green, TypeScript green, Vitest `66` files / `354` tests green, and Dependency Cruiser green (`94` modules, `232` dependencies). This is no longer a final visual gate because the stricter all-persona reviewer reopened David.
- Maya visual slice verification after the latest anti-tell/remediation patch: `npm.cmd run typecheck` passed, `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-premium-components.test.ts tests\unit\cockpit.test.ts` passed (`26` tests), `npm.cmd run test:e2e` passed with refreshed screenshots under `output/playwright/e2e/`, and reviewer `Aristotle` scored Maya `/forensics` `4/5 PASS`.
- David/D5 visual remediation verification after the latest reviewer-driven passes: `npm.cmd run typecheck` passed; focused cockpit/D5 tests passed (`27/27`); `RECOUP_E2E_COCKPIT_PORT=3025 npm.cmd run test:e2e` passed and captures `output/playwright/e2e/david-credit-1440.png`, `output/playwright/e2e/david-command-1440.png`, `output/playwright/e2e/login-1440.png`, and governance screenshots. Reviewer `Meitner` passed David at `4/5`; reviewer `Raman` passed D5 at `4/5`.
- CFO board-pack remediation verification: `npm.cmd run typecheck` passed; focused cockpit tests passed (`26/26`); `npm.cmd run test:e2e` passed and refreshed `output/playwright/e2e/cfo-1440.png`. Reviewer `Averroes` scored the first remediation `3/5 FAIL`; reviewer `Peirce` scored the final remediated CFO screenshot `4/5 PASS`.
- Maya `/run` remediation verification: `npm.cmd run typecheck` passed; focused cockpit/realtime/invariant tests passed (`39/39`); `npm.cmd run test:e2e` passed and refreshed `output/playwright/e2e/maya-run-1440.png`. Reviewer `Curie` scored the final remediated `/run` screenshot `4/5 PASS`.
- Durable approval finality and role-principal verification: `npm.cmd run typecheck` passed; `npm.cmd run test -- tests\unit\realtime-next-routes.test.ts tests\unit\cockpit-api.test.ts tests\invariants\cockpit-role-auth.test.ts tests\unit\realtime-session.test.ts tests\unit\realtime-browser-session.test.ts tests\unit\supabase-memory.test.ts tests\unit\sqlite-memory.test.ts tests\unit\runtime-memory.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\action-hitl-all-capabilities.test.ts tests\invariants\integration-contract.test.ts tests\invariants\sod.test.ts tests\invariants\memory-contract.test.ts` passed (`13` files / `142` tests). Spec reviewer `Wegener`: PASS for durable finality. Code-quality reviewer `Laplace`: Ready/Yes for durable finality. Role-principal reviewer `James`: Ready/Yes with no Critical/Important/Minor issues after tests covered body tamper, nonce replay, no bearer-token fallback, direct CFO rejection, and CFO proxy rejection.
- Run-control/eval release-gate verification: added `buildReleaseReadinessReport` in `evals/harness.ts`; blocked run control, blocked eval labels, and failing metrics now produce release `fail`, while all-pass inputs produce release `pass`. `npm.cmd run test -- tests\evals\accuracy-bars.test.ts tests\invariants\run-control.test.ts` passed (`2` files / `20` tests), `npm.cmd run typecheck` passed, and reviewer `Darwin` returned Ready/Yes with no Critical or Important issues. This does not invent Appendix G run budgets or missing intent/arbitration labels; it makes their absence release-blocking.
- Login/governance visual remediation verification: `npm.cmd run typecheck` passed; `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-premium-components.test.ts` passed (`3` files / `26` tests); a narrow Playwright desktop screenshot pass refreshed `/login` and `/governance/{agents,connectors,memory,trace}` at `1440x900`. Reviewer `Copernicus` scored all five routes `4/5 PASS` after the memory rewrite. Reviewer `Planck` initially returned Ready/No for hidden memory citations and malformed ARIA table roles; fixes preserved all citations, removed malformed roles, derived connector operation summary from the read model, and `Planck` re-reviewed Ready/Yes.
- Real audit-hash surfacing verification: implementer `Epicurus the 2nd` first made `tests/unit/cockpit.test.ts` fail because `model.audit.chainHeadHash` was undefined and CFO still emitted the 12-character `b7ec95ec90dc`; after the fix, `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\integration-contract.test.ts tests\invariants\cockpit-no-business-logic.test.ts` passed (`3` files / `31` tests), and `npm.cmd run typecheck` passed. Spec reviewer `Sagan the 2nd` passed; code reviewer `Hypatia the 2nd` found no Critical or Important issues. Minor residual: `riskMeshAuditHashes()` assumes the `arbitration.blocked` entry taxonomy and tests mirror the deterministic Risk Mesh run.
- Credit approval citation verification: implementer `Meitner the 2nd` first made focused tests fail because `approvalInbox[].recordIds` was undefined and the credit page did not render `RecordStrip` from `item.recordIds`; after the fix, hold/terms approval rows carry `run.holdAction.recordIds` and `run.termsAction.recordIds`, and the David action packet renders visible per-action citations beside HITL controls. Spec reviewer `Boole the 2nd` initially failed the broad dirty diff as overreach, then passed after corrected slice scoping. Code reviewer `Huygens the 2nd` found an Important layout/visibility issue because action-table code chips were hidden; the fix moved citations into `credit-action-basis`, removed the scoped hidden-code rule, added a regression assertion, and code re-reviewer `Noether the 2nd` returned Ready/Yes. Verification: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-no-business-logic.test.ts` passed (`2` files / `24` tests), `npm.cmd run typecheck` passed, and `RECOUP_E2E_COCKPIT_PORT=3025 npm.cmd run test:e2e` passed with refreshed screenshots.

Immediate next steps:

1. P0/P1 backend: Maya-only Realtime query proxy auth, bounded cockpit API durable approval finality, role-derived demo proxy principal mapping, explicit release-failing aggregation for blocked run-control/eval states, Credit/CFO real audit-hash surfacing, credit approval row citations, deterministic Governance Trace audit-entry rows, login persona read-model ownership, Governance Memory provenance honesty, D5 command-centre read-model ownership, CFO executive proof/status labels, David `/credit` toolbar/Sentinel/action-queue/partial-hold/terms/Account-360 label ownership, and Crestline/M6 thin-real risk-review readout are patched/tested/reviewed or locally verified. Remaining backend gaps are full Behavioral Containment action closure, R-score/R-drift execution, production arbitration calibration, actual run-control budgets/eval labels, post-approval audit display, and final all-view SDD/release verification.

Latest login persona ownership slice: worker `Schrodinger the 2nd` produced the expected RED tests for missing `buildLoginModel`, missing `GET /login`, and client-hardcoded personas. The implementation added `config/cockpitDemoProfiles.ts`, `buildLoginModel()`, `GET /login`, `fetchLoginModel()`, and `LoginForm` persona props while preserving Supabase-backed `/api/demo-login` credential verification. Focused verification passed: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\unit\cockpit-api.test.ts tests\unit\cockpit-demo-auth.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-contract.test.ts` (`75/75`) and `npm.cmd run typecheck`. Spec reviewer `Nash the 2nd` passed; code-quality reviewer `Kierkegaard the 2nd` returned Ready/Yes with no Critical or Important findings.

Latest Governance Memory provenance slice: explorer `Franklin the 2nd` confirmed `/memory` could serve Supabase, SQLite, or deterministic fallback records without exposing which source was used. Worker `Parfit the 2nd` began the RED unit coverage; the controller completed API and UI/invariant RED tests, producing 5 expected failures for missing `backend`, `sourceMode`, and `provenance`. The implementation adds model-level memory metadata: Supabase/SQLite return `runtime_persisted` / `persisted_runtime_memory`, while no durable backend returns `in_memory_fallback` / `deterministic_demo_fallback` / `deterministic_demo_memory`. Governance Memory renders those fields with explicit fallback wording. Focused verification passed: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\unit\cockpit-api.test.ts tests\invariants\cockpit-v12-contract.test.ts` (`54/54`) and `npm.cmd run typecheck`. Spec reviewer `Ramanujan the 2nd` passed; stalled code reviewer `Dalton the 2nd` was terminated and replacement reviewer `Lovelace the 2nd` returned Ready/Yes with no Critical or Important findings.
Latest David D5 command-centre read-model ownership slice: worker `Chandrasekhar the 2nd` added RED coverage and moved the command status rail, stats, exposure rows, feed rows, signal rows, audit rows, and market tape into `CreditCockpitModel.commandCenter`; `/credit/command` now consumes `model.commandCenter` instead of route-local command row builders. The controller corrected one worker test expectation that guessed a deterministic criterion value instead of mirroring the model. Focused verification passed: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-v12-contract.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\unit\cockpit-api.test.ts` (`73/73`) and `npm.cmd run typecheck`. Spec reviewer `Anscombe the 2nd` returned partial after timeout and was closed; replacement reviewer `Kuhn the 2nd` returned PASS. Code reviewer `Averroes the 2nd` returned partial after timeout and was closed; replacement reviewer `Gibbs the 2nd` returned Ready/Yes with no Critical or Important blockers.
Latest CFO executive proof/status label ownership slice: worker `Russell the 2nd` first returned partial with no edits, then continued with RED tests for missing CFO model-owned labels and route helper removal. The slice moves CFO `valueLabel`, `supportLabel`, `basisLabel`, `recordCountLabel`, provenance labels, `assurance`, and `readoutStatusLabels` into `CfoSummaryCockpitModel`; `/cfo` now renders those fields directly and no longer defines `executiveMetadataValue`, `executiveBasis`, `recordCountLabel`, or `humanize`. The controller also fixed the old route-helper copy bugs for `human approval approval` and the unreachable `synthetic seed 42 plus` label. Focused verification passed: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-contract.test.ts tests\unit\cockpit-api.test.ts` (`75/75`) and `npm.cmd run typecheck`. Spec reviewer `Erdos the 2nd` returned PASS. Code reviewer `Socrates the 2nd` found one Important route-local toolbar proof-count issue; after `readoutStatusLabels` fixed it, replacement reviewer `Avicenna the 2nd` returned Ready/Yes with no Critical or Important blockers.
Latest David `/credit` toolbar/Sentinel/action-queue label ownership slice: worker `Harvey the 2nd` was terminated after no checkpoint/final output; replacement worker `Lorentz the 2nd` observed RED failures for missing `model.readoutStatusLabels`, missing route model fields, and route-composed action record labels, then stalled after useful partials. The controller completed the narrow implementation: `CreditCockpitModel` now owns `readoutStatusLabels`, `sentinel.detailRows`, `sentinel.recordStripLabel`, `approvalInbox[].recordStripLabel`, and `actionQueueSummaryLabel`; `/credit` renders those fields directly; and `cockpit-data.ts` mirrors the API contract. Focused verification passed: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-contract.test.ts tests\unit\cockpit-api.test.ts` (`77/77`) and `npm.cmd run typecheck`. Spec reviewer `Jason the 2nd` returned PASS. Code reviewers `Pascal the 2nd` and `Aristotle the 2nd` were terminated after missing checkpoint/final windows; final reviewer `Locke the 2nd` returned Ready with no Critical or Important findings. Remaining David `/credit` route-local facts are partial-hold score/split/criteria and terms-packet labels, intentionally left for the next slice.
Latest David `/credit` partial-hold/terms label ownership slice: worker `Raman the 2nd` was terminated after no checkpoint/final output, but left useful RED tests requiring `model.partialHold.scoreReadout`, `releaseReadout`, `splitRows`, `ledgerRows`, `criteriaHeaders`, and `model.termProposal` packet/command labels. The controller observed RED, moved those fields into `CreditCockpitModel`, mirrored them in `cockpit-data.ts`, and updated `/credit` to render from the model. Focused verification passed: `npm.cmd run test -- tests\unit\cockpit.test.ts tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-contract.test.ts tests\unit\cockpit-api.test.ts` (`77/77`) and `npm.cmd run typecheck`. Spec reviewer `Newton the 2nd` returned PASS. Code reviewer `Arendt the 2nd` found two Important issues; the controller fixed raw top-summary score/ratio usage and narrowed over-broad invariant string bans, then re-ran verification (`77/77` + typecheck). Re-reviewer `James the 2nd` returned Ready with no Critical or Important findings. Remaining David `/credit` route-local facts are account identifier/stat labels and route chrome.
2. P1 review: continue the full-solution SDD checklist line-by-line; do not scope it only to persona screens. Fresh `npm.cmd run verify` is green, but the line-by-line SDD review is still required before claiming final cockpit completion.
3. P0/P1 visual polish: latest desktop-only reviewer `Beauvoir the 2nd` scored David `/credit` `3.2/5 FAIL` before the Risk Mesh overlap fix; `Lagrange the 2nd` landed the fix and fresh e2e/verify are green, so David needs re-review before closure. Maya `/run` remains `3.7/5 FAIL`, `/login` remains `3.3/5 FAIL`, and governance routes remain `3.1-3.4/5 FAIL`. Maya `/forensics`, D5, and CFO remain desktop-pass. Mobile findings from `Feynman the 2nd` are future backlog only because mobile is deferred.

## Last Historical Full Verification Evidence

Last known full repo gate passed before the current David HITL reviewer workflow:

```powershell
npm.cmd run verify
```

Result:

- ESLint passed.
- TypeScript typecheck passed.
- Vitest passed: `66` test files, `349` tests.
- Dependency Cruiser passed with no dependency violations.

Note: this historical full verify was superseded by the current green gate captured above: after the latest Maya layout, D5 lint, and test-lint fixes, `npm.cmd run test:e2e` and `npm.cmd run verify` both passed on the latest reviewed diff.

## High-Level Build Status

Recoup is now a deterministic, agent-ready O2C recovery cockpit for the NorthBay demo story. The implemented build keeps the repo contract intact:

- Code computes dollar amounts.
- Decisions cite record IDs and deterministic basis.
- SAP remains read-only.
- External actions remain human-approved and draft-only.
- Expert-owned constants are not invented.

## Completed Work

### Supabase And Durable Memory

- Supabase/Postgres is wired as the primary shared durable memory path when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.
- SQLite remains the local/offline fallback when `RECOUP_MEMORY_DB_PATH` is configured.
- In-memory store remains for test/demo harness paths without durable config.
- Memory categories are typed and scoped: session, workflow, case, transaction, evidence, approval, audit, connector, artifact, compaction, and agent-handoff state.
- Supabase schema SQL is captured in `docs/supabase-memory-schema.sql`.
- Postgres `timestamptz` values are normalized to Recoup ISO memory timestamps before Zod validation.
- Tests cover schema SQL, REST upsert/list behavior, timestamp normalization, runtime backend selection, and SQLite fallback.

Key files:

- `src/memory/supabaseStore.ts`
- `src/memory/sqliteStore.ts`
- `src/memory/runtime.ts`
- `src/memory/schema.ts`
- `src/memory/session.ts`
- `tests/unit/supabase-memory.test.ts`
- `tests/unit/sqlite-memory.test.ts`
- `tests/unit/runtime-memory.test.ts`
- `tests/invariants/memory-contract.test.ts`

### SAP OData

- SAP OData adapter remains read-only.
- No ERP write-back path was added.
- OAuth and Gateway Basic auth are supported for read-only metadata/GET access.
- Scope and tenant are optional when the SAP endpoint does not require them.
- `docs/Tools_data` invoice reads are mapped to `ZUI_BILLINGDOCUMENTFS_0001/C_BillingDocumentFs`.
- `SAP_ODATA_CLIENT` is required for live SAP readiness and is sent as `sap-client` on metadata/read GETs.
- Non-numeric synthetic `INV-*` IDs fail closed instead of becoming live SAP reads.
- POD, credit memo, and duplicate-claim proof are no longer emitted as SAP fallback evidence.
- Live Basic-auth metadata proof was captured for `FCOM_COSTCENTER_SRV/$metadata`.
- The live metadata proof exposed `CostCenterSet` and `F4_CostCenterSet`.
- SAP credential details are not serialized in runtime config output.
- The SAP skill is installed under `skills/sap-odata-access/SKILL.md`.

Key files:

- `src/adapters/sapOData.ts`
- `src/tools/retrieval/sap.ts`
- `skills/sap-odata-access/SKILL.md`
- `tests/unit/sap-odata.test.ts`
- `tests/invariants/no-erp-writeback.test.ts`
- `tests/invariants/integration-contract.test.ts`

### OpenAI Realtime Query Guard

- `gpt-realtime-2` is pinned behind a server-issued client-secret route.
- `POST /query/realtime-client-secret` requires verified cockpit human auth.
- The verified human principal is used as the `OpenAI-Safety-Identifier`.
- Realtime issuance gates only on `OPENAI_API_KEY`; unrelated SAP/Supabase config parsing cannot block it.
- Local live proof returned HTTP `200`, status `issued`, transport `webrtc`, and audit record `OPENAI-REALTIME-POLICY`.
- No OpenAI key or client secret value was printed.
- Browser voice/text remains a controlled demo surface wired through the guarded Realtime browser helper; production live-query policy and identity remain approval dependencies.

Important caveat:

- The local Windows/Node HTTPS path exposed `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.
- The live proof used one process-scoped TLS bypass only.
- Production/demo machines should fix the trusted CA chain rather than use TLS bypass.

Key files:

- `src/services/realtimeSession.ts`
- `src/services/cockpitApi.ts`
- `cockpit/app/realtime-query-controls.tsx`
- `cockpit/app/api/query/realtime-client-secret/route.ts`
- `tests/unit/realtime-session.test.ts`
- `tests/unit/cockpit-api.test.ts`

### Cockpit UI And API

- Cockpit has Forensics, Credit/Arbitration, CFO Summary, Agent Operations, memory, and trace bands.
- First viewport desktop SaaS polish was applied against the O2C design system.
- Mobile navigation wraps instead of clipping.
- Mobile worklist table is compact enough to keep amount cells visible.
- Approval controls are HITL-gated and route through the local API.
- Realtime client-secret controls are present but still a controlled demo affordance.
- Playwright/installed Chrome visual QA verified desktop `1440x900` and mobile `390x844`: nonblank render, no framework overlay, no console errors, and interaction focus.

Key files:

- `cockpit/app/page.tsx`
- `cockpit/app/styles.css`
- `cockpit/app/approval-controls.tsx`
- `cockpit/app/realtime-query-controls.tsx`
- `src/services/cockpitApi.ts`
- `src/services/cockpitModel.ts`
- `tests/unit/cockpit.test.ts`
- `tests/unit/cockpit-api.test.ts`
- `tests/invariants/cockpit-no-business-logic.test.ts`

### Agent Harness And Communication

- Offline-safe agent roster is declared for Forensics, Recovery Drafter, Risk Mesh, Sentinel, Containment, and Conversational Query.
- Forensics to Recovery handoff is represented in the implemented S4 boundary.
- Handoff graph and Zod handoff packets are implemented.
- Handoff packets carry `recordIds`.
- Query remains deterministic/offline-safe for answers and cites deterministic Harbor state.
- Risk Mesh/Sentinel/Containment remain deterministic harness modules. Owner-ratified Day-1 tunables from `CODEX_BUILD_ANSWERS.md` now have config-as-code bootstrap plus `recoup_config` v1 seed rows; the DB-backed runtime config loader/injection and VERIFY-PROD calibration remain open.

Key files:

- `src/agents/agentRuntime.ts`
- `src/agents/forensics.ts`
- `src/agents/handoffGraph.ts`
- `src/agents/messages.ts`
- `src/agents/query.ts`
- `src/agents/riskMesh.ts`
- `tests/unit/agent-runtime.test.ts`
- `tests/unit/agent-handoffs.test.ts`
- `tests/unit/query.test.ts`

### MCP, Permissions, And Service Boundary

- MCP server uses `StreamableHTTPServerTransport`.
- `/mcp` is protected when MCP auth is configured.
- Tool metadata includes risk class, side-effect class, and MCP/internal visibility.
- Read-only MCP clients are denied draft action calls before handler execution.
- Approval, core compute, and decision tools remain internal and are not MCP-visible.
- Service tools are namespaced, typed, and Zod-validated.

Key files:

- `src/mcp/server.ts`
- `src/services/serviceLayer.ts`
- `src/services/permissionEngine.ts`
- `tests/invariants/mcp-transport.test.ts`
- `tests/invariants/mcp-visibility.test.ts`
- `tests/invariants/tool-permissions.test.ts`
- `tests/invariants/tool-whitelist.test.ts`

### Audit And Judge Evidence

- README now includes the demo narrative, OpenAI capability map, memory, skills, handoffs, permissions, and claim-to-code-to-test table.
- Independent audit evidence is captured outside chat in `docs/independent-audit-log.md`.
- Broader architecture review and open recommendations are captured in `docs/architecture-review-and-recommendations.md`.
- Judge-visible evidence includes Supabase, SAP, Realtime, MCP, UI, and connector-readiness status.

Key files:

- `README.md`
- `docs/independent-audit-log.md`
- `docs/architecture-review-and-recommendations.md`

## Skills Used During The Build

### Codex/Superpowers Process Skills

- `superpowers:using-superpowers`
- `superpowers:test-driven-development`
- `superpowers:systematic-debugging`
- `superpowers:verification-before-completion`
- `superpowers:writing-plans`
- `superpowers:executing-plans`
- `superpowers:dispatching-parallel-agents`
- `superpowers:subagent-driven-development`
- `superpowers:requesting-code-review`
- `superpowers:finishing-a-development-branch`

### Domain/Implementation Skills

- `build-web-apps:supabase-postgres-best-practices`
- `build-web-apps:frontend-testing-debugging`
- `build-web-apps:frontend-app-builder`
- `build-web-apps:react-best-practices`
- `openai-docs`

### Local Recoup Skills Added

- `skills/recoup-evidence-pack/SKILL.md`
- `skills/recoup-recovery-drafting/SKILL.md`
- `skills/recoup-risk-arbitration/SKILL.md`
- `skills/recoup-query-answering/SKILL.md`
- `skills/sap-odata-access/SKILL.md`

### Subagent / Independent Review Work

- Memory/Supabase review.
- SAP connector review.
- UI/UX cockpit visual review.
- Realtime client-secret/security review.
- Architecture and harness review.

## Pending Items

### Expert-Owned Tunables

Owner-ratified Day-1 tunables are supplied for the demo in `CODEX_BUILD_ANSWERS.md`, and the repo now includes config-as-code bootstrap plus `recoup_config` v1 seed rows. The next implementation step is the DB-backed governed config loader/injection; remaining production calibration and owner `[VERIFY]` flags must not be guessed:

- Arbitration P&L production calibration; Day-1 demo values are already owner-ratified in governed config seed rows.
- R-score weights.
- Drift thresholds.
- Gaming thresholds.
- Embeddings model id.
- Codex build-model id.
- SAP sandbox instance.

### SAP / O2C Live Depth

- SAP read-only Gateway metadata proof exists.
- Live O2C billing/outbound-delivery services still need reachable endpoints.
- Need metadata-backed entity sets, key fields, and sample payloads for actual O2C evidence mapping.
- ERP write-back remains out of scope.
- SAP must stay read-only.

### Realtime / Query

- Server-side Realtime client-secret path is live-proved.
- Browser voice/text session is wired through the guarded Realtime browser helper; production live-query policy remains an approval dependency.
- Live answers must remain constrained to deterministic query tools and cited Recoup records.
- Local Node/Windows CA trust should be fixed to avoid TLS bypass during demos.

### Supabase / Memory Scale Path

- Supabase runtime memory is wired and tested.
- SQLite fallback exists.
- Replay-grade audit/memory rehydration remains a scale-path item.
- Production RLS/auth principal model should be hardened beyond service-role-only hackathon access.

### MCP / Enterprise Deployment

- MCP StreamableHTTP auth and RBAC baseline are implemented.
- Secure MCP Tunnel/private-network hardening remains a scale-path item.
- Production IdP/OAuth/KMS decisions remain open.

### Connector Strategy

SAP remains the only live adapter. Workflow 2B implements the Day-1 synthetic Supabase static table schema and readiness foundation for the other sources behind canonical source ports:

- Bureau feed.
- Remittance.
- EDI.
- Document repository.
- TPM.

Implemented foundation:

- Added static Supabase table definitions for bureau, docs, consolidated remittance/EDI, and TPM.
- Connector readiness reports non-SAP sources as `ready_synthetic` only after a Supabase schema probe verifies the `docs/Tools_data` tables.
- Credentials without a successful probe report `blocked_schema_required`, not ready.
- Readiness blocks on missing/not-exposed `Tools_data` tables and unsafe shadow statuses such as `SENT_TO_SAP`, `SUBMITTED_TO_PORTAL`, or `SAP_STAGE_WRITE`.
- `docs/Tools_data/seed_data.sql` remains human-approval only because it truncates tables and seeds action/decision/audit-like rows.
- `recoup_src_remittance` is the shared static table for remittance and EDI-remittance via `transaction_set`.

Remaining implementation:

- Add full synthetic table-reading adapters if source retrieval expands beyond readiness.
- Keep `provenance = synthetic` and semi-trusted connector state visible in any seeded connector records.
- Preserve the source-swap boundary so live contracts can replace synthetic adapters later without changing core/services.
- Keep real non-SAP live contracts deferred to VERIFY-V3.

### Cockpit Product Depth

- First-viewport desktop/mobile QA baseline is resolved.
- Deeper drilldowns and expanded workflows remain planned.
- Final O2C design review is still needed for expanded flows beyond the first viewport.

### Git / Repo Hygiene

- Local branch `codex/guardrail-riskmesh-hardening` contains the preserved EOL verification fix and current guardrail/Risk Mesh hardening work.
- This session branch has not been pushed.
- Open a PR only after `npm.cmd run verify` is green on the final diff.

## How To Run In VS Code

Open the repo folder:

```powershell
cd "C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup"
code .
```

Install dependencies if needed:

```powershell
npm.cmd install
```

Run the full guard:

```powershell
npm.cmd run verify
```

Run the API:

```powershell
npm.cmd run dev:api
```

Run the cockpit:

```powershell
npm.cmd run dev:cockpit
```

Default API URL:

```text
http://127.0.0.1:4317
```

Open the Next.js URL printed by `dev:cockpit`.

## Demo Flow

The live story is a two-persona demo:

- Maya Patel is the Deduction Forensics analyst: she works the recovery queue, evidence pack, draft action, approval controls, run trace, and guarded Realtime query.
- David Kim is the Credit / Arbitration lead: he reviews Harbor through Sentinel, Risk Mesh arbitration, deterministic partial-hold split, draft terms, and pending human approvals.
- CFO Summary remains the read-only executive close.

1. Start on the Forensics queue and show recovery and billing-prevention drafts.
2. Open evidence pack and record IDs for a recovery line.
3. Use approval controls to show human approval and audit hash output.
4. Ask the guarded Realtime query why Harbor is blocked and show cited-or-blocked output.
5. Move to Credit/Arbitration and explain Harbor's governed partial-hold split.
6. Show Agent Operations: MCP surface, typed memory categories, handoff graph, and trace timeline.
7. Close with CFO Summary and explicitly call out open VERIFY-PROD calibration dependencies.

## Safety Reminders

- Do not print `.env.local` values.
- Do not commit `.env.local`; it is ignored.
- Use `npm.cmd`, not `npm`, in this Windows workspace.
- Node 25 is accepted for this hackathon, though the repo runtime target remains Node 22+ TypeScript.
- Do not add ERP write-back.
- Do not invent domain constants.
- For any rule, guard, score, memory, schema, or decision-producing change, use tests-first.

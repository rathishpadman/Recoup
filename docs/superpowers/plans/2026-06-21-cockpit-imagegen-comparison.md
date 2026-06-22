# Recoup Cockpit ImageGen Comparison

Date: 2026-06-22
Status: latest desktop-only reviewer `Beauvoir the 2nd` supersedes the earlier all-pass wording. Current desktop passes are Maya `/forensics` (`4.0/5`), David D5 `/credit/command` (`4.4/5`), and CFO `/cfo` (`4.1/5`). Current desktop failures are Maya `/run` (`3.7/5`), `/login` (`3.3/5`), and governance routes (`3.1-3.4/5`). David `/credit` was `3.2/5 FAIL` before the latest Risk Mesh CSS fix; that implementation fix, e2e refresh, and full verify are now green, but a fresh desktop visual reviewer must rescore it before closure. Mobile is explicitly deferred and is not part of this desktop gate.

## Scope

ImageGen visual comparison applies to all personas, not only Maya: Maya, David credit, David D5, and CFO. The raster cues are not pixel baselines; they are product-density and look-and-feel references. Runtime screens must be judged with the goal scorecard, then browser screenshots become the regression baseline after approval.

Completion gate: each runtime persona screen must score at least `4/5` against its ImageGen cue and anti-LLM review checklist. A visual audit with a `1/5`, `2/5`, or `3/5` score is a failed gate and remains pending implementation work.

Backend wiring gate: each runtime persona screen must render operational/business facts from API/read-model fields. Static React-only UI is not acceptable except explicitly labelled demo chrome.

## Assets

| Persona | Runtime screenshot | ImageGen cue |
|---|---|---|
| Maya Forensics | `output/playwright/e2e/maya-forensics-1440.png` | `mockups/imagegen/maya-forensics-journey.png` |
| Maya Run Trace | `output/playwright/e2e/maya-run-1440.png` | `mockups/imagegen/maya-forensics-journey.png` |
| David | `output/playwright/e2e/david-credit-1440.png` | `mockups/imagegen/david-credit-arbitration.png` |
| David D5 | `output/playwright/e2e/david-command-1440.png` | `mockups/imagegen/david-command-center-dark.png` |
| CFO | `output/playwright/e2e/cfo-1440.png` | `mockups/imagegen/cfo-executive-readout.png` |
| Login | `output/playwright/e2e/login-1440.png` | Product entry/status cue |
| Governance | `output/playwright/e2e/governance-*-1440.png` | Product governance/status cue |

## Current Visual Scores

| Screen | Score | Current hard gaps | Priority |
|---|---:|---|---|
| Maya Forensics | 4.0/5 PASS | `Aristotle` passed an earlier refreshed e2e screenshot. The user then reopened Maya against the stricter ImageGen/topology cue; reviewer `Linnaeus the 2nd` scored the intermediate screen `3.5/5 FAIL`; the latest remediation fixed sidebar/footer visibility, active nav/logout, compact queue labels, worklist grid width, sidecar compactness, and screenshot reliability. Reviewer `Faraday the 2nd` scored the recaptured screenshot `4/5 PASS`; desktop-only reviewer `Beauvoir the 2nd` confirmed `4.0/5 PASS`. Residual polish: productize raw component labels like `ToolStatusRail` / `MultimodalDoc`. | Closed for Maya Forensics |
| David Credit | Re-review pending | Earlier reviewers `Bohr` and `Meitner` scored passes after remediation, but desktop-only reviewer `Beauvoir the 2nd` reopened the route at `3.2/5 FAIL` because the Risk Mesh supervisor graphic overlapped the center value/name and hierarchy was weaker than the cue. Worker `Lagrange the 2nd` then added a RED invariant and CSS fix; `npm.cmd run test:e2e` refreshed `david-credit-1440.png`, and `npm.cmd run verify` passed. | P0 visual re-review |
| CFO Readout | 4.1/5 PASS | CFO board-pack remediation renders report metadata, board metric ledger, model-backed AuditVerifyChip, proof posture table, dependency table, change ledger, AI insight, and provenance footer from the CFO read model. Latest desktop-only reviewer `Beauvoir the 2nd` scored `/cfo` `4.1/5 PASS`; residual table-heavy austerity is non-blocking. | Closed for CFO Readout |
| David D5 Command Centre | 4.4/5 PASS | `/credit/command` is read-model wired through `fetchCreditModel` and captured by e2e. After previous fail/pass cycles, latest desktop-only reviewer `Beauvoir the 2nd` scored it `4.4/5 PASS`; remaining copy is slightly terminal/raw. | Closed for David D5 |
| Login | 3.3/5 FAIL | Latest desktop-only reviewer `Beauvoir the 2nd` reopened it for large empty center whitespace, raw `ToolStatusRail`, and generic setup rows. | P1 visual fix |
| Governance agents | 3.4/5 FAIL | Latest desktop-only reviewer `Beauvoir the 2nd` reopened it for truncated internal states, capability letters, and diagnostic feel. | P1 visual fix |
| Governance connectors | 3.2/5 FAIL | Latest desktop-only reviewer `Beauvoir the 2nd` reopened it for raw schema/table names, setup-card grid, and implementation substrate showing through. | P1 visual fix |
| Governance memory | 3.1/5 FAIL | Latest desktop-only reviewer `Beauvoir the 2nd` reopened it because raw memory keys/chips dominate and the route reads like a debug evidence browser. | P1 visual fix |
| Governance trace | 3.2/5 FAIL | Latest desktop-only reviewer `Beauvoir the 2nd` reopened it for hash-heavy raw audit output, sparse right rail, and insufficient reviewer-tool finish. | P1 visual fix |
| Maya Run Trace | 3.7/5 FAIL | Reviewer `Curie` previously scored `/run` `4/5 PASS`, but latest desktop-only reviewer `Beauvoir the 2nd` reopened it for raw `ToolStatusRail`, `MultimodalDock`, snake-case feed labels, and cramped rail copy. | P1 visual fix |

## Anti-LLM Corrections Applied This Pass

- Removed active `forensics-kpi-strip`, `cfo-kpi-strip`, `executive-strip`, and `graph-score-ring` runtime class families.
- Added invariant tripwires so those class names and `score-ring` / `score-orb` patterns fail if reintroduced.
- Changed Source readiness to the seven expected product sources: SAP OData, TPM, 3PL POD, Bureau, Remittance / EDI, Contract Repo, MCP.
- Added neutral Phosphor icons to source tiles instead of letter-only mini cards.
- Kept synthetic provenance visible for 3PL POD and non-live sources.

## Next Visual Backlog

| Priority | Item | Concrete action |
|---|---|---|
| P0 | David `/credit` Risk Mesh overlap and hierarchy. | Fix graph overlap around the center value/name, clarify the supervisor/owner topology, and tighten the primary workbench hierarchy until a fresh desktop reviewer scores `>=4/5`. |
| P1 | Maya `/run` raw labels and rail copy. | Replace raw `ToolStatusRail` / `MultimodalDock` labels and snake-case feed states with product language, then recapture `maya-run-1440.png` and re-review. |
| P1 | Maya `/forensics` residual polish. | Optional later polish only: productize raw component labels like `ToolStatusRail` / `MultimodalDoc`. Gate is closed at `4/5 PASS`. |
| P1 | CFO closed. | Keep residual polish for later; do not reopen unless a new regression appears. |
| P1 | D5 residual polish. | Gate closed at `4/5 PASS`; optional polish: tighten Risk Mesh queue lower span and active arbitration row height. |
| P1 | Login/governance desktop polish. | Latest desktop-only reviewer reopened these. Remove raw component labels, schema/table substrate, hash-heavy primary surfaces, truncated states, and generic setup rows. |
| P1 | Visual scorecard is manual only. | Add screenshot coverage and keep this document updated whenever a fresh reviewer supersedes earlier scores. |

Latest stricter visual reviewer notes:

- `Halley the 2nd` did not find a current document marking a route complete with a documented score below `4/5`; historical `1/5`, `2/5`, and `3/5` failures are marked superseded.
- `Halley the 2nd` did flag overconfidence: some current desktop screens still have product-copy, spacing, and panel-density gaps. Priority polish is David Risk Mesh layout/backend-ish labels, login workstation tightness and source-readiness copy, governance agent/trace density, memory business-language fallback states, and reducing repeated bordered panel patterns.
- `Feynman the 2nd` mixed mobile into the score after mobile was deferred; keep that output only as future mobile backlog, not the desktop gate.
- `Beauvoir the 2nd` performed the corrected desktop-only pass and reopened Maya `/run`, David `/credit`, `/login`, and governance routes below `4/5`. Those scores supersede earlier visual closure for the affected routes.
- A `4/5 PASS` means a route is acceptable for the active desktop demo gate, not that it is the final premium SaaS target.

## Workflow Gate

Any future P0/P1 visual work must follow implementer subagent -> visual/spec reviewer -> code reviewer -> screenshot capture -> score update. No screen should be marked visually complete until the score is `>=4/5`; stale or slow subagents must be terminated or replaced rather than waited on indefinitely.

Latest David visual pass history:

- `Rawls` visual worker was shut down after exceeding a useful wait window without actionable output.
- Manual bounded David patch replaced the score-ring/old partial-hold card with Account-360, Sentinel alert, score ledger, criteria table, Action packet, and Risk Mesh positioning.
- Focused guard after the selector fix passed: `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-premium-components.test.ts tests\unit\cockpit.test.ts` (`26` tests).
- `npm.cmd run typecheck` passed.
- `npm.cmd run test:e2e` passed and refreshed `output/playwright/e2e/david-credit-1440.png`.
- Visual reviewer subagent `Parfit` scored the first refreshed David screenshot `3/5 FAIL`.
- A follow-up David-only visual pass made the Action packet the wide primary workbench, moved score/Risk Mesh into the right analysis dock, flattened the audit/Risk Mesh treatment, quieted record IDs, and replaced `auditTrailValid=true` with human-readable hash-chain copy.
- Focused guard after the follow-up pass passed: `npm.cmd run test -- tests\invariants\cockpit-no-business-logic.test.ts tests\invariants\cockpit-v12-premium-components.test.ts tests\unit\cockpit.test.ts` (`26` tests).
- `npm.cmd run typecheck` passed.
- `npm.cmd run test:e2e` passed and refreshed `output/playwright/e2e/david-credit-1440.png`.
- Visual reviewer subagent `Hegel` scored the latest David screenshot `4/5 PASS`, but the later all-persona visual auditor `Descartes` compared the same current e2e evidence against the stricter ImageGen cue standard and scored David `2/5 FAIL`.
- That stricter failure was superseded after another implementation pass and reviewer `Bohr` scoring David `/credit` `4/5 PASS`.
- Latest David remediation pass: worker `Hypatia` was closed after a useful wait window with no file movement, then the main agent patched `cockpit/app/credit/page.tsx` and `cockpit/app/styles.css` directly. Reviewer `Halley` scored that `3/5 FAIL`, with blockers around Risk Mesh, alert action affordance, score visualizer, terms packet, and Account-360 hierarchy. A second remediation added a lien action, score affordance/band, packet command buttons, and a more explicit Risk Mesh owner/link/status panel. Verification passed: `npm.cmd run typecheck`, focused cockpit/D5 tests (`27/27`), and `npm.cmd run test:e2e`. Reviewer `Bohr` scored David `/credit` `4/5 PASS`, but all-persona reviewer `Bernoulli` reopened it at `3/5 FAIL`. Worker `Carver` then softened the alert, replaced the score/donut treatment with a release workbench, removed raw approval action IDs from display, and tightened Risk Mesh. Focused tests/typecheck/e2e passed; reviewer `Meitner` scored David `/credit` `4/5 PASS`.

Latest D5 implementation pass:

- Worker `Arendt` implemented `/credit/command` with scoped CSS-module styling and read-model wiring, then fixed a TypeScript CSS-module lookup issue after a timeboxed follow-up.
- The main agent added D5 to `tests/e2e/cockpit-premium-e2e.ts`, refreshed screenshots, normalized `Recoup` brand casing, widened the command rail, removed primary-nav truncation, and prevented top stat values from splitting awkwardly.
- Reviewer `Gibbs` scored the first D5 implementation `3/5 FAIL`, with blockers around primary truncation, uneven grid shape, and raw/proof strings in operator copy. A follow-up pass mapped internal states to operator labels, added explicit grid areas, stacked approval actions, tightened overflow, and allowed key feed/exposure cells to wrap.
- Reviewer `Beauvoir` still scored D5 `3/5 FAIL`, with blockers around Exposure board state clipping, prominent raw action IDs, and density. A second follow-up gave Exposure board full width, replaced prominent raw action IDs with `ARB-HARBOR-01/02`, and reduced the oversized arbitration lane.
- Verification passed: `npm.cmd run typecheck`, focused cockpit/D5 tests (`27/27`), and `npm.cmd run test:e2e`. Reviewer `Chandrasekhar` scored the refreshed route `4/5 PASS`, but all-persona reviewer `Bernoulli` reopened D5 at `3/5 FAIL`. A D5 worker timed out and was terminated; the main agent added a monitor tape, fixed a rejected CSS gradient, diagnosed a named-grid-area layout bug, replaced it with explicit grid placement, removed primary `Pending ERP`, and refreshed screenshots. Focused tests/typecheck/e2e passed; reviewer `Raman` scored D5 `/credit/command` `4/5 PASS`.

Latest CFO implementation pass:

- The bounded CFO pass rebuilt `/cfo` as a board-pack readout: report metadata, board metric ledger, model-backed AuditVerifyChip, audit proof posture table, dependency table, change ledger, AI insight, and provenance footer.
- Verification passed after remediation: `npm.cmd run typecheck`, focused cockpit tests (`26/26`), and `npm.cmd run test:e2e`.
- Reviewer `Averroes` scored the first CFO remediation `3/5 FAIL` because raw hashes/IDs and debug-like provenance labels were too visible, visual hierarchy was flat, and the audit area felt too nested.
- The follow-up removed primary raw hashes/IDs, shortened proof labels, mapped internal copy to CFO-facing language, tightened KPI hierarchy, and kept backend/read-model facts intact.
- Reviewer `Peirce` scored the refreshed CFO screenshot `4/5 PASS`; CFO visual gate is now closed.

Historical all-persona visual audit that opened this remediation:

- Reviewer `Descartes` used current `output/playwright/e2e/*-1440.png` screenshots.
- Scores: Maya `/forensics` `3/5 FAIL`, Maya `/run` `1/5 FAIL`, David `/credit` `2/5 FAIL`, CFO `/cfo` `2/5 FAIL`, David D5 `/credit/command` `1/5 FAIL / missing runtime route`.
- Later reviewer-scored remediation passes supersede these historical failures for Maya `/forensics`, Maya `/run`, David `/credit`, D5 `/credit/command`, and CFO `/cfo`.

Latest Maya remediation pass:

- Worker `Franklin` was closed after a useful wait window with no file movement; the main agent completed the bounded patch directly.
- Changed Maya `/forensics` to a separated pane system, made the worklist scenario-led with account/reason and evidence/status cells, moved AuditVerify above the dock, compacted the right rail/action inbox, restored source rail mode/summary/proof detail, and added a real DOM-based journey spine.
- Verification after the pass: `npm.cmd run typecheck` passed, focused cockpit tests passed (`26/26`), and `npm.cmd run test:e2e` passed with refreshed `output/playwright/e2e/maya-forensics-1440.png`.
- Focused reviewer `Aristotle` scored the refreshed Maya screenshot `4/5 PASS`.
- Residual polish from `Aristotle`: source rail remains compressed, worklist evidence/status can still clip, and center evidence rows still truncate some business values. These are not gate-blocking.

Latest Maya `/run` remediation pass:

- Stale worker `Mill` was terminated after exceeding a useful wait window. Follow-up worker `Hilbert` returned `BLOCKED` with a partial route patch; the main agent fixed the broken icon import, completed route-scoped CSS, humanized stream labels, tightened the grid, and preserved backend/read-model data ownership.
- Verification passed: `npm.cmd run typecheck`, focused route/auth/UI tests (`39/39`), and `npm.cmd run test:e2e`; screenshots refreshed under `output/playwright/e2e/`.
- Reviewer `Poincare` scored the refreshed `/run` screenshot `3/5 FAIL`.
- A second bounded pass fixed worklist clipping and reduced raw labels (`S3-*`, raw artifact IDs, `read-model entries`, and `approval held`), then refreshed screenshots again. Reviewer `Faraday` still scored `/run` `3/5 FAIL`: card-heavy hierarchy, implementation-facing run-log copy, unfinished Realtime/audit rail, and source rail setup/preflight copy remained blockers.
- Historical `/run` visual pass: worker `Feynman` was closed after a one-second stale wait while useful source/run-stream copy changes had already landed; the main agent flattened repeated bordered structures, rewrote Realtime/audit copy, restored source/e2e text contracts, and refreshed screenshots. Verification passed: `npm.cmd run typecheck`, focused cockpit/realtime/invariant tests (`39/39`), and `npm.cmd run test:e2e`. Reviewer `Curie` scored `/run` `4/5 PASS` at that checkpoint; latest desktop-only reviewer `Beauvoir the 2nd` later reopened `/run` at `3.7/5 FAIL`.

# Phase 5 — Frontend & UX Architecture

**Status:** Complete · **Mode:** static (code-level UX architecture; *visual* polish is Phase 6)
**Scope:** `cockpit/components/maya/query-evidence-dock.tsx`, `agent-trace-panel.tsx`, `cited-answer-card.tsx`, `maya-forensics-surface.tsx`, plus invariant tests `cockpit-no-business-logic.test.ts`, `maya-shadcn-boundary.test.ts`.

## Findings

| # | Item | Sev | Verdict | Evidence |
|---|---|---|---|---|
| 5.1 | Live execution states | C | ✅ Pass | Query dock publishes a `"connecting"` snapshot immediately ("Starting backend forensic query", `query-evidence-dock.tsx:161-167`); `AgentTracePanel` renders distinct running/answered/blocked/error states with icons (`agent-trace-panel.tsx:39-122`). Status region is `aria-live="polite"` (`:344`). Not a dead spinner. |
| 5.2 | Handoff visual cues | C | ✅ Pass | Trace panel renders a process map of nodes with `agentName` + `nextAgentName` (Forensics Investigator → Recovery Drafter), `handoff` node kind, and hook badges (`agent-trace-panel.tsx:244-301, 379-403`). Control shifts are visually explicit. |
| 5.3 | Active stream cancellation | H | ✅ Pass (auto-abort) | Full `AbortController` lifecycle: aborts on dock close, on evidence-identity change, on unmount, and when a new query supersedes the old (`query-evidence-dock.tsx:52, 81-121, 150-159, 179`). Note: abort is automatic; there is no dedicated in-run "Stop" button (run button disables while running). |
| 5.4 | Frontend owns no business truth | H | ✅ Pass | Answer only renders if it has citations **within selected scope** + deterministic basis + recordIds (`:71-78, 434-486`, `citationsWithinSelectedScope`). No client-side amounts/verdicts. Enforced by `cockpit-no-business-logic.test.ts`. |
| 5.5 | Optimistic message delivery | M | ✅ Pass | Submitted question renders instantly as a "You" bubble (`:333-343`) and a connecting state publishes before the network resolves. |
| 5.6 | Citation parity in UI | M | ✅ Pass | Citations rendered with `deterministicBasis` tooltips (`:350-356`); answer gated on cited records; trace rows show record IDs + basis (`agent-trace-panel.tsx:179-221`). |
| 5.7 | Accessibility | M | ✅ Pass (strong) | `useId` for field/status/help ids, `aria-describedby`, `aria-live`, `aria-label` throughout, `htmlFor`/`id` pairing, decorative icons `aria-hidden`. Well above hackathon norm. |

## Detailed notes

### Standout strengths
- **Race-condition-safe streaming UI.** `sessionTokenRef` + `isCurrentSession` + `publishForToken` ensure a stale/late response can never overwrite a newer query's UI (`:123-134`). This is the kind of correctness bug most teams ship; here it's handled deliberately.
- **The frontend actively *defends* the governance model.** `toQueryEvidenceSnapshot` re-checks that every citation is within the selected evidence scope and downgrades to `"blocked"` if not (`:443-485`). The UI refuses to display an answer the backend didn't cite correctly — a second line of defense behind the backend guard.
- **Backend-driven trace, not fabricated.** The agent process map is built from backend `response.trace` events and evidence-pack provenance, with a clearly-labeled *fallback* set only when no trace exists (`:267-289`). This satisfies the "Agent Trace tab must be nonblank before and after a query, using backend/source-backed events" requirement.
- **Optimistic + live states** together implement two separate checklist items cleanly.

### Gaps & proposed actions

**5.3 — Add an explicit in-run "Stop" control [Low].**
> **Proposed action:** While `isRunning`, swap the disabled "Run query" button for a "Stop" button that calls `closeActiveSession({ forceClear: true })` (which already aborts). The abort plumbing exists; only the affordance is missing.
> **Expert citation:** The source checklist and SDK streaming guidance call for "a frontend client-side Stop button [that] triggers an AbortController to close network streams and signal the backend to kill execution" ([OpenAI Agents SDK — streaming](https://openai.github.io/openai-agents-js/)). The backend already honors abort (Phase 4.1), so this is a pure UI add.

**5.x — Virtual list for long traces [Low, see Phase 6/7].**
> **Proposed action:** If a forensic run can produce dozens–hundreds of trace rows, virtualize the trace `Table`/process map (e.g. `@tanstack/react-virtual`) to protect frame rate and memory.
> **Expert citation:** The source checklist's "Virtual List Performance" item; long traced conversations should be DOM-virtualized to prevent memory leaks and frame drops. (General React performance best practice — [TrueFoundry on agent UI scale](https://www.truefoundry.com/blog/multi-agent-architecture).)

## Phase 5 score

- Pass: 7/7 (both critical items pass).
- Gaps: 0. Two **Low** enhancements (explicit Stop button, list virtualization).

**Verdict:** The UX *architecture* is excellent — correct, accessible, governance-defending, and streaming-aware. Whether it *looks* premium is judged separately in Phase 6.

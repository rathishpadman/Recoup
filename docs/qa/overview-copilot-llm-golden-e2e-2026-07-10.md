# Overview Copilot LLM Golden E2E Matrix - 2026-07-10

Purpose: prevent the recent Maya/David overview Copilot regressions from passing as "visually loaded" while final answers are deterministic-only, unavailable, unreadable, or outside the selected evidence scope.

## Golden Dataset

The executable golden assertions live in `tests/helpers/llm-query-golden.ts`.

| Scenario | Prompt | Required answer content | Required execution proof | Forbidden |
|---|---|---|---|---|
| Maya overview workspace invalid-deduction query | `Which customers are having invalid deductions?` | `Crestline Grocery`, `ValuMart Club`, `Harbor Foods`, `4 invalid cases`, `3 customers` | Final `modelExecution.mode = live_openai_agents`, `rawModelTextPolicy = suppressed`, citations present, trace present, token usage present in real browser/provider runs | Raw SQL/write patterns, final `unavailable`, final `blocked_live_agent_trace`, out-of-scope citations |
| Maya selected-evidence text query | Existing case prompt chips such as Harbor partial-recovery evidence | Answer stays scoped to the selected case packet after case switch; selected prompt text is preserved | `query.answer` trace/tool proof, selected line and cited record IDs match the case evidence packet | Workspace-scope leakage, stale selected line, cited records outside selected packet |
| Maya selected-evidence voice query | Same selected case question by voice | Same cited answer quality as text path; readable answer, citations, trace details | Realtime bridge/tool proof, scoped cited records, no final `Model execution · unavailable` | Silent fallback to offline/demo-only mode, out-of-scope citations |
| David overview/account credit query | `Which account should I open first and why?` or selected account risk question | Selected account customer name and `<verdict> risk` | Final `modelExecution.mode = live_openai_agents`, agent names, handoff count, token usage, `credit_risk.answer` trace, citations | Raw SQL/write patterns, missing token usage, raw model output |
| David negotiation/email query | Harbor negotiation prompt and live email round-trip | Harbor order context, governed draft-only status, approval/email send status where applicable | Credit negotiation trace/source proof and HITL approval state | Email dispatch without approval, model-computed dollars |

## Browser Test Steps

1. Local Maya overview: log in as Maya, open `/forensics/shadcn`, open Recoup Copilot from the overview, submit the Maya golden workspace prompt, wait for the final assistant response, then compare UI text and route response against the golden dataset.
2. Local Maya selected prompt: from overview Copilot, click the Harbor prompt, confirm the prompt text survives the case switch, run it, and confirm selected packet citations only.
3. Local Maya voice: open a selected case packet, click Voice, ask the same evidence question, and confirm final state is not `unavailable`.
4. Local David overview/account: log in as David, open `/credit`, run the default/general Copilot query and one selected account query, then compare against the David golden checks.
5. Local David negotiation: reset Harbor communication if needed, run draft/approval/send flow only through governed controls, and confirm no email send occurs before approval.
6. Repeat the same paths on the production alias after local `lint`, `typecheck`, unit/e2e tests, and browser checks pass.

## Response Quality Rubric

- The answer must be understandable without reading raw record IDs first.
- Business names, verdicts, and counts must be visible when the prompt asks for them.
- Citations and trace details must remain available for audit.
- Raw model output, secrets, API keys, and SQL/write operations must not be exposed.
- Model-driven text can explain and summarize; code/backend read models own every dollar, count, verdict, threshold, route, and action packet.

## Production Smoke Evidence To Capture

- Public alias and deployment identifiers.
- Maya overview query request body contains `scope: "workspace"` and the current `settlementRunId`.
- Maya final UI contains `Model execution · live_openai_agents`, not `unavailable`.
- David final UI contains live model execution metadata and token usage.
- Render/Vercel logs show no query-route 4xx/5xx for the tested requests.
- Voice query either passes with Realtime proof or is explicitly marked blocked with the exact provider/browser reason before sign-off.

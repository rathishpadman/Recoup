# Feeding Recoup v2 / O2C Design System v3.1 to Codex — Developer Handoff

This is the machine-readable UI handoff for building the **Recoup Revenue-Integrity Cockpit** with OpenAI Codex.

```
repo root
├─ tokens.json                         ← structured design tokens
├─ tokens.css                          ← CSS custom properties, light-first + scoped dark
├─ O2C_Collections_Design_System_v3.md ← full written design spec
├─ O2C Design System v3.1.dc.html      ← visual showcase / QA reference
├─ RECONCILIATION_LEDGER.md            ← canonical business facts and gold set
├─ INVARIANTS.md                       ← release-blocking contract
├─ Recoup_v2_SDD.md                    ← technical architecture
└─ codex-handoff.md                    ← this file
```

## 1. Recommended frontend stack

- **Next.js App Router + React + TypeScript**
- **Tailwind CSS** mapped to `tokens.json`, with `tokens.css` imported once at the app root
- **Vercel AI SDK** for streamed agent/chat UI where useful
- **Radix UI** primitives for accessible drawer/dialog/menu/tooltip
- **TanStack Table** for virtualized worklists
- **Recharts** or **visx** for DSO, leakage, aging, and forecast charts
- **Phosphor Icons** (`@phosphor-icons/react`), regular weight
- Fonts: `Newsreader`, `IBM Plex Sans`, `IBM Plex Mono`

Next.js is canonical for the Recoup cockpit. Vite may be used only for an isolated token/showcase sandbox, not for the production hackathon app.

## 2. Wire the tokens first

1. Copy `tokens.css` into the Next.js app and import it once in `app/layout.tsx` or the root global CSS.
2. Map `tokens.json` into `tailwind.config.ts` (`theme.extend.colors`, `fontFamily`, `spacing`, `borderRadius`, `boxShadow`).
3. Reference variables everywhere: `background: var(--bg-surface)`, `color: var(--text-primary)`, etc.
4. Dark mode: set `data-theme="dark"` **only** on a monitoring-dashboard root, never on `<html>`.
5. Do not invent colors, fonts, spacing, radii, shadows, or status colors.

## 3. Kickoff prompt

> You are building **Recoup — Revenue-Integrity Cockpit**, an agentic Order-to-Cash product for CPG deduction recovery, credit arbitration, and CFO visibility.
>
> Read these files first, in this order: `AGENTS.md`, `INVARIANTS.md`, `RECONCILIATION_LEDGER.md` §4, `Recoup_v2_SDD.md` §11, `O2C_Collections_Design_System_v3.md`, `tokens.json`, and `tokens.css`.
>
> Stack: Next.js App Router + React + TypeScript + Tailwind mapped from `tokens.json` + Vercel AI SDK + Radix UI + TanStack Table + Recharts + @phosphor-icons/react.
>
> Build exactly three surfaces for R1: **Maya Forensics cockpit**, **David Credit/Arbitration cockpit**, and **read-only CFO summary**. O2C-lead and Audit views are deferred/light.
>
> Non-negotiable product rules: no model-computed dollars, no production ERP write-back, no autonomous external action, HITL for every external action, every decision cites records and deterministic basis, and gold-set parity must remain 20 lines / $112,400; valid 7 / $32,600; recovery 13 / $79,800.
>
> Non-negotiable design rules: use tokens only; light-first; dark theme only for monitoring; amounts/IDs use IBM Plex Mono with tabular numerals; status = color + icon + text; no uppercase letter-spaced eyebrow labels; no AI purple/pink gradients; visible focus rings; reduced-motion support.

## 4. Recoup UI build order

1. **App shell** — role-aware nav for Forensics, Credit/Arbitration, CFO Summary; token wiring; responsive frame.
2. **Component primitives** — Button, StatusChip, KpiCard, Table, EvidenceDrawer, ApprovalInboxItem, RiskScore, NextBestActionPanel, Timeline, AuditTrail, Toast.
3. **Maya Forensics cockpit** — 8 scenario cards from S1–S8, ranked queue, valid/recovery totals, evidence dossier, verdict/confidence, draft recovery/Billing packets, approve/modify/reject.
4. **Evidence + HITL drawer** — POD/contract/TPM evidence tabs, record IDs, deterministic basis, amount clamp, draft-only action preview, immutable audit preview.
5. **David Credit/Arbitration cockpit** — Harbor risk drift, DSO 32→51, over-limit $640K order, partial-hold score 51.25 → 55%, ranked Risk Mesh options, draft revised terms.
6. **CFO summary** — read-only gross-to-net, margin protected, recovered/in-flight/projected-prevented leakage, DSO/CEI, what-changed narrative, cited drill-down.
7. **Conversational query surface** — text first, optional voice; answers with cited evidence from the same records shown in the cockpit.
8. **States everywhere** — loading, empty, filtered-empty, error, permission, low-confidence/escalation states.

## 5. Guardrails to repeat to Codex

- Use tokens only; flag undefined values instead of guessing.
- Use tool/service guardrails around every decision-producing and action-producing function tool, not only agent-level input/output guardrails.
- Preserve worklist filters/sort/scroll/selection across navigation.
- Every chart needs a data-table fallback and keyboard-accessible tooltips.
- Every AI suggestion/risk score must show reason codes and source records.
- Drafts are drafts: no autonomous send, no ERP mutation path, no hidden execution button.

## 6. OpenAI UI affordances for judging criterion #4

- **Streamed agent progress** → SSE/Vercel AI SDK event stream renders retrieval, rule checks, verdicts, handoffs, and HITL pauses.
- **Evidence-backed drafting** → model drafts recovery/Billing correspondence, always editable and HITL-gated.
- **Risk explanation** → model summarizes deterministic R-score/partial-hold factors; the code-computed score remains visible.
- **Conversational query** → answers CFO/Maya/David questions with cited record IDs and audit links.

Keep the reasoning visible in the UI. The winning demo should feel like a governed finance product, not a chatbot beside a dashboard.

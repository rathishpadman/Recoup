# Recoup Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a public Recoup `/` landing page that helps judges understand the product, evidence model, OpenAI usage, and demo roles quickly, then enter the existing Maya or David cockpit flows.

**Architecture:** Keep the landing page in the Next.js cockpit app. Make `/` public, keep all product workspaces protected, use shadcn primitives, and keep all operational data claims out of the landing page unless they are sourced from existing backend/read-model paths. Treat market claims as editorial content with visible citations, not product decisions or cockpit facts.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind, shadcn/ui, lucide-react, existing `tokens.css`, Vitest, Playwright, ImageGen CLI for visual north-star mockup.

---

## 0. Target And Branch Contract

- Target source of truth: `origin/main`.
- Target commit observed when this plan was created: `8edfed649e53b24306aa6090c3b18ef061f357e0`.
- Target worktree: `C:\Users\rathi\.config\superpowers\worktrees\Recoup\recoup-landing-page`.
- Target branch: `codex/recoup-landing-page`.
- Current status at plan creation: clean branch except this untracked plan file.
- Original dirty checkout is not the implementation target.
- Do not edit `C:\Rathish\Root Folder\CFO\Hackathon\Recoup1\Recoup` for this landing page work.

Branch proof commands:

```powershell
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/main
```

Expected before implementation:

```text
## codex/recoup-landing-page...origin/main
HEAD == 8edfed649e53b24306aa6090c3b18ef061f357e0 or a later approved origin/main-derived commit
```

Stop if:

- Branch is not `codex/recoup-landing-page`.
- Worktree is dirty with unrelated files.
- `origin/main` has moved and the user has not approved rebasing or recreating from the newer commit.
- The original dirty checkout is accidentally being edited.

## 1. Why This Plan Replaces The Short Version

The first corrected file was too compressed. It captured the right direction, but it did not fully preserve the rough landing brief's coverage or provide enough execution detail for a fresh implementer.

This expanded plan keeps the useful parts of the rough file:

- Public `/` route.
- Judge-first hero.
- Tabs instead of a long marketing scroll.
- Maya and David entry points.
- Technology and OpenAI usage.
- Build methodology proof.
- Analyst/source references.
- ImageGen mockup before code.

It changes the unsafe parts:

- Unsupported public statistics are not copied blindly.
- Login persona query-prefill is not assumed if it conflicts with existing login invariants.
- The page is shadcn-first, not a custom React-only surface.
- The design follows `AGENTS.md` anti-slop rules.
- The implementation is tests-first and branch-aligned to `origin/main`.

## 2. Governing Sources

Read these before implementation:

- `AGENTS.md`
- `INVARIANTS.md`
- `README.md`
- `config/models.ts`
- `config/cockpitDemoProfiles.ts`
- `src/types/entities.ts`
- `cockpit/app/page.tsx`
- `cockpit/app/login/page.tsx`
- `cockpit/app/login/login-form.tsx`
- `cockpit/components/ui/tabs.tsx`
- `cockpit/components/ui/button.tsx`
- `cockpit/components/ui/badge.tsx`
- `cockpit/components/ui/tooltip.tsx`
- `cockpit/components/ui/table.tsx`
- `tests/invariants/cockpit-route-architecture.test.ts`
- `tests/invariants/cockpit-no-business-logic.test.ts`
- `tests/e2e/cockpit-premium-e2e.ts`

Do not read the full SDD unless a direct conflict requires it. If a conflict appears, stop and ask.

## 3. Non-Authoritative Input

Rough input:

- `docs/landing-page-plan.md` from the original dirty checkout.

The rough file is useful for intent, not truth. It is not current source of truth and includes claims that must be verified or removed.

Use it for:

- Overall landing page purpose.
- Tabbed public page direction.
- Demo role framing.
- OpenAI and governance story.
- Candidate analyst references.

Do not blindly use it for:

- Exact statistic values.
- APQC DSO/backlog wording.
- RVCF invalid-claims numbers.
- Attain manual-cost numbers.
- Any "all screens fully functional, not mocked" wording unless backed by current code/test evidence.
- Any model/provider claim not found in `config/models.ts`, `README.md`, or current implementation.

## 4. Success Check

Success means:

- A full plan exists at this file path.
- ImageGen CLI mockup is generated under `mockups/imagegen/`.
- User approves the mockup before implementation.
- `/` becomes public landing page.
- Protected cockpit routes remain protected.
- shadcn primitives are used for tabs, buttons, badges/tooltips, and tables.
- Browser E2E covers `/` as anonymous.
- `npm.cmd run verify` passes.
- `git diff --check` passes.
- Closeout lists source claims kept, changed, and removed.

## 5. Public Page Design Direction

Design style:

- Enterprise finance.
- Light neutral canvas.
- Editorial but dense.
- Source-labeled.
- Table-led where precision matters.
- No generic marketing fluff.
- No decorative hero image requirement.
- No fake dashboard preview.

Tone:

- Confident.
- Specific.
- Evidence-first.
- Clear about HITL and no ERP write-back.
- Not "AI magic".
- Not "autonomous finance".

Core message:

```text
Recoup is a governed Order-to-Cash recovery cockpit.
Agents help find, explain, and draft.
Code computes.
Humans approve.
Every decision cites evidence.
```

## 6. Recommended Information Architecture

Use five tabs:

1. Problem
2. How Recoup Works
3. Demo Roles
4. Tech Spine
5. Build Proof

Why five instead of six:

- The rough "About" tab is thin and can fold into Build Proof.
- A single-viewport tab design should avoid too many navigation targets.
- Judges need the product story, demo entry, architecture, and proof faster than a conventional landing site.

Default tab:

- `Problem`

Header actions:

- `Login`
- `Enter as Maya`
- `Enter as David`

CTA rule:

- If persona query-prefill is approved and passes invariants, use `/login?persona=maya` and `/login?persona=david`.
- If query-prefill conflicts with login invariants, use `/login` for both CTAs and keep persona choice in user-entered login ID.

## 7. Desktop ASCII Mockup

```text
+----------------------------------------------------------------------------------+
| Recoup                                      Evidence-backed O2C recovery   Login  |
+----------------------------------------------------------------------------------+
| O2C leakage is not a dashboard problem. It is an evidence problem.                |
| Governed agents triage deductions, cite records, draft actions, and stop at       |
| human approval. Code computes every dollar.                                       |
|                                                                                  |
| [Enter as Maya] [Enter as David]     Source labels: McKinsey | UpClear | APQC     |
+-------------+-------------------+-------------+-------------+--------------------+
| Problem     | How Recoup Works  | Demo Roles  | Tech Spine  | Build Proof        |
+-------------+-------------------+-------------+-------------+--------------------+
| Problem                                                                          |
|                                                                                  |
|  O2C leakage                          Invalid deduction recovery                 |
|  McKinsey-sourced claim               McKinsey / UpClear sourced claim           |
|                                                                                  |
|  Why teams miss recovery                                                        |
|  - Evidence is split across SAP, docs, TPM, 3PL, and bureau context.             |
|  - Manual review cannot keep pace with deduction volume.                         |
|  - Ungoverned automation is not acceptable for finance action.                   |
|                                                                                  |
|  Evidence strip                                                                  |
|  Each public claim on this page carries a visible source label.                  |
+----------------------------------------------------------------------------------+
```

## 8. How Recoup Works ASCII Mockup

```text
+----------------------------------------------------------------------------------+
| How Recoup Works                                                                 |
+----------------------------------------------------------------------------------+
| Evidence in        Agent forensics       Human gate          Audit trail          |
| SAP/docs/TPM       GPT-5.5 + tools       proposer != approver hash chain          |
| 3PL/bureau         Zod guardrails        no autonomous send  replayable           |
+----------------------------------------------------------------------------------+
| Governance principles                                                            |
| [Code computes dollars] [Record IDs required] [Read-only ERP] [Draft-only actions]|
+----------------------------------------------------------------------------------+
```

## 9. Demo Roles ASCII Mockup

```text
+---------------------------------------+------------------------------------------+
| Maya Patel                            | David Kim                                |
| Senior Deductions Analyst             | Credit and Collections Lead              |
+---------------------------------------+------------------------------------------+
| Reviews deduction worklist            | Reviews account exposure                 |
| Opens evidence dossier                | Reviews risk mesh arbitration            |
| Asks cited query questions            | Sees partial-hold recommendation         |
| Stages recovery/billing drafts        | Approves or rejects governed proposals   |
|                                       |                                          |
| [Enter as Maya]                       | [Enter as David]                         |
+---------------------------------------+------------------------------------------+
```

## 10. Tech Spine ASCII Mockup

```text
+----------------------------+-----------------------------------------------------+
| Layer                      | Implementation                                      |
+----------------------------+-----------------------------------------------------+
| Frontend                   | Next.js, React, TypeScript, shadcn/ui               |
| Agent runtime              | OpenAI Agents SDK, pinned models from config        |
| Realtime                   | gpt-realtime-2 behind server-issued client secret   |
| Tool boundary              | Zod-validated whitelisted service tools             |
| Money math                 | decimal.js in deterministic core only               |
| Source connectors          | read-only ports, SAP no write path                  |
| Audit                      | hash-chained trail                                  |
| Verification               | Vitest, Playwright, dependency-cruiser, eval gates  |
+----------------------------+-----------------------------------------------------+
```

## 11. Mobile ASCII Mockup

```text
+--------------------------------------+
| Recoup                         Login |
| Evidence-backed O2C recovery         |
+--------------------------------------+
| O2C leakage is an evidence problem.  |
| Code computes. Humans approve.       |
|                                      |
| [Enter as Maya]                      |
| [Enter as David]                     |
+--------------------------------------+
| Problem | Works | Roles | Tech | ... |
+--------------------------------------+
| Problem                              |
| O2C leakage                          |
| Source: McKinsey                     |
|                                      |
| Why teams miss recovery              |
| - Split evidence                     |
| - Manual review volume               |
| - Ungoverned automation risk         |
+--------------------------------------+
```

## 12. Visual Rules

Required:

- Use existing `bg-background`, `text-foreground`, `border-border`, `muted`, `card` tokens.
- Use `font-[var(--font-editorial)]` for the main hero only.
- Use IBM Plex Sans for most labels and body.
- Use `font-mono` only for model IDs, audit labels, and technical IDs.
- Use lucide-react icons only when an icon improves scanning.
- Keep icons small and inline.
- Keep card radius at 8px or less.
- Keep layout dense at desktop.
- Use visible source labels.
- Use tooltips for source detail where useful.

Avoid:

- Gradients.
- Radial backgrounds.
- Orbs.
- Blob decoration.
- Glassmorphism.
- `uppercase`.
- `tracking-wide`, `tracking-wider`, `tracking-widest`.
- `transition-all`.
- Emoji icons.
- Fake stats.
- Fake dashboard screenshots.
- "AI-powered" badge without value.
- Nested cards.
- Long scroll hero page.
- Purple/blue gradient SaaS look.

## 13. Shadcn Component Mapping

Use shadcn:

- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` for core layout.
- `Button` for Login, Enter as Maya, Enter as David.
- `Badge` for source labels and governance chips.
- `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` for source explanations.
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` for tech spine and build proof.
- `Separator` for header/content dividers if needed.
- `ScrollArea` only if tab content must fit fixed panel height.
- `Select` only if mobile tabs cannot remain readable as horizontal triggers.

Do not use:

- Custom tab implementation.
- Custom tooltip implementation.
- Custom table markup where shadcn `Table` works.
- New component library.
- Inline raw SVG for icons when lucide has an equivalent.

## 14. Source Claim Disposition Matrix

| Rough claim | Action | Reason |
|---|---|---|
| CPG manufacturers lose 2-5% of gross revenue to deductions | Verify before use | Keep only if primary or credible source is found |
| O2C leakages amount to 3-5% of EBITDA | Keep if McKinsey page/PDF verifies | Primary McKinsey source candidate |
| AI-backed tools recaptured 10-15% of invalid credit memo value | Keep if McKinsey page/PDF verifies | Primary McKinsey source candidate |
| 65-80% of shortage claims are invalid | Do not use until source verified | Rough file cites RVCF without link |
| 60% recover less than half of what they dispute | Verify before use | UpClear 2026 candidate |
| Deduction backlogs inflate DSO by 10-20 days | Remove by default | Rough APQC source does not obviously support this exact claim |
| Each extra day = 1.4M in trapped capital per 500M revenue | Remove by default | Derived math and not needed for page |
| 30-50 admin cost per deduction | Do not use until source verified | Rough file cites Attain without primary link |
| Structured process recovers 0.60-0.80 per invalid dollar | Do not use until source verified | Avoid too many external claims |

Implementation rule:

- If source is not verified, omit the statistic.
- Do not replace omitted stats with invented alternatives.
- Do not compute derived public financial claims in the UI.

## 15. Copy Draft - Hero

Hero heading:

```text
O2C leakage is not a dashboard problem. It is an evidence problem.
```

Hero body:

```text
Recoup is a governed Order-to-Cash recovery cockpit. Agents help investigate deductions, cite records, draft next actions, and stop at human approval.
```

Support line:

```text
Code computes every dollar. Decisions cite evidence. Humans approve external action.
```

Primary CTAs:

- `Enter as Maya`
- `Enter as David`

Secondary CTA:

- `Login`

Source strip:

- `McKinsey`
- `UpClear`
- `APQC`
- `README proof pack`

## 16. Copy Draft - Problem Tab

Tab title:

```text
The leak is hidden in evidence spread.
```

Use two or three sourced facts maximum.

Potential fact cards:

- `O2C leakage`: McKinsey source label.
- `Invalid recovery opportunity`: McKinsey or UpClear source label.
- `O2C operating benchmark`: APQC source label.

Failure modes:

- Evidence is split across SAP, documents, TPM records, remittance, and credit context.
- Manual triage cannot keep pace with volume.
- Ungoverned automation is unacceptable for finance actions.

Do not show:

- Static NorthBay dollar values.
- Seed-set totals.
- APQC DSO 10-20 day claim.
- Unverified RVCF/Attain numbers.

## 17. Copy Draft - How Recoup Works Tab

Tab title:

```text
A governed recovery path, not autonomous finance.
```

Pipeline:

1. Evidence ingestion
2. Agent forensics
3. Human approval gate
4. Immutable audit trail

Principle chips:

- `Code computes dollars`
- `Record IDs required`
- `Read-only ERP`
- `Draft-only actions`
- `Proposer != approver`
- `Hash-chained audit`

Text:

```text
Recoup keeps agents at the investigation and drafting boundary. The deterministic core computes amounts and scores. The service layer enforces tool guardrails. The approval layer stops every external action for human review.
```

## 18. Copy Draft - Demo Roles Tab

Tab title:

```text
Two operating roles. One governed cockpit.
```

Maya block:

- Senior Deductions Analyst.
- Reviews the deduction worklist.
- Opens evidence dossiers.
- Asks cited questions in the query dock.
- Stages recovery or billing-prevention drafts.
- Does not send external action without approval.

David block:

- Credit and Collections Lead.
- Reviews account exposure.
- Reads Risk Mesh arbitration.
- Reviews partial-hold proposals.
- Approves or rejects governed actions.
- Does not receive fake/source-unlabeled values.

CTA behavior:

- `Enter as Maya` routes to approved login target.
- `Enter as David` routes to approved login target.

## 19. Copy Draft - Tech Spine Tab

Tab title:

```text
Production-grade control points in a hackathon build.
```

Use shadcn `Table`.

Rows:

- Frontend: Next.js, React, TypeScript, shadcn/ui.
- Runtime: Node 22, TypeScript modular monolith.
- Agent SDK: OpenAI Agents SDK TypeScript.
- Models: `config/models.ts` pinned runtime model IDs.
- Realtime: `gpt-realtime-2` behind server-issued client-secret route.
- Tools: Zod-validated whitelist.
- Money math: `decimal.js` in deterministic core only.
- Sources: read-only source ports; SAP no write path.
- Audit: hash-chained trail.
- Verification: Vitest, Playwright, dependency-cruiser, release gates.

Do not claim:

- Hosted evals if repo uses local eval harness.
- Fine-tuned models.
- ERP write-back.
- Autonomous action.

## 20. Copy Draft - Build Proof Tab

Tab title:

```text
Built like the runtime is governed.
```

Use three sections:

1. Repo contract
2. OpenAI usage
3. Judge evidence

Repo contract bullets:

- `AGENTS.md` plan-first protocol.
- `INVARIANTS.md` release blockers.
- Claim to code to test traceability in README.
- `npm.cmd run verify` as proof gate.

OpenAI usage bullets:

- Agents SDK for role-specific agents.
- Realtime for guarded voice/text query.
- MCP surface for whitelisted tools.
- Pinned models from config.
- No model-computed dollar amount reaches findings or decisions.

Judge evidence bullets:

- README proof pack.
- Independent audit log.
- Browser E2E screenshots.
- Source-labeled cockpit surfaces.

NorthBay scope:

```text
NorthBay Brands is the synthetic demo company. The data is synthetic; the governance contract, source ports, approval gates, audit trail, and tests are real repo behavior.
```

## 21. Accessibility Requirements

Required:

- One `h1`.
- Tab triggers have clear names.
- Buttons are links or buttons with correct semantics.
- Source links have descriptive text.
- Tooltips are supplemental, not the only location for critical source names.
- Focus rings remain visible.
- Color is not the only signal.
- Touch targets are at least 44px high on mobile.
- Text wraps without overlap at 375px.
- No horizontal body scroll.

## 22. Responsive Requirements

Breakpoints to inspect:

- 375 x 812
- 768 x 1024
- 1024 x 768
- 1440 x 900

Desktop:

- Max width should use existing app rhythm, not centered marketing whitespace.
- Header height compact.
- Hero concise.
- Tabs immediately visible.
- Problem tab fits mostly above fold.

Tablet:

- Hero and CTAs wrap cleanly.
- Tab labels remain visible.
- Tables do not overflow body.

Mobile:

- Header brand and Login fit.
- CTAs stack.
- Tabs horizontally scroll or become select.
- Tables use compact rows or horizontal scroll inside a controlled region.
- No overlapping text or clipped buttons.

## 23. ImageGen CLI Mockup Plan

User requested ImageGen API CLI mockup before implementation.

Mode:

- Use ImageGen CLI fallback script.
- Do not ask user to paste key.
- Check `OPENAI_API_KEY` presence only.
- Save output under `mockups/imagegen/`.

Preflight:

```powershell
Set-Location "C:\Users\rathi\.config\superpowers\worktrees\Recoup\recoup-landing-page"
if (-not $env:OPENAI_API_KEY) { throw "OPENAI_API_KEY is not set in this shell." }
New-Item -ItemType Directory -Force -Path "mockups\imagegen"
```

Generate:

```powershell
python "$env:CODEX_HOME\skills\.system\imagegen\scripts\image_gen.py" generate `
  --model gpt-image-2 `
  --quality low `
  --size 1536x1024 `
  --out "mockups\imagegen\recoup-landing-page-v1.png" `
  --prompt "Use case: ui-mockup. Asset type: Recoup public landing page visual north star. Primary request: premium B2B SaaS landing page for an evidence-backed Order-to-Cash recovery cockpit. Layout: compact fixed header, editorial hero, source strip, five-tab shadcn-style navigation, dense tab content area, Maya and David CTA buttons. Style: light neutral enterprise finance UI using IBM Plex Sans and Newsreader feel, tokenized surfaces, crisp dividers, compact badges, restrained table-led sections. Content: Recoup, O2C leakage is an evidence problem, Code computes every dollar, Humans approve, Enter as Maya, Enter as David, McKinsey, UpClear, APQC. Constraints: no fake dashboard screenshots, no invented data tables, no stock photo, no purple gradients, no blobs, no glassmorphism, no all-caps tracked labels, no emoji, no watermark."
```

Validation checklist:

- Page looks like enterprise finance, not generic SaaS.
- Header, hero, source strip, and tabs are visible.
- Maya and David CTAs are visible.
- No fake numbers or fake charts appear.
- No purple gradient or glassmorphism.
- No decorative blobs.
- No text overlap.
- No watermark.

If bad:

```powershell
python "$env:CODEX_HOME\skills\.system\imagegen\scripts\image_gen.py" generate `
  --model gpt-image-2 `
  --quality low `
  --size 1536x1024 `
  --out "mockups\imagegen\recoup-landing-page-v2.png" `
  --prompt "Revise the Recoup landing page mockup into a stricter enterprise finance command surface. Remove any decorative gradients, fake charts, fake metrics, photo backgrounds, oversized cards, and marketing filler. Make it dense, source-labeled, shadcn-style, light neutral, table-led, and audit credible. Keep the five tabs, compact header, evidence-first hero, source strip, Maya CTA, and David CTA."
```

Stop:

- Show the image to the user.
- Wait for visual approval before coding.

## 24. Implementation File Map

Primary implementation:

- `cockpit/app/page.tsx`

Expected tests:

- `tests/invariants/cockpit-route-architecture.test.ts`
- `tests/invariants/cockpit-no-business-logic.test.ts`
- `tests/e2e/cockpit-premium-e2e.ts`

Optional support file:

- `cockpit/app/landing-page-content.ts`

Only create the support file if:

- `page.tsx` becomes too large to review.
- Content arrays are clearer outside the JSX.
- Invariant tests can still validate root content.

Optional login files:

- `cockpit/app/login/page.tsx`
- `cockpit/app/login/login-form.tsx`

Only touch login if:

- User approves persona query-prefill.
- Existing invariants are updated narrowly.
- No visible persona picker is reintroduced.

Do not touch:

- `src/core`
- `src/agents`
- `src/services`
- `datagen`
- `evals`
- `audit/trail.ts`
- `config/weights.ts`
- `config/thresholds.ts`
- dependency manifests

## 25. Current Main-Derived Code Observations

Observed in clean worktree:

- `cockpit/app/page.tsx` currently imports `redirect` and `requireDemoSession`.
- Root `/` currently redirects to `session.defaultRoute`.
- `cockpit/app/login/page.tsx` reads only `error` from `searchParams`.
- `cockpit/app/login/login-form.tsx` expects user-entered login ID.
- shadcn `Tabs` exists.
- shadcn `Button`, `Badge`, `Tooltip`, `Table`, `ScrollArea`, `Select`, and `Separator` exist.

Implication:

- Root route tests must change first.
- Login query-prefill is a real contract change, not a styling change.
- Prefer CTA to `/login` unless user explicitly wants query-prefill and accepts invariant update.

## 26. Task 1 - Branch And Baseline Verification

Files:

- No edits.

Steps:

- [ ] Run branch proof.

```powershell
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git rev-parse origin/main
```

- [ ] Confirm current branch is `codex/recoup-landing-page`.
- [ ] Confirm worktree is clean except approved plan/mockup artifacts.
- [ ] Confirm Node dependencies are available.

```powershell
Test-Path -LiteralPath "node_modules"
npm.cmd --version
node --version
```

- [ ] If dependencies are missing, run:

```powershell
npm.cmd install
```

- [ ] Run a narrow baseline test before editing:

```powershell
npm.cmd run test -- tests/invariants/cockpit-route-architecture.test.ts tests/invariants/cockpit-no-business-logic.test.ts
```

Expected:

- Tests pass before edits on main-derived branch.
- If tests fail before edits, report baseline failure and ask before proceeding.

## 27. Task 2 - Source Verification And Content Lock

Files:

- Create or update: `docs/superpowers/plans/2026-06-29-recoup-landing-page.md` if source disposition changes.

Steps:

- [ ] Verify McKinsey HTML page.
- [ ] Verify McKinsey PDF if HTML is insufficient.
- [ ] Verify UpClear 2026 page if retained.
- [ ] Verify APQC page if retained.
- [ ] Save only source URLs in the plan, not long copied text.
- [ ] Create a final retained claims list.
- [ ] Create a removed claims list.

Retained claim format:

```text
Claim:
Visible source label:
URL:
Where it appears:
```

Removed claim format:

```text
Claim:
Reason removed:
Original rough source:
```

Success check:

- Every public statistic in the intended landing page has a source.
- Unsupported APQC DSO claim is absent unless newly verified.
- No public claim is derived by Codex arithmetic.

## 28. Task 3 - Generate ImageGen Mockup

Files:

- Create: `mockups/imagegen/recoup-landing-page-v1.png`
- Possibly create: `mockups/imagegen/recoup-landing-page-v2.png`

Steps:

- [ ] Check `OPENAI_API_KEY` presence.
- [ ] Create `mockups/imagegen`.
- [ ] Run the CLI command in section 23.
- [ ] Inspect the generated image.
- [ ] If needed, regenerate once.
- [ ] Show the image to the user.
- [ ] Stop and wait for approval.

Do not:

- Implement code before image approval.
- Commit mockup if user rejects it and asks for a different direction.
- Treat image text as exact source copy.

## 29. Task 4 - Tests First: Route Architecture

Files:

- Modify: `tests/invariants/cockpit-route-architecture.test.ts`

Purpose:

- Change the contract for root `/` from authenticated redirect to public landing page.
- Keep protected cockpit surfaces as real routes.

Steps:

- [ ] Update root assertions.
- [ ] Ensure root no longer requires `requireDemoSession`.
- [ ] Ensure protected route files still exist.
- [ ] Ensure `cockpit/app/cockpit-shell.tsx` route assertions remain.

Expected root assertions:

```ts
const root = readFileSync("cockpit/app/page.tsx", "utf8");
const shell = readFileSync("cockpit/app/cockpit-shell.tsx", "utf8");

expect(root).toContain('data-testid="recoup-landing-page"');
expect(root).toContain('defaultValue="problem"');
expect(root).toContain("@/components/ui/tabs");
expect(root).toContain("@/components/ui/button");
expect(root).not.toContain("requireDemoSession");
expect(root).not.toContain("redirect(");
expect(shell).toContain('href: "/forensics"');
expect(shell).toContain('href: "/run"');
expect(shell).toContain('href: "/credit"');
expect(shell).toContain('href: "/cfo"');
```

- [ ] Run failing test:

```powershell
npm.cmd run test -- tests/invariants/cockpit-route-architecture.test.ts
```

Expected:

- FAIL because `cockpit/app/page.tsx` still redirects.

## 30. Task 5 - Tests First: Landing Business Boundary

Files:

- Modify: `tests/invariants/cockpit-no-business-logic.test.ts`

Purpose:

- Ensure public landing page stays editorial and does not become a hidden compute or API surface.

Steps:

- [ ] Update existing navigation test that expects root redirect.
- [ ] Add landing boundary test.
- [ ] Add source-label test.
- [ ] Add unsupported-claim absence test.
- [ ] Add shadcn component usage checks.

Expected assertions:

```ts
it("keeps the public landing page editorial and outside operational compute paths", () => {
  const root = readFileSync("cockpit/app/page.tsx", "utf8");

  expect(root).toContain('data-testid="recoup-landing-page"');
  expect(root).toContain("@/components/ui/tabs");
  expect(root).toContain("@/components/ui/button");
  expect(root).toContain("@/components/ui/badge");
  expect(root).toContain("@/components/ui/tooltip");
  expect(root).not.toContain("decimal.js");
  expect(root).not.toContain("src/core");
  expect(root).not.toContain("src/services");
  expect(root).not.toContain("RECOUP_API_URL");
  expect(root).not.toContain("localRuntimeEnv");
  expect(root).not.toContain("fetch(");
});
```

Expected unsupported-claim assertion:

```ts
it("does not ship unsupported rough-plan analyst claims", () => {
  const root = readFileSync("cockpit/app/page.tsx", "utf8");

  expect(root).not.toContain("10-20 days");
  expect(root).not.toContain("trapped working capital");
  expect(root).not.toContain("65-80%");
  expect(root).not.toContain("$30-$50");
});
```

- [ ] Run failing test:

```powershell
npm.cmd run test -- tests/invariants/cockpit-no-business-logic.test.ts
```

Expected:

- FAIL because root page is still redirect.

## 31. Task 6 - Implement Landing Page

Files:

- Modify: `cockpit/app/page.tsx`

Steps:

- [ ] Remove `redirect` import.
- [ ] Remove `requireDemoSession` import.
- [ ] Make the page a public React component.
- [ ] Import shadcn components.
- [ ] Import lucide icons sparingly.
- [ ] Define tab IDs.
- [ ] Define source entries.
- [ ] Define retained claim entries.
- [ ] Define tech rows.
- [ ] Render header.
- [ ] Render hero.
- [ ] Render source strip.
- [ ] Render `Tabs`.
- [ ] Render Problem tab.
- [ ] Render How Recoup Works tab.
- [ ] Render Demo Roles tab.
- [ ] Render Tech Spine tab.
- [ ] Render Build Proof tab.
- [ ] Add stable `data-testid` hooks.
- [ ] Keep CTAs to approved login targets.

Required imports shape:

```tsx
import Link from "next/link";
import { ArrowRightIcon, BookOpenCheckIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
```

Required hooks:

- `data-testid="recoup-landing-page"`
- `data-testid="recoup-landing-hero"`
- `data-testid="recoup-landing-source-strip"`
- `data-testid="recoup-landing-tabs"`
- `data-testid="recoup-landing-tab-problem"`
- `data-testid="recoup-landing-tab-workflow"`
- `data-testid="recoup-landing-tab-roles"`
- `data-testid="recoup-landing-tab-tech"`
- `data-testid="recoup-landing-tab-proof"`
- `data-testid="recoup-landing-maya-cta"`
- `data-testid="recoup-landing-david-cta"`

CTA target default:

```ts
const mayaLoginHref = "/login";
const davidLoginHref = "/login";
```

Only change to query-prefill after approval.

## 32. Task 7 - Optional Login Query-Prefill

Default:

- Do not implement.

Only implement if user approves:

- `/login?persona=maya`
- `/login?persona=david`

Files:

- Modify: `cockpit/app/login/page.tsx`
- Modify: `cockpit/app/login/login-form.tsx`
- Modify: relevant login invariants

Rules:

- No visible persona radio/toggle controls.
- Only whitelist `maya` and `david`.
- Use canonical login IDs from `buildCockpitDemoLoginPersonas()`.
- Remembered login ID may win if already enabled and valid.
- Do not expose persona catalog as hardcoded client array.

Stop if:

- Existing `maya-shadcn-qa-contract` invariant blocks this.
- User does not explicitly approve narrowing that invariant.

## 33. Task 8 - Tests First: E2E Landing Coverage

Files:

- Modify: `tests/e2e/cockpit-premium-e2e.ts`

Steps:

- [ ] Add anonymous `/` screenshot target.
- [ ] Add `assertLandingPage` helper.
- [ ] Assert hero visible.
- [ ] Assert source strip visible.
- [ ] Assert five tabs visible.
- [ ] Click each tab.
- [ ] Assert Maya CTA visible.
- [ ] Assert David CTA visible.
- [ ] Assert CTA href values.
- [ ] Assert `/forensics` still redirects anonymous user to `/login`.

Screenshot target:

```ts
{ name: "landing", path: "/", role: "anonymous" },
```

Helper shape:

```ts
async function assertLandingPage(page: Page): Promise<void> {
  await expectVisibleLocator(page, '[data-testid="recoup-landing-page"]', "Recoup landing page");
  await expectVisibleLocator(page, '[data-testid="recoup-landing-hero"]', "Recoup landing hero");
  await expectVisibleLocator(page, '[data-testid="recoup-landing-source-strip"]', "Recoup landing source strip");

  for (const label of ["Problem", "How Recoup Works", "Demo Roles", "Tech Spine", "Build Proof"]) {
    await page.getByRole("tab", { name: label }).waitFor({ state: "visible", timeout: 10_000 });
  }

  await page.getByRole("tab", { name: "Demo Roles" }).click();
  await expectVisibleLocator(page, '[data-testid="recoup-landing-maya-cta"]', "Maya landing CTA");
  await expectVisibleLocator(page, '[data-testid="recoup-landing-david-cta"]', "David landing CTA");
}
```

Run:

```powershell
npm.cmd run test:e2e
```

Expected:

- PASS after implementation.
- New screenshots under `output/playwright/e2e/landing-*.png`.

## 34. Task 9 - Targeted Test Run

Run after implementation:

```powershell
npm.cmd run test -- tests/invariants/cockpit-route-architecture.test.ts tests/invariants/cockpit-no-business-logic.test.ts
```

Expected:

- PASS.

Then run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
```

Expected:

- PASS.

## 35. Task 10 - Browser Visual QA

Start dev server:

```powershell
npm.cmd run dev:cockpit
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/login`
- `http://localhost:3000/forensics`

Check `/`:

- Public.
- No auth redirect.
- Header visible.
- Hero visible.
- CTAs visible.
- Source strip visible.
- Tabs visible.
- Default tab is Problem.
- Every tab can be clicked.
- No text overlap.
- No horizontal scroll at 375px.
- shadcn focus states visible.
- No unsupported rough-plan claims.

Check `/login`:

- Existing login layout is not broken.
- No visible persona choices.
- Login form still works manually.

Check `/forensics` anonymous:

- Redirects to `/login`.

## 36. Task 11 - Full Verification

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run verify
git diff --check
git status --short --branch
```

If `npm.cmd run verify` fails:

- Split into component commands.
- Report exact failing command.
- Do not claim completion.

If E2E screenshots create output churn:

- Keep only intentional landing screenshots if screenshots are meant to be committed.
- Otherwise report generated outputs as local QA artifacts.

## 37. Task 12 - Senior Critique Pass

Review diff for:

- Did `/` become public while protected routes stayed protected?
- Did shadcn components handle the tab/button/table/badge patterns?
- Did landing page import any backend or core logic?
- Are all public numeric claims sourced?
- Did any unsupported rough-plan claim survive?
- Is there any static business value that looks like live cockpit data?
- Is login behavior unchanged unless explicitly approved?
- Does mobile fit?
- Does desktop look dense and premium?
- Are source labels visible without relying only on tooltip?
- Did tests cover the changed behavior?

Likeliest bug:

- Accidentally weakening auth by moving the root redirect pattern without verifying protected routes.

Mitigation:

- E2E must assert anonymous `/forensics` redirects to `/login`.

## 38. Closeout Requirements

Closeout must state:

- Worktree path.
- Branch.
- Base commit.
- ImageGen mockup path.
- Whether user approved visual direction.
- Files changed.
- shadcn components used.
- Source claims retained.
- Source claims removed.
- Routes tested.
- Browser sizes tested.
- Exact test commands and pass/fail.
- Whether `npm.cmd run verify` passed.
- Any remaining gaps.

Closeout must not:

- Claim production aligned unless deployment provider read-back is done.
- Claim all stats are verified unless every displayed statistic was checked.
- Hide failed suites.
- Conflate static editorial market claims with backend/read-model product data.

## 39. Implementation Approval Gate

Stop here until:

1. User confirms this expanded plan is acceptable.
2. ImageGen CLI mockup is generated.
3. User approves the visual direction.

After approval:

- Implement tests first.
- Implement page.
- Run verification.
- Report exact artifacts.

## 40. Quick Command Index

Plan file:

```powershell
Get-Content -LiteralPath "docs\superpowers\plans\2026-06-29-recoup-landing-page.md"
```

Line count:

```powershell
(Get-Content -LiteralPath "docs\superpowers\plans\2026-06-29-recoup-landing-page.md").Count
```

Worktree status:

```powershell
git status --short --branch
```

ImageGen:

```powershell
python "$env:CODEX_HOME\skills\.system\imagegen\scripts\image_gen.py" generate `
  --model gpt-image-2 `
  --quality low `
  --size 1536x1024 `
  --out "mockups\imagegen\recoup-landing-page-v1.png" `
  --prompt "Use case: ui-mockup. Asset type: Recoup public landing page visual north star. Primary request: premium B2B SaaS landing page for an evidence-backed Order-to-Cash recovery cockpit. Layout: compact fixed header, editorial hero, source strip, five-tab shadcn-style navigation, dense tab content area, Maya and David CTA buttons. Style: light neutral enterprise finance UI using IBM Plex Sans and Newsreader feel, tokenized surfaces, crisp dividers, compact badges, restrained table-led sections. Content: Recoup, O2C leakage is an evidence problem, Code computes every dollar, Humans approve, Enter as Maya, Enter as David, McKinsey, UpClear, APQC. Constraints: no fake dashboard screenshots, no invented data tables, no stock photo, no purple gradients, no blobs, no glassmorphism, no all-caps tracked labels, no emoji, no watermark."
```

Targeted tests:

```powershell
npm.cmd run test -- tests/invariants/cockpit-route-architecture.test.ts tests/invariants/cockpit-no-business-logic.test.ts
```

Full checks:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run verify
git diff --check
```

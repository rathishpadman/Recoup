# Independent Verification Feedback — Consolidated Actions for Codex (2026-07-05)

**Verifier:** Claude (independent pass — code greps, fresh command runs, live browser test of all 8 cases against `/api/forensics`, and review of the committed visual evidence package).
**Worktree verified:** `C:\tmp\maya-reference-workspace-prod-baseline` @ `codex/maya-case-detail-deep-dive` (`dc1ca10`), clean tree.
**Verdict:** Rollout is substantially real and matches the blueprint/mockup contract. **8/8 cases render exact backend data.** Five findings below (CDX-1..5) must be fixed/re-evidenced before the merge packet; none require redesign.

---

## A. Independently VERIFIED — do not rework these

| Area | Evidence (fresh, this pass) |
|---|---|
| Data parity, all 8 cases | Browser DOM vs live `/api/forensics`: S1–S8 each match on customer, amount, line count, verdict pill, full agent reason, routing. Exact matches incl. S6 `$18,400.00` pricing reason and S8 `$11,500.00` duplicate-credit reason. |
| Overview aggregates | KPI cards = `8/$112,400.00 · 3/$32,600.00 · 4/$63,900.00 · 1/$15,900.00` with correct 29%/57%/14% shares; verdict quick filters `All 8 · Valid 3 · Invalid 4 · Partial 1`. |
| S7 partial split rule | Both `Draft email to Billing` AND `Draft email to Recovery` render, both disabled pre-approval. Stepper shows real S7 scenario "Promo overclaim above approved TPM accrual". |
| Case page structure | 0 tablists; B1→B7 order; drawers `label · value`, closed by default; expanded drawer shows full record IDs incl. vector-store file id. |
| Copilot | Complete state (beat-08): conductor → Agents complete → verdict band `Route: Recovery · Recovery draft staged · $21,300.00` + narrative → Citations/Trace/Model drawers; Voice button present. |
| Reason writer code | Strict Zod fact packet, structured output, groundedness gate (uncited IDs, model-authored numbers, verdict/routing drift all rejected), fallback tagging, receipt columns in schema. |
| Gates re-run by verifier | `typecheck` exit 0; 4 suites `91/91` pass; git log = 8 logical commits, clean tree. |

## B. FINDINGS — consolidated actions (fix, then re-evidence)

### CDX-1 (HIGH) — "Agent investigation · 0 steps" on every case pre-query
Live repro: S1-L1 and S7-L1 both render `Agent investigation — Evidence steps returned for this case. — 0 steps` with only the evidence-context chip row. The B3 timeline only populates from a live copilot query trace; the **overnight investigation story is empty** — this contradicts mockup block B3 and the product story ("agents worked last night").
**Action:** populate the timeline from the case's existing investigation/trace data at load (the same rows the Agent trace drawer exposes; S3 shows populated steps after a query, proving the render path works). No fabricated steps/timestamps — if the backend genuinely has no per-case overnight trace rows, derive the steps from the receipt's deterministic basis fields (retrievers used, docs read, rule fired, verdict) which all exist.
**Proof:** fresh capture of S1 and S7 showing ≥3 real steps pre-query + e2e asserting `steps > 0` on case open for all 8 cases.

### CDX-2 (HIGH, evidence integrity) — visual package "complete" slot contains the Running state
`output/playwright/e2e/visual/maya-copilot-complete-desktop.png` shows chip `Running` + `Stop query` + no verdict band. The manifest marks it PASS for the complete state — that's inaccurate evidence. The true complete state exists (beat-08).
**Action:** fix `scripts/captureMayaVisualEvidence.ts` to wait for the `Complete` chip + verdict band before capture; regenerate the 12-file package; update the manifest's "Latest measured" tables.
**Proof:** recaptured PNG showing `Complete` chip + verdict band; capture script waits on `[data-*]` complete state, not a timer.

### CDX-3 (MEDIUM) — dock evidence packet shows `0 sources` beside `18 records`
Seen in the running-state capture (workspace/Overview context, S1-L1 focus). A visible real-data inconsistency: the packet summary's source count is unpopulated on this path while records count is correct.
**Action:** populate the source count from the same packet the records come from (or drop the chip when the field is absent — never render `0 sources` next to a non-empty packet).
**Proof:** unit test on the packet summary builder + recaptured idle/running screenshots.

### CDX-4 (MEDIUM) — `reasonSource: "deterministic_fallback"` on 8/8 lines
Live API shows every case's narrative is the Tier-2 fallback; the LLM reason-writer tier never produced a stored narrative in this environment. The fallback text is good (it's what shipped in the UI parity check), and fail-safe behaviour is correct — but the flagship approved capability has zero live proof of its Tier-1 path.
**Action:** run the investigation with the OpenAI key present and confirm ≥1 line persists `reasonSource: "llm"` passing the groundedness gate; if the writer is intentionally disabled in dev, document the enabling env + capture one llm-sourced run in the status doc. Include the groundedness eval output.
**Proof:** API response snippet showing `reasonSource: "llm"` + eval run output; fallback e2e stays green.

### CDX-5 (LOW, DX) — `npm run dev:api` hangs headless
`tsx watch src/services/cockpitApi.ts` never binds 4317 when spawned without a TTY (>2 min, no output, no listener). Direct `npx tsx src/services/cockpitApi.ts` listens in ~15s. Cost this verification ~10 minutes; will cost every future headless/CI consumer the same.
**Action:** either make `dev:api` fall back cleanly (e.g. `tsx watch --clear-screen=false`) or document the direct-start command in the README/dev docs.
**Proof:** headless start instruction verified once.

### CDX-6 (LOW, bookkeeping) — F6.1 copy metric lacks the before/after ratio
Current counts recorded (638 visible / 91 non-fact) but the checklist criterion was ≥50% reduction vs the pre-rework page. Reconstruct the "before" count from `main` (the script can run against a `main` build) or annotate the criterion as superseded by the absolute banned-fragment checks with user sign-off.

## B2. Second-pass findings (user human-eye check + Claude live lifecycle test, 2026-07-05 afternoon)

### Lifecycle proof — EXECUTED LIVE, all green (screenshots in `output/playwright/e2e/visual/lifecycle/`)

| Step | Result | Screenshot |
|---|---|---|
| Review gate | "Mark evidence reviewed" enables Open approval; email stays locked | `lifecycle-01-reviewed-gate.png` |
| Approval dialog | Approve enabled; Reject/Request-changes reason-gated | `lifecycle-02-approval-dialog.png` |
| Post-approval | Stepper → "Human decision recorded · done"; email button unlocks | `lifecycle-03-approved-stepper-email-enabled.png` |
| Email draft | Real facts (S1, $8,200.00, 3 lines, verdict, reason, cited records) | `lifecycle-04-email-dialog.png` |
| **Live send + readback** | Provider id `e486ac43-32fa-4ac7-92e8-942a000df844`, event **delivered**, action `route-billing:S1-L1`, recipient Billing | `lifecycle-05-email-delivered-status.png` |
| Admin reset (CFO session) | `deletedRecordCount: 1`, `preservedSourceData: true`; S1 back to "Awaiting human approval · current", buttons re-locked, review toggle cleared | `lifecycle-06-reset-back-to-awaiting.png` |

### CDX-7 (HIGH) — Evidence cards show retrieval plumbing, not business evidence
Live DOM, S1-L1, all 4 cards:
- Titles are pipeline sentences: "SAP OData billing-document 90000002 **retrieved through read-only mapping**." (×2), "Document repository POD record DOC-S1-L1."
- The vector-store card renders the **raw dossier markdown as its title/body** — including internal LLM instructions: "*Any monetary values for this record must be computed by Recoup deterministic core code, not by this dossier.*" leaking straight into Maya's screen.
- The actual business evidence for a damage case — carrier photo record (`PHOTO-CARRIER-1`), carrier-report content, invoice line facts — is never shown as facts; no way to open/view a document.
**Action:** (a) titles become business labels: "Invoice 90000002 · SAP OData", "Proof of delivery DOC-S1-L1 · Contract Repo", "Carrier report · Semantic retrieval"; (b) rows show business fields from the doc payload (invoice no./amount context, POD signer/date where present, photo/report reference), keeping Document/Type/Citation/Verification; (c) the dossier text and retrieval sentences move behind the card's provenance disclosure — NEVER rendered as title/body; (d) add a per-card "View document" opening a drawer with the stored evidence payload (route/dossier content), so "actual evidence docs" are one click away.
**Proof:** recaptured evidence section for S1 + S3; e2e asserting no card title matches `/retrieved through|^# /`; doc-viewer drawer opens with real payload.

### CDX-8 (HIGH) — Voice: cannot speak the question, and realtime credentials dead in this env
Live repro, both modes:
1. Mic with empty question → error "Enter a cited evidence question before starting voice" rendered in the conversation area far from the button — user-perceived as "nothing happens". The current design is **type-first, model speaks the answer** — not "ask by voice".
2. Mic with question filled → chip **Blocked**, "Realtime credentials unavailable. Offline cited answer remains active." — realtime client-secret minting fails in this env.
**Action:** (a) make the mic start the session immediately and treat the **spoken utterance as the question** (the realtime session already captures mic audio; the tool bridge already answers with citations) — the typed-question precondition goes away; (b) status/error feedback appears adjacent to the mic (pulse/tooltip/chip), not only in the conversation log; (c) provision/document the realtime credential env (which key/scope the client-secret route needs) so the feature is demonstrably alive locally; keep the Blocked fail-closed state for genuinely missing credentials.
**Proof:** screen recording or fake-media e2e of mic-press → Listening → spoken question → cited answer; near-button feedback assertion; env requirement documented in the readiness doc.

### CDX-9 (MEDIUM) — SAP OData tile should follow the data path's existing fallback (user-approved design)
Code facts: the DATA path already runs `sap-primary-supabase-authoritative-fallback` (`serviceLayer.ts:943`) — data is served from Supabase when SAP fails. The probe timeout is 5s (`sourceHealth.ts:42`). But the TILE still shows red "Probe failed" and the pill sits at 6/7 even though the run is fully served.
**Action (user approved 2026-07-05):** probe timeout 5s → **2500ms**; when the authoritative fallback is active, the SAP tile renders **"Proxy — Supabase" with ready tone** (same treatment as TPM/POD/Bureau tiles), with the probe failure detail inside the tile's disclosure; pill counts it connected (7/7). True total outage (Supabase also down) stays red. Never show ready when no data source is serving.
**Proof:** unit test on tile state derivation (SAP down + fallback active → ready-proxy; both down → blocked); e2e screenshot with 7/7 green; red-state test retained.

### CDX-10 (MEDIUM) — Approval dialog copy fails the D-rules
Live dialog text: "Approver — **Verified human principal unavailable** — Approval owner pending", "Opening this dialog does not dispatch anything.", plus the outcome section's "Selected action context — These are selected action citations, not committed audit receipt citations." and "Receipt fields remain source-owned. Approval finality is not recovery dispatch, ERP write-back, Billing routing, or case closure."
**Action:** apply copy rules D1–D8 to the approval dialog + outcome/audit strips: approver row shows the signed-in reviewer (or is omitted until decision), self-describing sentences move to a single Details disclosure. Same PR-mapping requirement as F6.
**Proof:** recaptured dialog; banned-phrase rg; one "human approval" notice per screen still holds.

### CDX-11 (LOW) — Direct-API admin reset is impossible with the shipped `.env.local`
`verifyDirectHumanCockpitPrincipal` accepts only `RECOUP_COCKPIT_HUMAN_PRINCIPAL` (= `human:maya-lead`), while `isAdminResetPrincipal` demands `human:cfo-lead` when `RECOUP_COCKPIT_ADMIN_PRINCIPAL` is unset → header-auth reset can never pass (verified: 401). The **UI CFO-session path works** (used for the lifecycle proof above).
**Action:** document the CFO-session reset as the supported path AND/OR add `RECOUP_COCKPIT_ADMIN_PRINCIPAL` to `.env.example` with a note; optionally surface a governed "Reset demo case" control on the CFO governance page.
**Proof:** doc update + (if control added) gated e2e.

### CDX-12 (LOW) — Dev ergonomics confirmed again
`npm run dev:api` (tsx watch) never binds headless (reconfirmed this session); direct `npx tsx src/services/cockpitApi.ts` binds in ~15s. Same action as CDX-5 — treat as one item.

## C. Re-verification required after fixes

```powershell
npm.cmd run lint; npm.cmd run typecheck; npm.cmd run test; npm.cmd run build
npm.cmd run test:e2e -- --maya-shadcn-only
npm.cmd run test:e2e:maya-real
npm.cmd run test:e2e:maya-approval-lifecycle
npx.cmd tsx scripts\captureMayaVisualEvidence.ts   # regenerated package incl. CDX-1/CDX-2 captures
```

Return: updated sign-off tables (checklist F0–F10 + this doc's CDX-1..12 rows with DONE + proof), `git log --oneline`, clean `git status`.

## E. Post-fix validation checklist (fill in AFTER implementing CDX-1..12)

Rules: every row is answered with a **measured value** (exit code, exact count, exact string, screenshot path) — prose without a measurement is FAILED. Screenshots at 1440×900 unless stated. Return this table completed together with the CDX sign-off.

### E1. Per-finding validation

| # | Validation action | Expected result | Evidence |
|---|---|---|---|
| V-1 | Open S1, S5, S7 case pages fresh (no query run) and count investigation steps | Each shows ≥3 real steps sourced from trace/receipt data; `0 steps` appears nowhere; e2e asserts `steps > 0` for all 8 cases | |
| V-2 | Re-run `npx.cmd tsx scripts\captureMayaVisualEvidence.ts`; open `maya-copilot-complete-desktop.png` | Chip = `Complete`, verdict band visible, no `Stop query`; capture script waits on complete-state selector (file:line) | |
| V-3 | Open dock on Overview, inspect evidence-packet chips | Never `0 sources` next to a non-empty record set; unit test on packet summary green | |
| V-4 | Run overnight investigation with OpenAI key present; `GET /forensics` | ≥1 worklist row has `reasonSource: "llm"`; groundedness eval output attached; LLM-key-removed run still completes 8/8 with `deterministic_fallback` | |
| V-5 | Start API headless per the documented command | Binds within 60s; doc/readme line referenced | |
| V-6 | Copy metric before/after | Before count (from `main` build) + after count + reduction % ≥50, or user-signed waiver noted | |
| V-7 | Open S1 evidence section | 0 card titles matching `/retrieved through|^# /`; titles are business labels; carrier photo/report facts visible; "View document" opens drawer with stored payload; dossier text ONLY inside provenance disclosure; internal instruction sentence ("must be computed by Recoup deterministic core code") not rendered anywhere — `rg` in DOM dump = 0 | |
| V-8a | Click mic with EMPTY question box | Session starts (no error demanding typed text); spoken utterance becomes the query; status feedback renders adjacent to the mic button | |
| V-8b | Voice with credentials provisioned | Mic → `Listening` (recording indicator) → cited answer in the standard layout; recording/screenshots attached; Blocked state still correct when credentials absent | |
| V-9 | Stop SAP OData (or leave probe failing) and load Overview | Within ~2.5s probe budget, SAP tile = "Proxy — Supabase" ready tone; pill green `7/7 connected`; probe failure detail in tile disclosure; unit test both-down → blocked stays red | |
| V-10 | Open approval dialog pre-decision | No "Verified human principal unavailable" / "Approval owner pending"; self-describing sentences gone or in a single Details disclosure; banned-phrase `rg` = 0 | |
| V-11 | Follow the documented admin-reset path on a fresh clone | Reset succeeds via documented path; `.env.example` includes `RECOUP_COCKPIT_ADMIN_PRINCIPAL` with note | |
| V-12 | (Same as V-5 — one item) | — | |

### E2. Regression validation (must all still pass after the fixes)

| # | Validation action | Expected result | Evidence |
|---|---|---|---|
| R-1 | Full gates: `lint`, `typecheck`, `test`, `build` | All exit 0; pass counts pasted | |
| R-2 | `test:e2e -- --maya-shadcn-only`, `test:e2e:maya-real`, `test:e2e:maya-approval-lifecycle` | All pass; output lines pasted | |
| R-3 | 8-case data parity re-check (DOM vs `/api/forensics`) | 8/8 MATCH on customer, amount, lines, verdict, reason, routing | |
| R-4 | Full lifecycle re-run on S1: review → approve → email send (live) → delivery status → CFO reset | Stepper flips both ways; provider event `delivered`; `deletedRecordCount ≥ 1`; S1 back to "Awaiting human approval · current"; 6 fresh screenshots in `output/playwright/e2e/visual/lifecycle/` | |
| R-5 | S7 partial case | Both email buttons still render and stay gated pre-approval | |
| R-6 | Drawers | All 5 closed on case open; triggers still `label · value`; expanded Evidence packet still lists full record ids | |
| R-7 | KPI cards + quick filters | Aggregates equal backend; filter counts equal bucket counts | |
| R-8 | No new invented values | Spot-check list in PR; unknown/missing fields render explicit unavailable states | |
| R-9 | Committed + clean | `git log --oneline` (new commits per finding) + empty `git status` | |

## F. Claude live re-verification of the remediation (2026-07-05 evening)

Independent browser + API re-test of `2026-07-05-claude-feedback-remediation-status.md` claims, on the committed branch (`71abbe1`, clean tree).

| Claim | Live result | Verdict |
|---|---|---|
| CDX-1/V-1 steps pre-query | S1 = 3, S5 = 3, S7 = 3 real steps (case-specific sources + citation chips, e.g. `EVD-POD-S5-L1`); header "Overnight evidence steps for this case." | CONFIRMED |
| CDX-2/V-2 complete capture | Regenerated PNG (19:16) shows `Complete` chip, verdict band, no Stop query | CONFIRMED |
| CDX-3/V-3 zero-source chip | Packet shows `S3-L1 · 17 records`, no `0 sources` chip | CONFIRMED |
| CDX-7/V-7 evidence cards | Business titles ("Invoice SAP-90000002 · SAP OData", "Proof of delivery DOC-S1-L1 · Contract Repo", "Carrier report … · OpenAI vector store"); 4 View-document + 4 provenance triggers; internal-instruction sentence 0 hits; raw dossier title 0 hits | CONFIRMED with residual RES-1 |
| CDX-8/V-8a mic-first | Empty box + mic → NO typed-question error; "Listening for your voice question." then fail-closed `Blocked · Realtime credentials unavailable` | CONFIRMED (live voice still needs credentials — expected) |
| CDX-10/V-10 dialog copy | Dialog opened live: "Verified human principal unavailable" / "Approval owner pending" / "does not dispatch anything" all 0 hits; copy now business language | CONFIRMED |
| F6.2 single approval notice | Exactly 1 on S1 and S7 | CONFIRMED |
| S7 dual gated emails | Both buttons render, both disabled pre-approval | CONFIRMED |
| R-9 committed/clean | `71abbe1`, `5bcb58e`; `git status` = 0 lines | CONFIRMED (better than doc's "READY") |
| CDX-4/V-4 llm reason | Default env: **8/8 deterministic_fallback, 0 llm**. With `RECOUP_RECONCILIATION_MODE=authoritative` (process env): **7/1 with llm narrative on S2-L1** — matches claim | CONFIRMED **in authoritative mode only** → RES-2 |
| CDX-9/V-9 7/7 pill | Default env: SAP tile `Probe failed · blocked`, pill **6/7**. Authoritative mode: SAP `Proxy - Supabase · ready`, **7/7** — matches claim | CONFIRMED **in authoritative mode only** → RES-2 |

### Residual items for Codex (small, pre-merge)

| # | Residual | Action |
|---|---|---|
| RES-1 | "retrieved through read-only mapping" still VISIBLE 4× on the case page inside `maya-evidence-document-row` (evidence packet document rows) — titles were fixed, these rows were not | Apply the CDX-7 business-label treatment (or move the sentence into the provenance disclosure); add the phrase to the banned-copy rg list so it can't regress anywhere |
| RES-2 | Out-of-box demo does NOT show the CDX-4/CDX-9 fixes: `.env.local` lacks `RECOUP_RECONCILIATION_MODE=authoritative`, so reasons show 8/8 fallback and the pill shows 6/7 red | Add the mode line to `.env.local` (user) and to the deploy env list; state in the readiness doc that demo parity REQUIRES authoritative mode |
| RES-3 (nit) | The llm narrative surfaces on grouped row S2-L1 prefixed "Line S2-L2 (RECON-S2-L2):" — receipt id in business copy, and a line-2 narrative on a grouped row | Strip the receipt-id prefix in display; prefer the grouped line's own narrative when present |

## G. Round-3 findings — MOVED

**This section's content (CDX-13..22) has MOVED to `2026-07-05-claude-consolidated-feedback-round4.md`, which is the single active instruction document (it also adds CDX-23/24). Execute from that doc only — the table below is retained for history and must not be worked from.**

Root theme: the page is structurally right but **information-dense and system-honest instead of business-meaningful**. Blueprint + mockup carry a V2 revision block with these rules; V2 overrides V1 wherever they conflict. Every criterion below follows the Section F measurement rules.

| # | Finding (user-verified live) | Required change | Pass criterion |
|---|---|---|---|
| CDX-13 | Agent investigation occupies the page | Whole section becomes a Collapsible drawer, **collapsed on load**; trigger `Agent investigation · {n} steps · {VERDICT}` | e2e: drawer `data-state="closed"` on case open for all 8 cases; trigger regex matches; expanded height ≤ ~1/4 of previous section (screenshot pair) |
| CDX-14 | Steps stuffed with raw-id chips (`CLAIM-S1-L1`, `EVD-CARRIER-PHOTO-S1-L1`) meaningless to business | Chips become business labels ("Carrier photo", "Invoice 90000002", "Signed POD"), max 3 per step + `+k more`; raw ids only inside disclosures | DOM audit: **0** chips matching `/^(CLAIM|EVD|RECON|SAP-C_|TOOLS-DATA)/` outside disclosures on S1/S3/S7; label map unit-tested (doc type → label, fail-closed to doc id when unknown — never invented) |
| CDX-15 | Final step says "valid" with no connecting reason | Final step renders the SAME narrative string as the verdict band ("{reason} → VERDICT") | e2e string equality: final-step text contains the verdict-band basis string, all 8 cases |
| CDX-16 | Copilot declares the verdict before agents run — feels fake | Honesty framing: conductor = "Re-checking the overnight verdict for {id} — pulling the cited evidence"; answer band gains "Verified against {n} cited records"; NEVER "…then returning a verdict" | rg for "returning a verdict" in cockpit/ → 0; e2e asserts new conductor copy + band label |
| CDX-17 | "View document" opens nothing useful | Viewer renders the real stored content (dossier text, document payload); **trigger does not render when no content exists** | e2e: every rendered View-document opens non-empty content (>0 chars of payload); cards without content show no trigger |
| CDX-18 | Two evidence surfaces + hash/ID/citation noise; "verified" claims without visible proof | ONE evidence surface: Evidence-packet drawer DELETED, its depth merged into per-card `More details` (ids, hashes, citation rank, provenance live only there); card rows = Document / Source / Status; Status reflects ACTUAL hash-verification state | e2e: 0 evidence-packet drawer; per-card disclosure contains the merged fields; primary card rows exactly 3; verification badge state sourced from real verification field (unit test) |
| CDX-19 | Draft source details = id-card dumps | Business summary rows + ONE details disclosure | same chip/disclosure criteria as CDX-14 applied to draft source content |
| CDX-20 | "Why 5 drawers at all?" | ONE `Audit & provenance · {audit state}` drawer replaces Agent trace / Audit / Evidence packet / Line source / Draft source (grouped inside). **Supersedes F1.3's exactly-5 contract — update those tests in the same change.** No governance data deleted | e2e: exactly 1 depth drawer on the case page, closed on load; field-loss audit table maps every previous drawer field to its new location |
| CDX-21 | Voice says "Listening" with no proof it hears you (root cause: session never enables `input_audio_transcription`; UI subscribes only to terminal events) | Enable input transcription on the realtime session; surface `speech_started` → "Hearing you…", **live user-transcript deltas in the "You" bubble**, "Processing…" between `speech_stopped` and answer, assistant spoken-answer transcript streaming; `RealtimeBrowserSessionSnapshot` gains transcript fields | fake-media e2e: transcript text visible within 2s of (fake) speech; state sequence Listening → Hearing you → Processing → Answered asserted; silent-Listening = FAIL |
| CDX-22 | Sweep extras (same classes, found by Claude): (a) "Selected evidence context" chip row inside the investigation section duplicates the evidence section; (b) verdict-block Cited row shows 6 raw ids + "+18 more" — apply CDX-14 rule (business labels max 3 + "All 24 cited records" disclosure); (c) RES-1 confirmed again — "retrieved through read-only mapping" in evidence document rows | Remove (a); relabel (b); fix (c) per RES-1 | rg/DOM audits per item → 0 |

**Re-verification after G:** run Section E (E1 + E2) again in full, plus the new criteria above. Return the completed CDX-13..22 rows with proofs. The updated authority artifacts are `2026-07-04-case-detail-blueprint.html` (V2 box) and `2026-07-04-case-detail-mockup.html` (V2 banner + revised B3/B4/B5/B7/copilot/voice blocks) — V2 blocks override V1 panels where they conflict.

## D. Unchanged gates (outside Codex scope)

1. **User:** G-P3 retro-approval confirmation; production go/no-go.
2. **Environment:** live Supabase migration for `reason_*` receipt columns before deploy; SAP OData probe fix for 7/7 green.

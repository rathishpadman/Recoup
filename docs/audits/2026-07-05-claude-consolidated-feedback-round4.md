# Consolidated Feedback — Round 4 (2026-07-05, standalone, supersedes earlier round docs)

**Codex: execute from THIS document only.** It consolidates every currently-outstanding item: the business-meaning pass (CDX-13..22), the approval-dialog integrity bug (CDX-23), and the approval-dialog simplification (CDX-24). Earlier docs (`2026-07-05-claude-verification-feedback.md`, remediation status) are FROZEN history — do not re-open them. All prior CDX-1..12 items are verified DONE and must not regress.

**Authority artifacts (updated 2026-07-05 with V2 blocks — V2 overrides V1 wherever they conflict):**
- `2026-07-04-case-detail-blueprint.html` — red **V2 REVISION** box: 8 density/honesty rules.
- `2026-07-04-case-detail-mockup.html` — V2 banner + redrawn B3 (collapsed investigation drawer), B4 (single evidence surface, per-card More details), B5 (business-label cited chips), B7 (one Audit & provenance drawer), copilot verification framing, voice transcript states.

**Measurement rules:** every checklist row is answered with a measured value (exit code, exact count, exact string, screenshot path at 1440×900 / 375×812). Prose without a measurement = FAILED. Word counts use the repeatable DOM-eval method in `scripts/measureMayaCaseCopy.ts`.

---

## Part A — Business-meaning pass (user review of the case page, decisions locked with user)

Root theme: the page is structurally right but **information-dense and system-honest instead of business-meaningful**. A business team member must understand every primary-view element without knowing Recoup internals.

### CDX-13 (HIGH) — Agent investigation occupies the whole page
The section renders expanded and tall. **Change:** the whole section becomes a `Collapsible` drawer, **collapsed on load**, trigger `Agent investigation · {n} steps · {VERDICT}`. Expanded state = compact timeline (see CDX-14/15); each step ≤ 2 lines (did-line + toned finding).
**Pass:** e2e — drawer `data-state="closed"` on case open for all 8 cases; trigger regex `^Agent investigation · \d+ steps · .+$`; before/after screenshot pair.

### CDX-14 (HIGH) — Investigation steps stuffed with raw-ID chips
Steps show `CLAIM-S1-L1`, `EVD-CARRIER-PHOTO-S1-L1`, `TOOLS-DATA:S1`… meaningless to business. **Change:** chips become business labels ("Carrier photo", "Invoice 90000002", "Signed POD"), **max 3 per step + `+k more`**; raw record ids may appear ONLY inside disclosures. Label mapping is a unit-tested pure helper (doc type → label; unknown type falls back to the document id — never invented).
**Pass:** DOM audit on S1/S3/S7 — **0** chips matching `/^(CLAIM-|EVD-|RECON-|SAP-C_|TOOLS-DATA)/` outside disclosures; helper unit tests incl. fail-closed case.

### CDX-15 (HIGH) — Final step gives a verdict with no connecting reason
"Forensic decision: valid" doesn't connect to the previous steps. **Change:** the final step renders the SAME narrative string as the verdict band: `{reason_narrative ?? deterministicBasis} → {VERDICT}`.
**Pass:** e2e string equality — final-step text contains the verdict-band basis string, all 8 cases.

### CDX-16 (MEDIUM) — Copilot declares the verdict before agents run
The verdict already exists from the overnight run; the conductor copy pretends to newly decide ("…then returning a verdict") — feels fake. **Change:** verification framing — conductor: *"Re-checking the overnight verdict for {id} — pulling the cited evidence."*; answer band gains *"Verified against {n} cited records"*.
**Pass:** `rg "returning a verdict" cockpit/` → 0; e2e asserts the new conductor copy and band label.

### CDX-17 (HIGH) — "View document" opens nothing useful
**Change:** the viewer renders the real stored content (dossier text, document payload). **The trigger does not render at all when no content exists** — an empty viewer is a defect.
**Pass:** e2e — every rendered View-document opens > 0 chars of payload; content-less cards show no trigger.

### CDX-18 (HIGH) — Two evidence surfaces + hash/ID noise + unproven "verified"
Why an evidence dossier AND cards? Evidence id, carrier id, content hash etc. are not business fields; some entries imply verification with no URL/proof. **Change (user-approved):** ONE evidence surface — the Evidence-packet drawer is DELETED and its depth merges into a per-card `More details` disclosure (evidence record id, citation rank, content hash, retrieval provenance live ONLY there). Card primary rows = exactly **Document / Source / Status**. The Status badge must reflect the ACTUAL hash-verification state — never claim verified without a real check.
**Pass:** e2e — 0 evidence-packet drawers; per-card disclosure contains the merged fields; primary rows exactly 3 per card; verification state sourced from the real field (unit test).

### CDX-19 (MEDIUM) — Draft source details are ID-card dumps
Same disease as CDX-14 (`S1-L1`, `CLAIM-S1-L1` cards). **Change:** business summary rows + ONE details disclosure.
**Pass:** same chip/disclosure criteria as CDX-14 applied to draft-source content.

### CDX-20 (MEDIUM) — Five governance drawers nobody opens
"Not sure what's the need for agent trace, audit, evidence packet…" **Change (user-approved):** ONE `Audit & provenance · {audit state}` drawer replaces Agent trace / Audit / Evidence packet / Line source / Draft source, with that depth grouped inside. **Supersedes the exactly-5-drawers contract (old F1.3) — update those tests in the same change.** No governance data may be deleted.
**Pass:** e2e — exactly 1 depth drawer on the case page, closed on load; field-loss audit table in the PR maps every previous drawer field to its new location.

### CDX-21 (HIGH) — Voice says "Listening" with no proof it hears you
Root cause (code-verified): mic audio IS streamed to the OpenAI Realtime model over WebRTC, but the session never enables `input_audio_transcription` and the UI subscribes only to terminal events — every "I heard you" signal is discarded; `RealtimeBrowserSessionSnapshot` has no transcript field. **Change:** enable input transcription on the session and surface: "Hearing you…" on `input_audio_buffer.speech_started`; the user's words streaming LIVE into the "You" bubble (transcription deltas); "Processing…" between `speech_stopped` and the answer; the assistant's spoken-answer transcript streaming while it plays. Snapshot type gains transcript fields.
**Pass:** fake-media e2e — transcript text visible within 2s of (fake) speech; state sequence Listening → Hearing you → Processing → Answered asserted; a silent "Listening" = FAIL.

### CDX-22 (MEDIUM) — Sweep extras (same failure classes, found by Claude)
(a) The "Selected evidence context" chip row inside the investigation section duplicates the evidence section → remove.
(b) The verdict block's Cited row shows 6 raw ids + "+18 more" → CDX-14 rule: business labels max 3 + an "All {n} cited records" disclosure.
(c) "retrieved through read-only mapping" still visible in `maya-evidence-document-row` rows → apply business labels there too and add the phrase to the banned-copy rg list.
**Pass:** rg/DOM audits per item → 0.

---

## Part B — Approval dialog (user-reported bug + density)

### CDX-23 (HIGH) — Dialog contradicts committed state after a redundant decision click
**User report:** "Approval failed — Approval service rejected the human decision" while the stepper turned green and the email button enabled.
**Reproduced live by Claude on S2 and root-caused — the page was RIGHT; the dialog was WRONG:**
1. The first Approve click commits (POST `/api/approval` → 200, `human_decided`) — stepper/email correctly flip.
2. **Defect A:** the dialog stays open with Approve **re-enabled after success** — `isDecisionDisabled` (`approval-gate-dialog.tsx:87-89`) never checks "already decided" (measured live: `enabledAfterSuccess: true`).
3. **Defect B:** a redundant click erases the truth — `submitDecision` opens with `setError(undefined); setSuccess(undefined)` (`:102-103`), wiping the "Approval response recorded" receipt.
4. **Defect C:** the duplicate rejection renders as generic failure — any non-OK hits `:117-119` → "Approval service rejected the human decision." with no already-approved handling.

**Change:**
1. After a successful decision the dialog becomes **terminal**: decision buttons disabled (or footer swaps to a single Close), success receipt stays visible, reason field read-only.
2. `setSuccess(undefined)` must not clear a committed receipt.
3. A duplicate/409 renders "**Already approved** — receipt `{auditEntryHash8}` recorded" (informational), never the generic failure.
4. Keep the in-flight `submitting` disable; do not re-enable on completion (per 1).

| # | Pass criterion | Proof |
|---|---|---|
| 23.1 | After a successful decision: 0 enabled decision buttons in the dialog | e2e post-decision |
| 23.2 | Success receipt alert remains visible until close; a second click cannot remove it | e2e |
| 23.3 | Forced duplicate renders the "Already approved" state; "Approval service rejected the human decision" appears 0 times for duplicates | unit + e2e |
| 23.4 | Dialog state and page state can never disagree (committed receipt ⇒ dialog shows recorded; none ⇒ page shows pending) — asserted both directions | e2e |
| 23.5 | Normal approve → email → CFO reset lifecycle still passes | `test:e2e:maya-approval-lifecycle` output |

### CDX-24 (MEDIUM) — Approval dialog too dense; content duplicated
Confirmed in browser + code: ~12 stacked blocks; `draft.basis` rendered **twice** (Action row `:228` AND Basis row `:238-240`); policy prose in the header; eligibility alert repeating what enabled buttons already say; "Waiting for your decision." under a status badge; "Cited evidence available." (a non-fact); an extra footer sentence.

**Change — single-screen simplification (copy rules D1–D8):** keep exactly (1) title as the decision question — `Approve {action}?`; (2) three fact rows — Case (`S2-L1 · Crestline Grocery`), Amount (`$14,600.00`), Why (the ONE basis string); (3) the note/reason field; (4) decision buttons + Cancel; (5) ONE `Details` disclosure holding policy prose, eligibility internals, cited-record list, approver identity, source details. Everything else deleted or moved into that disclosure.

| # | Pass criterion | Proof |
|---|---|---|
| 24.1 | `draft.basis` appears exactly once in the dialog DOM | e2e count |
| 24.2 | Primary view (disclosure closed) ≤ 60 visible words excluding user-entered text | DOM word count (copy-metric method) |
| 24.3 | Removed strings mapped to deleted-or-disclosure | PR table |
| 24.4 | Before/after screenshot pair at 1440×900 in the visual evidence set | file paths |
| 24.5 | Banned-copy rg for the six quoted fragments (outside Details) → 0 | rg output |

---

## Part C — Validation checklist (fill and return; a part is DONE only when every row is DONE)

### C1 Per-item
| Row | Verdict | Evidence |
|---|---|---|
| CDX-13 (drawer collapsed, trigger format, screenshots) | | |
| CDX-14 (0 raw-id chips outside disclosures; label helper tests) | | |
| CDX-15 (final step === verdict-band reason, 8/8 cases) | | |
| CDX-16 (rg 0; conductor copy + band label e2e) | | |
| CDX-17 (View document content > 0 chars; no trigger when empty) | | |
| CDX-18 (0 packet drawers; 3 primary rows; real verification state) | | |
| CDX-19 (draft source simplified) | | |
| CDX-20 (exactly 1 depth drawer; F1.3 tests updated; field-loss table) | | |
| CDX-21 (live transcript ≤ 2s; state sequence; silent Listening = FAIL) | | |
| CDX-22 a/b/c (rg/DOM audits → 0) | | |
| CDX-23.1–23.5 | | |
| CDX-24.1–24.5 | | |

### C2 Regression (must all still pass)
| Row | Verdict | Evidence |
|---|---|---|
| lint / typecheck / full test / build — exit 0, pass counts pasted | | |
| `test:e2e -- --maya-shadcn-only`, `test:e2e:maya-real`, `test:e2e:maya-approval-lifecycle` | | |
| 8-case DOM/API parity (customer, amount, lines, verdict, reason, routing) | | |
| Full S1 lifecycle: review → approve → live email `delivered` → CFO reset → back to pending; fresh screenshots | | |
| S7 partial: both email buttons render, gated pre-approval | | |
| No invented values; unknown/missing → explicit unavailable state | | |
| CDX-1..12 stay green (spot-check: investigation steps > 0 all 8 cases; business evidence titles; mic-first start; 7/7 pill in authoritative mode) | | |
| Committed + clean `git status`; one logical commit per CDX group | | |
| Regenerate the 12-file visual evidence package + update its manifest | | |

**State note:** Claude's bug reproduction approved S2 and reset it via CFO `demo-reset` (`deletedRecordCount: 1`, `preservedSourceData: true`). All 8 cases are `pending_human`; no cleanup owed.

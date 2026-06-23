# Maya 12-Beat Mockup Index

Status: visual storyboard reference set for owner review and later frontend visual audit.

Purpose: this closes the gap between the 12-beat Maya storyboard and the earlier 3 directional master mockups. The 3 master mockups still define the visual direction, but this folder now provides one raster frame per storyboard beat.

Folder:

`mockups/imagegen/maya-12-beat-storyboard/`

Contact sheet:

`mockups/imagegen/maya-12-beat-storyboard/contact-sheet.png`

Important caveat: all generated text, numbers, record IDs, customer labels, dates, and state labels are non-authoritative. These images are visual anatomy only. Runtime implementation must bind all business truth from backend/read-model data.

## Frame Map

| Beat | File | Story State | Primary UI Pattern | Review Notes |
|---:|---|---|---|---|
| 1 | `01-login-maya-enters-recoup.png` | Maya enters Recoup | Centered shadcn login `Card` with persona option set | Good anchor for secure demo login. |
| 2 | `02-workspace-morning-run-summary.png` | Morning workspace summary | Light-first shell, mini KPI strip, source strip, worklist, empty detail | Replaces the initial dark drift; use as landing reference. |
| 3 | `03-worklist-recommended-action.png` | Maya scans prioritized cases | Dense worklist table with recommended-action tooltip | Strong reference for the advisory agent icon pattern. |
| 4 | `04-case-overview-crestline-opens.png` | Crestline case opens | Worklist rail plus selected case overview/tabs | Useful for transition from worklist to case. |
| 5 | `05-evidence-dossier-pod-reviewed.png` | Maya reviews POD evidence | Evidence-first case view with deterministic basis/provenance side panel | Strongest detailed case reference. |
| 6 | `06-query-dock-start.png` | Maya opens query dock | Right-side `Sheet`, case-bound query, evidence remains visible | Regenerated to keep Recoup/Crestline context. |
| 7 | `07-agent-trace-in-progress.png` | Agentic trace in progress | Trace steps beside evidence, bounded tool/service labels | Regenerated to avoid legal/payroll product drift. |
| 8 | `08-cited-answer-returned.png` | Cited answer returns | Answer card plus citation badges and evidence table | Good cited-answer anatomy; brand text is visual-only. |
| 9 | `09-draft-review-recovery-packet.png` | Recovery draft review | Draft packet, evidence, HITL warning, approval entry point | Strong HITL/draft-only reference despite generated labels. |
| 10 | `10-human-approval-dialog.png` | Human approval gate | `AlertDialog` over draft review with human note/actions | Strong approval-gate reference. |
| 11 | `11-audit-confirmation.png` | Audit confirmation | Backend audit hash metadata and next-case action | Strong audit-state reference. |
| 12 | `12-return-to-worklist-next-case.png` | Return to worklist | Updated worklist, audit toast, next recommended case | Regenerated to restore Recoup branding. |

## How To Use These Mockups

Use these images for:

- stakeholder review of Maya's full narrative arc
- implementation visual audit
- checking whether each beat has a screen-level design direction
- aligning shadcn component composition before code

Do not use these images for:

- authoritative copy
- authoritative record IDs
- authoritative amounts
- proof that a backend field exists
- permission to compute business state in React

## Visual Direction Hierarchy

| Artifact | Role |
|---|---|
| `maya-shadcn-worklist-first-2026-06-23.png` | Master direction for landing/worklist density. |
| `maya-shadcn-evidence-first-2026-06-23.png` | Master direction for selected case/evidence/provenance. |
| `maya-shadcn-query-dock-forward-2026-06-23.png` | Master direction for case-bound query sheet. |
| `maya-12-beat-storyboard/*.png` | Beat-by-beat narrative coverage. |
| `maya-12-beat-storyboard/contact-sheet.png` | Fast review overview of the full 12-frame sequence. |

## Acceptance Notes

The set is acceptable for storyboard review if:

- every beat has a corresponding image
- the sequence reads login -> worklist -> selected case -> evidence -> query -> trace -> answer -> draft -> approval -> audit -> return
- Recoup feels evidence-led, not chat-led
- approval remains visibly human-gated
- audit appears only after the human decision
- implementation notes continue to treat image text as non-authoritative

The set is not sufficient for implementation by itself. Implementation still requires the frontend system design, shadcn component map, backend/read-model contracts, and tests.

# Recoup v1.2 Design Targets

Status: target/reference inventory with current runtime gate notes. Runtime screens now exist for the active desktop demo, but this file remains the index for approved visual cues and score ownership.

Source of truth: `docs/Agentic_O2C_Persona_Journey_v1_2.md` sections 4-8. SDD section 11 is superseded for cockpit UX.

## Mockup Assets

| Asset | Purpose | Source |
|---|---|---|
| `mockups/recoup-v12-screenbook.html` | Screen inventory/wireframe covering every Maya, David, and CFO screen target. This is not the premium visual target. | Token-compliant code-native wireframe |
| `mockups/recoup-v12-screenbook.css` | Shared wireframe styling consuming `tokens.css` only. | Token-compliant code-native wireframe |
| `mockups/imagegen/maya-forensics-journey.png` | Raster look-and-feel cue for Maya M1-M5 density, evidence, dock, and audit posture. | `gpt-image-2` API via imagegen CLI |
| `mockups/imagegen/david-credit-arbitration.png` | Raster look-and-feel cue for David D1-D4 credit arbitration and Risk Mesh. | `gpt-image-2` API via imagegen CLI |
| `mockups/imagegen/david-command-center-dark.png` | Raster look-and-feel cue for David D5, the only dark-mode surface. | `gpt-image-2` API via imagegen CLI |
| `mockups/imagegen/cfo-executive-readout.png` | Raster look-and-feel cue for CFO executive summary. | `gpt-image-2` API via imagegen CLI |

Raster cues are the premium look-and-feel references for the runtime build. Some in-image text and data are model-invented; canonical copy, record IDs, dollars, provenance, and status values must come from `docs/Agentic_O2C_Persona_Journey_v1_2.md`, this screen inventory, and deterministic read models. Do not pixel-diff implementation against generated images. Use the scorecard from the goal for mockup-vs-build review, and reserve screenshot pixel diffs for browser baseline regression after approval.

## Screen Inventory

| ID | Persona | Route target | HTML anchor | Imagegen cue | Required v1.2 components | Approval |
|---|---|---|---|---|---|---|
| M1 | Maya | `/forensics` | `#m1-worklist` | `maya-forensics-journey.png` | ToolStatusRail, scenario cards, confidence bands, per-record NBA | Runtime `4/5 PASS` |
| M2/M3 | Maya | `/forensics/:scenario` or right detail state | `#m2-m3-evidence-dock` | `maya-forensics-journey.png` | Evidence Dossier, MultimodalDock, citation chips, sub-agent spawn | Runtime `4/5 PASS` for `/forensics`; Realtime route auth is Maya-only patched |
| M4 | Maya | `/run` or trace drawer | `#m4-trace` | `maya-forensics-journey.png` | AgentTraceVisualizer, audit verify chip | Runtime `4/5 PASS` after reviewer `Curie`; residual boxed/source-state/event-label polish is non-blocking |
| M5 | Maya | `/forensics/:scenario/decision` or inline approval state | `#m5-decision-routing` | `maya-forensics-journey.png` | HITL action gate, AuditVerifyChip, routing controls | Runtime `4/5 PASS` inside `/forensics`; durable finality remains backlog |
| M6 | Maya | containment handoff state | `#m6-containment` | `maya-forensics-journey.png` | Behavioral containment handoff, cited R-score pattern, Risk Mesh feed | Pending backend/read-model |
| D1 | David | `/credit` | `#d1-sentinel` | `david-credit-arbitration.png` | Sentinel alert, Account-360, drift sparkline, bureau banner | Runtime `4/5 PASS` |
| D2 | David | `/credit/scoring` or score state | `#d2-scoring` | `david-credit-arbitration.png` | Partial-hold scoring visualizer, deterministic split, sensitivity | Runtime `4/5 PASS` inside `/credit` |
| D3 | David | `/credit/negotiation` or graph state | `#d3-negotiation` | `david-credit-arbitration.png` | NegotiationGraph, A2A timeline, P&L weights, provenance label | Runtime `4/5 PASS` inside `/credit` |
| D4 | David | `/credit/terms` or execute state | `#d4-terms` | `david-credit-arbitration.png` | Draft-only terms packet, HITL actions, no ERP write-back | Runtime `4/5 PASS` inside `/credit` |
| D5 | David | `/credit/command` or monitoring state | `#d5-command` | `david-command-center-dark.png` | Dark command centre, ToolStatusRail, monitoring signals | Runtime `4/5 PASS` |
| CFO | CFO | `/cfo` | `#cfo-readout` | `cfo-executive-readout.png` | Read-only metrics, audit posture, open dependencies, provenance | Runtime `4/5 PASS` |

## Design Rules

- Tokens only: `tokens.css` and `tokens.json` remain the palette, type, spacing, radius, elevation, and status source.
- Light-first. Dark mode is scoped only to D5 Command Centre.
- No model-computed dollars. UI displays deterministic read-model values only.
- Synthetic sources must render as synthetic, never live.
- Realtime/cited answers must carry matching voice/text record IDs before display or speech.
- Cards are only for individual panels or repeated items; no nested cards inside cards in the runtime build.
- Phosphor/lucide-style icons may be used in runtime buttons, but the HTML mockup keeps symbols text-native to avoid introducing a new icon dependency in reference artifacts.

## Imagegen Prompt Provenance

Prompts used for the raster cues are recorded in `mockups/imagegen/recoup-v12-cues.jsonl`.

# Maya Login To Eight Cases Judge Journey

**Purpose:** Give the presenter a judge-ready walkthrough for Maya's Deduction Forensics flow, from login to the eight scenario cards she must handle.

**Data anchor:** This journey uses the canonical seed-42 settlement run: 20 deduction lines, 8 scenario cards, $112,400 total scope, 7 valid lines routed to Billing, and 13 invalid/partial lines routed to Recovery. The case facts are derived from `docs/Agentic_O2C_Persona_Journey_v1_2.md` and `src/adapters/syntheticData.ts`.

## 1. One-Minute Product Story

Maya is a senior deductions analyst at NorthBay Brands. Her job is not to stare at twenty raw deduction rows and guess which ones to chase. Recoup turns the settlement run into eight evidence-backed case cards, separates valid deductions from recovery opportunities, lets Maya interrogate each case with a cited query agent, and keeps every external action human-approved and audit-ready.

Narration:

> "Maya starts with a controlled analyst login. The workspace opens into a read-only deductions cockpit: source readiness at the top, a worklist on the left, and an evidence-backed case workspace on the right. The system has already compressed twenty settlement lines into eight business cases. The agent can retrieve, reason, draft, and hand off, but it cannot invent dollars, decide unsupported claims, or write back to ERP. Maya stays the approver."

## 2. Screen Journey Map

```text
Login
  |
  v
Forensics Workspace
  |
  +--> Source readiness: SAP / Supabase proxy / MCP / docs / TPM / bureau
  |
  +--> Worklist: 8 scenario cards from 20 settlement lines
  |
  +--> Case workspace
        |
        +--> Overview: business verdict, amount read-only, positive/negative case signal
        +--> Evidence: invoices, POD, TPM, contracts, carrier reports, source details
        +--> Agent Trace: business-readable retrieval and handoff timeline
        +--> Query: cited chat answer from selected evidence scope
        +--> Draft: recovery or Billing draft, still human-gated
        +--> Audit: deterministic basis and receipt state
```

## 3. Login And Opening Beat

| Step | What Maya Does | What Judges Should Notice | Narrator Line |
|---|---|---|---|
| Login | Maya enters the assigned demo credentials and opens the Forensics workspace. | Login is a governed access point, not a persona toy screen. The product presents workspace access and evidence controls. | "This is not a chatbot landing page. It is a governed analyst workspace." |
| Workspace load | Maya lands on the Forensics worklist. | Source readiness appears immediately from saved health snapshots; any unavailable source fails closed instead of pretending to be live. | "Before Maya touches a case, the cockpit tells her which systems are ready and which are not." |
| Worklist scan | Maya sees 8 fetched cases. | The left side is the queue; the right side is the selected case. Valid deductions are shown as positive cases, not hidden as failures. | "Recoup reduces the run from twenty raw deductions to eight business decisions." |
| First case click | Maya opens a case row. | The case header, amount, lines, verdict, evidence count, and action state are backend/read-model fields. | "The UI formats the facts, but the backend owns the facts." |

## 4. How To Narrate The Eight Cases

Use this section as the judge script. Each row gives a crisp story, the business action, and the proof angle to show on screen.

| Case | Customer | Scope | Verdict / Route | Evidence Hook | Judge Narration |
|---|---:|---:|---|---|---|
| **S1 - Damaged Goods Accepted** | Greenleaf Naturals | 3 lines / $8,200 | Valid / Billing | `PHOTO-CARRIER-*`, `INV-S1-*` | "This is a positive case. Greenleaf supplied damage photos and carrier evidence, so Maya should not waste time pursuing recovery. Recoup labels it valid and routes it to Billing for the correct credit handling." |
| **S2 - Promo Billed At List** | Crestline Grocery | 2 lines / $14,600 | Valid / Billing | `TPM-CONTRACT-*`, `INV-S2-*` | "This is another valid deduction, but it is operationally important. The customer had an approved promotion and the invoice was billed at list. Maya accepts the deduction and routes a draft root-cause note to Billing so the leak does not repeat." |
| **S3 - Shortage Challenged By POD** | Crestline Grocery | 4 lines / $21,300 | Invalid / Recovery | `POD-SIGNED-*`, `INV-S3-*` | "This is the hero recovery case. Crestline claims a shortage, but the signed POD shows full delivery. Maya can ask the query agent for the exact cited proof and then stage recovery, still behind human approval." |
| **S4 - OTIF Fine Accepted** | ValuMart Club | 2 lines / $9,800 | Valid / Billing | `SLA-CONTRACT-*`, `INV-S4-*` | "Here the contract allows the compliance fine. Recoup prevents a false-positive recovery attempt. This matters because recovering valid deductions damages customer trust and creates downstream noise." |
| **S5 - OTIF Fine Disputed** | ValuMart Club | 3 lines / $12,700 | Invalid / Recovery | `POD-TIMESTAMP-*`, `INV-S5-*` | "This looks similar to S4, but the evidence changes the answer. The 3PL timestamp contradicts the fine, so Recoup routes it to recovery with timestamp evidence." |
| **S6 - Pricing Below Contract** | Crestline Grocery | 2 lines / $18,400 | Invalid / Recovery | `PRICE-CLAUSE-*`, `INV-S6-*` | "Crestline deducted below the contracted price. Maya can show the contract clause and invoice citation, then stage a recovery package without the model computing or editing any dollar amount." |
| **S7 - Promo Overclaim** | Harbor Foods | 2 lines / $15,900 | Partial / Recovery | `TPM-ACCRUAL-*`, `INV-S7-*` | "Harbor has a real promo basis, but the claim exceeds the approved TPM accrual. Recoup marks the nuance: partial verdict, recovery route. This is not a binary valid/invalid toy example." |
| **S8 - Duplicate Already Credited** | Harbor Foods | 2 lines / $11,500 | Invalid / Recovery | `CREDIT-MEMO-*`, `INV-S8-*` | "The customer has already received credit. Recoup detects the duplicate pattern and gives Maya the cited evidence to pursue recovery or close the duplicate cleanly." |

## 5. Recommended Judge Demo Order

Do not walk all eight cases with equal time. Show the breadth quickly, then go deep on three contrasting cases.

| Demo Beat | Case | Why This Beat Matters | Suggested Action |
|---|---|---|---|
| 1 | Login | Establish governed access. | Login and call out read-only controls. |
| 2 | Worklist | Establish scale reduction. | Point to 20 lines collapsed into 8 cases. |
| 3 | S2 | Positive case and Billing loop. | Show "Valid deduction" and explain prevention of repeat billing leakage. |
| 4 | S3 | Main recovery hero. | Open Evidence, ask Query, show cited answer, show Agent Trace. |
| 5 | S5 or S6 | Similar-looking case with different evidence. | Show how the verdict changes based on timestamp or contract clause. |
| 6 | S7 | Nuanced partial case. | Explain that the product handles partial/overclaim logic, not just yes/no. |
| 7 | S8 | Duplicate control. | Show duplicate/credit memo proof and Recovery routing. |
| 8 | Audit / Draft | Trust close. | Show human gate, draft-only action, deterministic basis, and audit receipt state. |

## 6. Case-Specific Talk Tracks

### S1 - Greenleaf Valid Damage Deduction

Narrator line:

> "This is the first important trust signal: Recoup does not chase every deduction. Greenleaf has damage evidence, so the correct action is to accept and route to Billing."

Show:

- Worklist valid signal.
- Evidence tab with photo/carrier proof if available.
- Billing route, not recovery.

Judge takeaway:

- Positive cases are visible.
- The system avoids wrongful recovery.
- The agent supports analysts without turning every case into a dispute.

### S2 - Crestline Valid Promo Billed At List

Narrator line:

> "Crestline had a valid promotion, but NorthBay billed at list. Maya accepts the deduction and uses the Billing loop so the same preventable leak does not happen again."

Show:

- Valid deduction signal.
- TPM contract and invoice evidence.
- Route to Billing draft.

Judge takeaway:

- Valid does not mean ignored.
- The product closes the operational feedback loop.
- Business value includes preventing future deductions, not only recovering old ones.

### S3 - Crestline Shortage With Full Signed POD

Narrator line:

> "This is where Maya earns recovery. The customer says shortage; the signed POD says full delivery. Maya asks the agent for the evidence language, gets a cited answer, then stages recovery behind approval."

Show:

- Open S3.
- Evidence: `POD-SIGNED-*` and invoice records.
- Query prompt: "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?"
- Agent Trace: retrieve, reason, draft/handoff, cited answer.
- Draft and approval gate.

Judge takeaway:

- Real agentic workflow: retrieve, reason, hand off, cite.
- The answer is grounded in selected records.
- External action remains human-gated.

### S4 - ValuMart Valid OTIF Compliance Fine

Narrator line:

> "ValuMart's fine is valid under the contract SLA. Recoup protects NorthBay from an embarrassing false dispute."

Show:

- Valid verdict.
- Contract/SLA evidence.
- Billing/acceptance route.

Judge takeaway:

- The system respects customer contracts.
- It distinguishes evidence-backed acceptance from recovery opportunity.

### S5 - ValuMart OTIF Fine Contradicted By Timestamp

Narrator line:

> "This looks like S4, but the 3PL timestamp changes the outcome. The fine is contradicted by delivery evidence, so Maya has a recovery case."

Show:

- Compare S4 and S5 at worklist level.
- Evidence: `POD-TIMESTAMP-*`.
- Recovery routing.

Judge takeaway:

- Similar business labels do not force the same decision.
- Evidence drives verdict, not a generic scenario name.

### S6 - Crestline Pricing Below Contract

Narrator line:

> "This is a pricing chargeback below contract. The model does not compute the amount; code and read models own the amount. The agent helps explain the cited contract basis."

Show:

- Amount read-only card.
- `PRICE-CLAUSE-*` and invoice citations.
- Query or evidence explanation.

Judge takeaway:

- Dollars are deterministic.
- Contract basis is cited.
- Crestline pattern supports later containment/risk-mesh discussion.

### S7 - Harbor Promo Overclaim

Narrator line:

> "Harbor has a legitimate promo basis, but the claim exceeds the approved accrual. Recoup preserves that nuance with a partial verdict and a recovery route."

Show:

- Partial verdict.
- TPM accrual evidence.
- Recovery route with human gate.

Judge takeaway:

- The product handles nuanced overclaim logic.
- It avoids blunt valid/invalid simplification.
- Harbor's stressed profile can connect to David's credit story later.

### S8 - Harbor Duplicate Already Credited

Narrator line:

> "This is duplicate leakage: the customer has already received credit. Maya can close the loop with credit memo proof instead of arguing from memory or spreadsheets."

Show:

- Duplicate/credit memo evidence.
- Recovery action or closeout path.
- Audit basis.

Judge takeaway:

- The product detects repeat payment leakage.
- Evidence is easy to retrieve.
- The close is audit-ready.

## 7. Five Query Prompts To Use Live

Use these when judges ask whether the agent is doing real work. Each prompt is designed to produce a cited, scoped answer.

| Query | Best Case | Why Use It |
|---|---|---|
| "The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it?" | S3 | Demonstrates customer-facing recovery language with POD citations. |
| "What should I tell my manager before I ask for approval on the recovery draft?" | S3 / S6 | Produces a manager-ready evidence summary. |
| "Is this a billing correction or a recovery pursuit, and what proof drives that route?" | S2 / S3 | Contrasts positive Billing route with recovery route. |
| "What cited evidence would make this a valid deduction, and which selected records show this case does not meet that pattern?" | S3 / S5 / S6 | Shows counterfactual reasoning without inventing facts. |
| "Are any source systems, citations, or approval receipt fields missing or stale, and what should Maya do next without writing back to ERP?" | Any selected case | Shows source health, fail-closed behavior, and no ERP write-back. |

## 8. Judge Questions And Answers

| Judge Question | Short Answer |
|---|---|
| "Is this just a chatbot over AR data?" | "No. The chatbot is only one surface. The core is a deterministic deduction read model, evidence retrieval, rule-backed verdicts, guarded agent handoffs, and human-approved draft actions." |
| "Can the model invent recovery dollars?" | "No. Dollars are code/read-model owned. The agent can explain and draft from citations, but it cannot compute or mutate business amounts." |
| "What happens when a source is down?" | "The tile fails closed as probe failed, refresh overdue, or unavailable. The UI does not silently relabel missing sources as live." |
| "Why show valid deductions?" | "Because a good deductions product must avoid false recovery. S1, S2, and S4 are positive cases that protect customer trust and route issues correctly." |
| "Where is the multi-agent part?" | "Forensics retrieves and reasons over selected evidence, Recovery Drafter prepares draft-only recovery language, MCP/source tools provide governed reads, and Agent Trace exposes the handoff and receipts." |
| "Who approves action?" | "Maya. Every recovery, billing route, outreach, or approval-affecting step remains human-gated." |

## 9. Suggested Five-Minute Narration

```text
0:00 - 0:30  Login and source readiness
              "Governed workspace, read-only evidence, source status visible."

0:30 - 1:00  Worklist
              "Twenty settlement lines are grouped into eight cases worth $112,400."

1:00 - 1:45  Positive case S2
              "Valid deduction, Billing route, prevention loop."

1:45 - 3:15  Hero recovery S3
              "Signed POD contradicts shortage claim. Ask the agent. Show cited answer and trace."

3:15 - 4:00  Nuance S7 or duplicate S8
              "Partial overclaim or duplicate already credited; not a simple binary classifier."

4:00 - 5:00  Draft, approval, audit
              "The agent drafts, Maya approves, and the audit basis is deterministic and cited."
```

## 10. What Not To Say

- Do not say the agent "decides the dollars." Say code/read models own dollars.
- Do not say the product writes back to SAP. Say draft-only and human-gated.
- Do not call unavailable source data live. Say fail-closed source state.
- Do not present Supabase proxy data as direct SAP when the tile says proxy.
- Do not hide valid deductions; they are part of the trust story.
- Do not over-explain backend IDs in the primary narration. Use them only when showing provenance/source details.

## 11. Closeout Line

> "Recoup gives Maya a premium analyst cockpit: eight evidence-backed business cases, cited agent reasoning, visible source health, and human-gated action. The model helps decide what to inspect and how to explain it; code and evidence own the dollars, verdict basis, and audit trail."

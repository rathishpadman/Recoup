# Maya Real-Backend MCP Query Results

Date: 2026-06-26

Command:

```powershell
npm.cmd run test:e2e:maya-real
```

Last observed result: PASS.

The harness started a clean cockpit server, recorded backend calls through the real-backend E2E proxy, exercised five Maya query scenarios, and finished with:

```text
Maya real-backend E2E passed against http://127.0.0.1:4319; query scenarios: 5; backend trace rows: 50
```

Local source readiness during the run:

| Source | State |
|---|---|
| MCP | Connected |
| SAP OData | Probe failed |
| TPM | Synthetic |
| 3PL POD | Synthetic |
| Bureau | Synthetic |
| Remittance / EDI | Synthetic |
| Contract Repo | Synthetic |

The local SAP OData health probe was blocked, but the live query responses still returned selected-evidence `query.answer` tool output with `sap_odata` provenance from the governed source snapshot. This distinction is intentional: source health can fail closed while already-governed selected evidence remains auditable.

## Scenario Results

| # | Scenario | Question | Duration | MCP tool log | Agent trace proof | Deterministic basis |
|---:|---|---|---:|---|---|---|
| 1 | `customer-dispute-response` | The customer says this was a valid shortage deduction. Which cited proof can I use to challenge it? | 8666 ms | `agent_tool_start query.answer -> agent_tool_end query.answer` | `Forensics Investigator -> query.answer(sap_odata) -> Recovery Drafter`; 10 trace rows | `runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace` |
| 2 | `manager-approval-brief` | What should I tell my manager before I ask for approval on the recovery draft? | 5862 ms | `agent_tool_start query.answer -> agent_tool_end query.answer` | `Forensics Investigator -> query.answer(sap_odata) -> Recovery Drafter`; 10 trace rows | `runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace` |
| 3 | `billing-vs-recovery-route` | Is this a billing correction or a recovery pursuit, and what proof drives that route? | 15592 ms | `agent_tool_start query.answer -> agent_tool_end query.answer` | `Forensics Investigator -> query.answer(sap_odata) -> Recovery Drafter`; 10 trace rows | `runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace` |
| 4 | `handoff-hitl-draft-gate` | Using only this selected evidence packet, have Forensics hand off to Recovery Drafter and confirm whether the recovery draft remains human-approval-gated. Which cited record IDs support that? | 9604 ms | `agent_tool_start query.answer -> agent_tool_end query.answer` | `Forensics Investigator -> query.answer(sap_odata) -> Recovery Drafter`; 10 trace rows | `runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace` |
| 5 | `valid-deduction-counterfactual` | What cited evidence would make this a valid deduction, and which selected SAP or document records show that this case does not meet that valid-deduction pattern? | 17888 ms | `agent_tool_start query.answer -> agent_tool_end query.answer` | `Forensics Investigator -> query.answer(sap_odata) -> Recovery Drafter`; 10 trace rows | `runForensicsInvestigation + evidence source reads + deterministic hook audit trace + OpenAI Agents SDK live trace` |

## Shared Query Output Properties

All five responses used selected line `S3-L1`, returned the deterministic answer from backend code, and cited the selected evidence set including:

```text
S3-L1, POD-SIGNED-1, INV-S3-1, SAP-90000000, INV-90000000, TOOLS-DATA:S3, USCU_L10, S3-L2, POD-SIGNED-2, INV-S3-2, S3-L3, POD-SIGNED-3, INV-S3-3, S3-L4, POD-SIGNED-4, INV-S3-4, SAP-C_BillingDocumentItemFs:90000000, DOC-S3-L1
```

Every scenario included these live MCP trace rows:

```text
Forensics Investigator | agent_tool_start | query.answer | retrievalSource=agent_trace | sourceKind=agent_trace
Forensics Investigator | agent_tool_end   | query.answer | retrievalSource=sap_odata   | sourceKind=sap_odata
```

Every scenario also included the required handoff:

```text
Forensics Investigator | agent_handoff | Handoff to Recovery Drafter | nextAgentName=Recovery Drafter
```

## Fixes Made While Closing This Gate

- Evidence Dossier real-backend assertions now expand business evidence groups before counting document rows.
- Evidence Dossier real-backend assertions now open Source details before checking backend record IDs.
- Query Dock no longer shows raw backend record IDs in the compact selected-evidence context; raw IDs remain behind Source details.
- Audit real-backend assertions now expand Audit receipt details before checking backend contract gaps.

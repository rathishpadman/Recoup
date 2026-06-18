# Recoup v2 — System Design (Diagram Set)

Standalone visual companion to the SDD. Each diagram names the invariants/criteria it makes legible. Renders as Mermaid. Binds to `RECONCILIATION_LEDGER.md`, `OPENAI_STACK_DOSSIER.md`, `INVARIANTS.md`, `Recoup_v2_SDD.md`.

---

## 1. System context

External systems are **read-only**; the only outbound path to SAP is a **draft** with no write-back (I-26).

```mermaid
flowchart LR
  subgraph Personas
    Maya["Maya R.<br/>Deductions Analyst"]
    David["David K.<br/>Credit Director"]
    CFO["CFO / Finance"]
    Aud["Internal Audit"]
  end
  subgraph Recoup["Recoup v2 — modular monolith"]
    APP["Capabilities A B C D<br/>+ HITL + Audit"]
  end
  subgraph Sources["Systems of record (read-only)"]
    SAP["SAP S/4HANA OData"]
    DOC["Document repository"]
    TPM["Trade Promotion Mgmt"]
    EDI["Remittance / EDI"]
    BUR["Credit bureau / news"]
  end
  Maya -->|"review / approve"| APP
  David -->|"arbitrate / approve"| APP
  CFO -->|"read summary"| APP
  Aud -->|"inspect trail"| APP
  SAP -->|"retrieve"| APP
  DOC -->|"retrieve"| APP
  TPM -->|"retrieve"| APP
  EDI -->|"ingest"| APP
  BUR -->|"ingest"| APP
  APP -.->|"draft only — no write-back (I-26)"| SAP
```

---

## 2. Container / layer view

The modular monolith with hexagonal ports. Agents never compute money (I-1); everything routes through the deterministic core and the HITL gate.

```mermaid
flowchart TB
  subgraph Cockpit["Cockpit (3 surfaces)"]
    F["Forensics (Maya)"]
    Cc["Credit / Arbitration (David)"]
    Sm["CFO summary (read-only)"]
    Q["Conversational query<br/>text + gpt-realtime-2 voice"]
  end
  SVC["Service layer<br/>whitelisted tools · approvals · query · audit read (I-15)"]
  subgraph Agents["Agent layer — OpenAI Agents SDK (TS)"]
    AF["Forensics"]
    AR["Recovery Drafter"]
    AM["Risk-Mesh Supervisor"]
    AS["Sentinel"]
    AC["Containment / Intent"]
    AQ["Query"]
  end
  HITL["HITL approval gate<br/>analyst → lead → finance · SoD (I-8,I-20)"]
  CORE["Deterministic core<br/>expected · rules · graph · risk · arbitration · partialHold (I-1)"]
  PORT["Adapters / ports — read-only (I-12,I-26)"]
  AUDIT["Immutable hash-chained audit (I-9)"]
  Cockpit --> SVC
  SVC --> Agents
  SVC --> HITL
  Agents -->|"calls — no math"| CORE
  Agents --> HITL
  CORE --> PORT
  Agents -.-> AUDIT
  CORE -.-> AUDIT
  HITL -.-> AUDIT
```

---

## 3. Agent interaction (handoffs + agents-as-tools)

TS-stable orchestration only; subagents deferred (Dossier §4). The Risk Mesh is the integrator.

```mermaid
flowchart LR
  subgraph Bcap["B · Deduction Forensics"]
    AF["Forensics Investigator"]
    AR["Recovery Drafter"]
  end
  subgraph Ccap["C · Credit Sentinel"]
    AS["Sentinel"]
  end
  subgraph Dcap["D · Behavioral Containment"]
    AC["Containment / Intent"]
  end
  subgraph Acap["A · Risk Mesh"]
    AM["Risk-Mesh Supervisor"]
  end
  AQ["Conversational Query"]
  CORE["Deterministic core"]
  AF -->|"handoff: invalid / partial"| AR
  AF -->|"gaming pattern"| AC
  AS -->|"credit position"| AM
  AC -->|"intent + partial-hold score"| AM
  AM -->|"agents-as-tools: gather positions"| AS
  AF -->|"compute"| CORE
  AR -->|"compute"| CORE
  AS -->|"R-score / drift"| CORE
  AC -->|"gaming gate / partialHold"| CORE
  AM -->|"arbitration score"| CORE
  AQ -->|"cited reads"| CORE
```

---

## 4. Sequence — Maya · Deduction Forensics run (B)

```mermaid
sequenceDiagram
  participant Maya
  participant Cockpit
  participant FA as Forensics
  participant Core
  participant Ports
  participant RD as RecoveryDrafter
  participant HITL
  participant Audit
  Cockpit->>FA: settlement run, 20 lines
  FA->>Ports: retrieve POD, contract, promo
  Ports-->>FA: canonical evidence
  FA->>Core: compute expected, delta, rules
  Core-->>FA: findings + corroboration
  FA->>FA: classify valid / invalid / partial (cited, I-17 I-18)
  FA->>RD: handoff invalid + partial, 13 lines $79.8K
  RD->>Core: build packets, clamp to delta (I-6)
  FA->>HITL: valid 7 lines $32.6K routeBilling (draft, I-23)
  RD->>HITL: recovery drafts
  Maya->>HITL: approve / modify / reject (SoD, I-8)
  HITL->>Audit: hash-chained entries (I-9)
  Note over HITL,Audit: nothing dispatched without a human (I-7 I-20)
```

---

## 5. Sequence — David · Risk Mesh + partial hold + Sentinel (A·C·D)

```mermaid
sequenceDiagram
  participant David
  participant Cockpit
  participant Sent as Sentinel
  participant Mesh as RiskMesh
  participant Core
  participant HITL
  participant Audit
  Sent->>Core: R-score + R-drift (Harbor)
  Core-->>Sent: drift event, DSO 32 to 51, lien
  Cockpit->>Mesh: $640K over-limit conflict
  Mesh->>Sent: agents-as-tools, credit position
  Sent-->>Mesh: hold + revised-terms proposal
  Mesh->>Core: arbitration score (expert weights)
  Mesh->>Core: partialHold composite to ratio
  Core-->>Mesh: 51.25 to 55% (deterministic, I-24)
  Mesh->>HITL: ranked options + back-order + draft terms
  David->>HITL: adjust weights in bands, approve
  HITL->>Audit: inputs + weights + resolution (I-21)
  Note over Sent,Mesh: continued drift re-opens the Mesh (closed loop)
```

---

## 6. HITL approval flow (cross-cutting)

```mermaid
flowchart LR
  P["Proposed action (draft)"] --> R{"Authority level"}
  R -->|"within analyst"| A["Analyst inbox"]
  R -->|"escalate"| L["Lead inbox"]
  R -->|"finance threshold"| Fi["Finance inbox"]
  A --> D{"Approve / modify / reject"}
  L --> D
  Fi --> D
  D -->|"approve"| X["Human-confirmed execution"]
  D -->|"modify"| P
  D -->|"reject"| Z["Closed, logged"]
  X --> AU["Audit entry"]
  Z --> AU
  D -.->|"proposer != approver (I-8)"| AU
```

---

## 7. Closed-loop interaction (C → A → D → execute → C)

```mermaid
flowchart LR
  C["C Sentinel<br/>re-underwrite (R-score / drift)"] -->|"drift breach"| A["A Risk Mesh<br/>arbitrate"]
  A -->|"needs intent"| D["D Containment<br/>gaming vs honest"]
  D -->|"intent + partial-hold"| A
  A -->|"approved action"| EX["Execute (HITL)"]
  EX -->|"new behavior observed"| C
  B["B Forensics<br/>repeat invalid"] -->|"gaming signal"| D
```

---

## 8. Data flow & port purity

Adapters return canonical entities only; the core has zero source-shaped imports (I-12). Synthetic and real SAP are interchangeable by config.

```mermaid
flowchart LR
  subgraph Sources
    SAP["SAP OData"]
    DOC["Doc repo"]
    TPM["TPM"]
    EDI["Remittance / EDI"]
    BUR["Bureau / news"]
    SYN["Synthetic (seed 42, I-13)"]
  end
  ADP["Adapters / source port"]
  CAN["Canonical entities (Zod)"]
  CORE["Deterministic core"]
  DEC["Findings + Decisions"]
  AUD["Audit"]
  COCK["Cockpit + Query"]
  SAP --> ADP
  DOC --> ADP
  TPM --> ADP
  EDI --> ADP
  BUR --> ADP
  SYN --> ADP
  ADP -->|"canonical only (I-12)"| CAN
  CAN --> CORE
  CORE --> DEC
  DEC --> AUD
  DEC --> COCK
```

---

## 9. Canonical data model (ER)

```mermaid
erDiagram
  CUSTOMER ||--o{ INVOICE : has
  INVOICE ||--o{ DEDUCTIONLINE : carries
  DEDUCTIONLINE ||--o| FINDING : yields
  FINDING ||--|| DECISION : resolves
  DECISION ||--o| RECOVERYCASE : may_open
  DECISION ||--o| CONTAINMENTACTION : may_open
  DECISION ||--o| TERMPROPOSAL : may_open
  DECISION ||--o| PARTIALHOLDDECISION : may_open
  DEDUCTIONLINE }o--o{ DELIVERYITEM : evidenced_by
  DEDUCTIONLINE }o--o{ PROMOACCRUAL : evidenced_by
  DEDUCTIONLINE }o--o{ CONTRACTTERM : evidenced_by
  CUSTOMER ||--o{ RISKSCORE : scored
  CUSTOMER ||--o{ INTENTSIGNAL : profiled
  DECISION ||--|| AUDITENTRY : writes
```

---

## 10. Diagram → rubric mapping

| Diagram | Primary rubric axis it evidences |
|---|---|
| 1 Context | Real-World Relevance; Use of OpenAI (MCP/SAP) |
| 2 Layers | Technical Excellence (architecture, separation) |
| 3 Agent interaction | Innovation (agent-to-agent), Use of OpenAI (handoffs/agents-as-tools) |
| 4–5 Sequences | Innovation + Technical Excellence (the two hero journeys) |
| 6 HITL | Technical Excellence (reliability/SoD), Real-World Relevance |
| 7 Closed loop | Innovation (closed-loop mesh) |
| 8 Data flow | Technical Excellence (port purity), Scalability |
| 9 ER | Technical Excellence (data model) |

---

*End of System Design. Next: Phase F — AGENTS.md (Codex build protocol, mining the Best-Practice file), then G — Codex Setup Guide.*

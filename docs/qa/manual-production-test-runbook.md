# Cash Application — manual production test runbook

Follow this by hand against production. Every command is copy-pasteable and every
step states what a pass looks like, so a failure is unambiguous.

- **Cockpit** `https://recoup-self-eta.vercel.app`
- **API** `https://recoup-api.onrender.com`
- **Verified against** `main @ a23df1e`, 23 Aug 2026

Steps 1–3 are setup, 4–8 are the happy path, 9–15 are the refusals, 16 is teardown.
Budget about 20 minutes.

---

## Before you start

You need two secrets. Neither is in this document.

| Secret | Where to get it |
|---|---|
| `RECOUP_INBOUND_SHARED_SECRET` | Render → `recoup-api` → Environment |
| Demo login | Log in at `/login` as `Maya` / `Welcome#123` — no secret needed for the browser half |

Set the shell up once:

```bash
export API=https://recoup-api.onrender.com
export WEB=https://recoup-self-eta.vercel.app
export SECRET='<paste RECOUP_INBOUND_SHARED_SECRET>'

# Unique per run, so you never collide with an earlier test.
export PAY="PAY-MANUAL-$(date +%s | tail -c 7)"
export MSG="MSG-MANUAL-$(date +%s | tail -c 7)"
echo "payment reference: $PAY"
```

A helper to sign a body — every write endpoint requires it:

```bash
sign() { node -e "console.log(require('crypto').createHmac('sha256',process.argv[1]).update(process.argv[2]).digest('hex'))" "$SECRET" "$1"; }
```

---

## 1. Confirm the services are up

```bash
curl -s -o /dev/null -w "api    %{http_code}\n" $API/healthz
curl -s -o /dev/null -w "web    %{http_code}\n" $WEB/login
```

**Expect** `api 200` and `web 200`.

If the API is slow to answer the first time, that is Render waking a free-tier
instance. Retry once before treating it as a failure.

---

## 2. Confirm the surface is gated

```bash
curl -s -o /dev/null -w "page   %{http_code}\n" $WEB/agent-operations
curl -s -w "api    %{http_code}  " -o /tmp/a.json $WEB/api/agent-operations; cat /tmp/a.json
```

**Expect** the page `200` but serving the **login gate** (not the workspace), and
the API **`401`** with `{"error":"Verified human cockpit auth required."}`.

> If the API returns run data here, stop. An unauthenticated caller must never
> see customer names or amounts.

---

## 3. Post the settlement receipt

Stands in for an SAP posting while D-02 is unsigned.

```bash
RCPT="{\"paymentReference\":\"$PAY\",\"customerReference\":\"CUST-001\",\"legalEntityReference\":\"LE-001\",\"amountReceived\":\"1250.00\",\"currency\":\"USD\",\"settlementStatus\":\"settled\"}"

curl -s -X POST $API/rehearsal/cash-receipt \
  -H "content-type: application/json" \
  -H "x-recoup-signature: $(sign "$RCPT")" \
  -d "$RCPT" -w "\nstatus %{http_code}\n"
```

**Expect** `201` and:

```json
{"written":true,"receiptId":"REH-PAY-MANUAL-…","sourceSystem":"rehearsal-proxy"}
```

`sourceSystem` must read **`rehearsal-proxy`**. It is stamped server-side and
cannot be overridden — try sending `"sourceSystem":"sap-odata"` and it will still
come back `rehearsal-proxy`. That is deliberate: D-02 is unsigned, so nothing
written here may present itself as authoritative settlement.

---

## 4. Send the remittance email

The CSV must have **no quoted fields** — approved CSV v1 does not permit them, so
the reason text carries no comma.

```bash
CSV="remittance_id,customer_reference,legal_entity_reference,payment_reference,currency,instructed_payment_amount,line_id,invoice_reference,instructed_amount,claimed_deduction_amount,claimed_reason_code,claimed_reason_text
REM-$PAY,CUST-001,LE-001,$PAY,USD,1250.00,LINE-1,INV-2026-0912,1000.00,250.00,DMG,two pallets arrived damaged"

B64=$(printf '%s' "$CSV" | base64 -w0)

MAIL="{\"messageId\":\"$MSG\",\"from\":\"ar@customer.example\",\"to\":\"remittance@recoup.example\",\"subject\":\"Remittance advice $PAY\",\"receivedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"attachment\":{\"filename\":\"remittance-$PAY.csv\",\"mimeType\":\"text/csv\",\"contentBase64\":\"$B64\"}}"

curl -s -X POST $WEB/api/inbound/remittance \
  -H "content-type: application/json" \
  -H "x-recoup-signature: $(sign "$MAIL")" \
  -d "$MAIL" -w "\nstatus %{http_code}\n"
```

**Expect** `202` and:

```json
{"accepted":true,"runId":"RUN-…","state":"Ready","caseId":"CASE-…"}
```

Record both IDs — you need them in step 6.

```bash
export RUN_ID='<paste runId>'
export CASE_ID='<paste caseId>'
```

> **`state` is the thing to read.** `Ready` with a `caseId` means the receipt was
> found and the allocation completed. `AwaitingCashReceipt` with `caseId: null`
> means step 3 did not land or used a different payment reference — the two must
> match exactly.

---

## 5. Log in

Open `$WEB/login` and sign in as **`Maya`** / **`Welcome#123`**.

You land on `/forensics/shadcn`. Navigate to **`/agent-operations`**.

**Expect** the workspace to render: four counters, an agent roster, a handoff
graph, a Runs table, and two right-hand panels.

---

## 6. Find your run

Locate the row for your `RUN_ID`.

**Expect all nine columns populated — no em dashes:**

| Column | Expected |
|---|---|
| Run ID | your `RUN_ID` |
| Agent | `cash_application` |
| Scenario | `AR Cash App` |
| Customer | `CUST-001` |
| Status | `Completed` |
| Queued at | timestamp |
| Started at | timestamp, at or after Queued |
| Completed at | timestamp |
| Elapsed | `00:0X` |

> An em dash in Customer or any timestamp is a regression. Those six columns were
> permanently blank before this work and are the main thing being verified.

---

## 7. Open the run details

Click the row.

**Expect** the right-hand panel to show:

```
Run ID            <your RUN_ID>
Agent             cash_application
Scenario          AR Cash App
Customer          CUST-001
Status            Completed
Started at        <timestamp>
Elapsed           00:0X
Case              <your CASE_ID>

Allocation
Short payment     250.00 USD
Validated reason  DEP
Claimed reason    DMG
Evidence          REH-…, ALLOC-…, REM-…
Cited records     <count>
[Assumed policy, not ratified]
```

Two details that matter:

- **`250.00 USD`, not `250`.** Postgres serialises the amount as a number and
  drops the cents unless it is read as text. Losing them is a real defect.
- **The assumed-policy badge must be present.** The allocation rests on demo
  policy packs, and an operator must not read the result as owner-ratified.

---

## 8. Check the ledger and the handoff graph

**Ledger** — expect six columns: Time, Specialist, Phase, Event, Outcome, Records.
Rows run oldest first and include `remittance advice accepted`, `resolving cash
receipt`, `allocated 1000.00 USD`, `live deduction case created`, `case ready for
Forensics`. Record IDs are cited (`INBOX-…`, `ATT-…`).

**Handoff graph** — every edge is drawn. Only
`Cash Application → Deduction Forensics` is emphasized, because only its durable
handoff event exists. The later two must stay faint.

**Roster** — `Cash Application` shows `Completed` with your run ID and last-run
time. The other three stay `Idle`.

---

## 9–15. The refusals

Each gate must refuse on its own. Run them in any order.

### 9. Unsigned caller

```bash
curl -s -X POST $WEB/api/inbound/remittance -H "content-type: application/json" \
  -d '{"messageId":"X"}' -w "\nstatus %{http_code}\n"
```
**Expect `401`.**

### 10. Tampered signature

```bash
curl -s -X POST $WEB/api/inbound/remittance -H "content-type: application/json" \
  -H "x-recoup-signature: $(sign 'different bytes')" \
  -d "$MAIL" -w "\nstatus %{http_code}\n"
```
**Expect `401`.**

### 11. Replay — the same message twice

```bash
curl -s -X POST $WEB/api/inbound/remittance -H "content-type: application/json" \
  -H "x-recoup-signature: $(sign "$MAIL")" -d "$MAIL" -w "\nstatus %{http_code}\n"
```
**Expect `409`** with `"reason":"replay_detected"`, and **no second run** on the
page. A provider retry must never create a duplicate.

### 12. Sender not on the allowlist

```bash
BAD=$(printf '%s' "$MAIL" | sed 's/ar@customer.example/stranger@elsewhere.example/')
curl -s -X POST $WEB/api/inbound/remittance -H "content-type: application/json" \
  -H "x-recoup-signature: $(sign "$BAD")" -d "$BAD" -w "\nstatus %{http_code}\n"
```
**Expect `403`** with `"reason":"sender_not_allowed"`.

### 13. Wrong recipient

```bash
WRONG=$(printf '%s' "$MAIL" | sed 's/remittance@recoup.example/someone-else@recoup.example/')
curl -s -X POST $WEB/api/inbound/remittance -H "content-type: application/json" \
  -H "x-recoup-signature: $(sign "$WRONG")" -d "$WRONG" -w "\nstatus %{http_code}\n"
```
**Expect `422`** with `"reason":"wrong_recipient"`.

### 14. A quoted CSV field — the format guard

Rebuild the CSV with the reason text quoted around a comma
(`"two pallets arrived damaged, POD signed short"`), a new `messageId`, and post it.

**Expect `422`** with `"reason":"mapping_failed"`.

> This is correct. Approved CSV v1 has no quoted fields, and
> `docs/demo/assets/remittance-PAY-1001.csv` is therefore **not ingestible**. The
> mapper is right; the asset is the thing that is wrong.

### 15. No receipt — the waiting path

Use a **new** payment reference and a **new** messageId, and **skip step 3**.

**Expect `202`** with `"state":"AwaitingCashReceipt"` and `"caseId":null`.
On the page the run shows **`Waiting`**, with Completed at and Elapsed correctly
blank — an unfinished run has no finish — and the Waiting counter incremented.

---

## The event stream (optional)

While logged in as Maya in the browser, open the console on `/agent-operations`:

```js
const es = new EventSource('/api/agent-operations/events');
es.onmessage = (e) => console.log(e.lastEventId, JSON.parse(e.data).phase);
```

**Expect** frames with increasing ids. Reconnecting with
`/api/agent-operations/events?cursor=<id>` resumes **after** that id — nothing
resent, nothing skipped. Unauthenticated, the same URL returns `401` before any
frame.

---

## 16. Teardown

Nothing needs deleting, and nothing can be. The cash tables grant INSERT and
SELECT and no DELETE; that append-only guarantee is worth more than a tidy table.
Test runs stay visible and are expected.

To return production to dormant when you are finished:

```
Render → recoup-api → Environment → RECOUP_CASH_KILL_INBOUND = true → Save
```

The inbound route then answers `404`, the page keeps working read-only, and any
leaked shared secret becomes worthless. Removing the variable re-opens intake.

---

## Result summary

| # | Check | Expected |
|---|---|---|
| 1 | Services up | `200` / `200` |
| 2 | Surface gated | login gate + `401` |
| 3 | Receipt posted | `201`, `rehearsal-proxy` |
| 4 | Email accepted | `202`, `Ready`, case created |
| 5 | Login | workspace renders |
| 6 | Run row | 9/9 columns, no em dash |
| 7 | Run details | case, `250.00 USD`, `DEP`, assumed badge |
| 8 | Ledger + graph | 6 columns; only first edge emphasized |
| 9 | Unsigned | `401` |
| 10 | Tampered | `401` |
| 11 | Replay | `409`, no duplicate run |
| 12 | Bad sender | `403` |
| 13 | Wrong recipient | `422` |
| 14 | Quoted CSV | `422 mapping_failed` |
| 15 | No receipt | `202 AwaitingCashReceipt`, no case |

---

## If something fails

| Symptom | Most likely cause |
|---|---|
| `404` on inbound | `RECOUP_CASH_KILL_INBOUND` is true, or the rollout stage is below `rehearsal` |
| `401` on a correctly signed body | Shell quoting altered the bytes — the signature covers the body exactly. Sign the same string you send |
| `AwaitingCashReceipt` when you expected `Ready` | Step 3 used a different payment reference, or its `201` was missed |
| `502` from inbound | Render instance waking, or a Supabase write failed. Check Render logs |
| Money shows `250` not `250.00` | Regression in the case read — the amount must be selected as text |
| Run stuck at `Queued` | A run stranded mid-flight. Should not happen: a failure now records an error and moves the run to `Review` |

## Known limits, so a pass is not over-read

- Every allocation cites a **`rehearsal-proxy`** receipt. **D-02 is unsigned** and
  AC-01 remains blocked — this is not authoritative settlement.
- The allocation and reason packs are **assumed, not ratified** (D-05, D-07, D-08).
- Candidate invoices are derived from the advice, so they cannot disagree with it.
  **AC-14 receipt/remittance mismatch cannot be exercised** until a real AR
  open-item source exists.
- **D-03 has not named a provider.** The shared-secret HMAC is a gate, not the
  approved provider signature contract.

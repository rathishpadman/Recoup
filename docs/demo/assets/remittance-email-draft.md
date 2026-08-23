# Remittance email draft

The message that starts the run. Send it to the mailbox the intake connector
watches, with `remittance-advice-PAY-1001.pdf` and `remittance-PAY-1001.csv`
attached.

Both attachments matter and they are not interchangeable. The PDF is what a
human reads. The CSV is what the mapper parses — the pipeline never reads a
number out of a PDF, because a figure lifted from a rendered document by a model
is exactly the kind of value the design forbids.

---

**From:** `ap@northwind-demo.invalid`
**To:** `remittance@<your-intake-domain>`
**Subject:** `Remittance advice — PAY-1001 — Northwind Trading Co.`
**Attachments:** `remittance-advice-PAY-1001.pdf`, `remittance-PAY-1001.csv`

---

Hi,

Please find attached our remittance advice for payment reference **PAY-1001**,
value date 21 August 2026.

We have settled invoice INV-2026-0912 less a deduction of 250.00 USD. Two
pallets on that delivery arrived damaged and the POD was signed short, so we
have raised a claim for that amount against the invoice. The supporting
photographs went to your quality team last week.

The CSV attachment carries the same detail in your requested format.

Kind regards,
Accounts Payable
Northwind Trading Co.

---

## If you want to demonstrate a failure branch instead

Change one thing and resend. Each of these lands the run somewhere different,
and the differences are visible on the Agent Operations screen:

| Change | Where the run stops |
|---|---|
| Set `claimed_reason_code` to `ZZZ` | `ReasonReview` — the code is not in the map and nothing invents a mapping |
| Remove the seeded receipt row for `PAY-1001` | `AwaitingCashReceipt` — no settlement to cite |
| Set the receipt's `settlement_status` to `pending` | No allocation — the money is not settled yet |
| Set `currency` to `EUR` on the receipt | Contract gap — no approved FX policy, so the amount is never converted |

Do not edit the CSV header. The mapper rejects any file whose header does not
match exactly, on purpose: a silently accepted column shift misallocates money.

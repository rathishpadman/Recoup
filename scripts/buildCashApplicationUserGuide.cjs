const fs = require("fs");
const path = require("path");
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat,
  Packer, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType
} = require("docx");

const SHOTS = "C:/Rathish/Root Folder/CFO/Hackathon/Recoup1/Recoup/.claude/worktrees/cash-build/docs/qa/screenshots";
const OUT = path.join(__dirname, "Cash-Application-User-Guide-v3.docx");

const MAX_W = 624;
const NAVY = "1F3B54", SLATE = "44515E", GREEN = "1A6349", AMBER = "8A5A12", RED = "8F2F2F", RULE = "D6DEE5";

function shot(file, cap, maxWidth = MAX_W) {
  const buf = fs.readFileSync(path.join(SHOTS, file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const width = Math.min(maxWidth, w);
  const out = [new Paragraph({
    spacing: { before: 160, after: 60 }, alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: buf, type: "png", transformation: { width, height: Math.round((h / w) * width) } })]
  })];
  if (cap) out.push(new Paragraph({ spacing: { after: 220 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: cap, italics: true, size: 17, color: SLATE })] }));
  return out;
}

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 140 },
  children: [new TextRun({ text: t, bold: true, size: 30, color: NAVY })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 },
  children: [new TextRun({ text: t, bold: true, size: 24, color: NAVY })] });
const p = (t, o = {}) => new Paragraph({ spacing: { after: o.after ?? 120 },
  children: [new TextRun({ text: t, size: 21, color: o.color ?? "1B242C" })] });
const rich = (runs, after = 120) => new Paragraph({ spacing: { after },
  children: runs.map((r) => typeof r === "string"
    ? new TextRun({ text: r, size: 21, color: "1B242C" })
    : new TextRun({ size: 21, color: "1B242C", ...r })) });
const bullet = (t) => new Paragraph({ numbering: { reference: "dots", level: 0 }, spacing: { after: 70 },
  children: [new TextRun({ text: t, size: 21, color: "1B242C" })] });
const stepli = (t) => new Paragraph({ numbering: { reference: "steps", level: 0 }, spacing: { after: 70 },
  children: [new TextRun({ text: t, size: 21, color: "1B242C" })] });
const mono = (t) => new Paragraph({ spacing: { after: 120 }, shading: { type: ShadingType.CLEAR, fill: "F2F5F7" },
  border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 8 } },
  children: [new TextRun({ text: t, font: "Consolas", size: 17, color: "1B242C" })] });

function callout(title, body, colour) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA }, columnWidths: [9360],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 18, color: colour },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
    },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: 9360, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: "F7FAFB" },
      margins: { top: 140, bottom: 140, left: 200, right: 200 },
      children: [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, size: 21, color: colour })] }),
        ...body.map((l) => new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: l, size: 20, color: "1B242C" })] }))
      ]
    })] })]
  });
}

function table(headers, rows, widths, fontSize = 19) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((t, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, fill: "EAF0F4" },
        margins: { top: 90, bottom: 90, left: 130, right: 130 },
        children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: fontSize, color: NAVY })] })]
      })) }),
      ...rows.map((cells) => new TableRow({ children: cells.map((c, i) => new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        margins: { top: 90, bottom: 90, left: 130, right: 130 },
        children: [new Paragraph({ children: [new TextRun({ text: c, size: fontSize, color: "1B242C" })] })]
      })) }))
    ]
  });
}

// ---- the ten scenarios ----
const SCEN = [
  ["1", "Short payment", "01-short-payment.csv", "1250.00 USD, cleared", "Completed. Case raised for 250.00 USD.", "The normal case. A deduction to investigate."],
  ["2", "Paid in full", "02-paid-in-full.csv", "1250.00 USD, cleared", "Completed. No case.", "Nothing was deducted, so there is nothing to investigate."],
  ["3", "Sent twice", "03-duplicate-delivery.csv", "1250.00 USD, cleared", "One payment on screen, not two.", "Send it, then send the identical note again. A duplicate must not create a second case."],
  ["4", "Money not arrived", "04-no-receipt.csv", "none — skip the confirmation", "Waiting. No case.", "The note arrived before the money. The system waits rather than guessing."],
  ["5", "Payment not cleared", "05-receipt-pending.csv", "1250.00 USD, not cleared", "Waiting. No case.", "Money is showing but has not cleared. Not good enough to act on."],
  ["6", "Confirmation too old", "06-receipt-too-old.csv", "1250.00 USD, cleared, 24h old", "Waiting. No case.", "Stale evidence is refused even though the record claims it is current."],
  ["7", "Payment reversed", "07-payment-reversed.csv", "1250.00 USD, reversed", "Waiting. No case.", "The money came back out again. Nothing may be applied."],
  ["8", "Paid in euros", "08-paid-in-euros.csv", "1150.00 EUR, cleared", "Waiting or blocked. No case.", "Invoice in dollars, payment in euros. No approved conversion rate exists, so it refuses rather than inventing one."],
  ["9", "Unknown reason code", "09-unknown-reason.csv", "1250.00 USD, cleared", "Needs attention. No case.", "The customer used a reason code nobody recognises. It stops for a person."],
  ["10", "Several invoices at once", "10-multi-line.csv", "8400.50 USD, cleared", "Completed. Case raised, three invoices covered.", "One payment settling three invoices."]
];

const ONECLICK = [
  ["Short payment", "Finished and raised a case.", "The normal case."],
  ["Paid in full", "Finished. Nothing was deducted, so no case was raised.", "A success with nothing to chase."],
  ["Money has not arrived", "Holding, because the money is not confirmed.", "The note came before the money."],
  ["Payment has not cleared", "Holding, because the money is not confirmed.", "Showing at the bank but not cleared."],
  ["Confirmation is stale", "Holding, because the money is not confirmed.", "The proof is older than the freshness window."],
  ["Payment was reversed", "Holding, because the money is not confirmed.", "The money came back out again."],
  ["Unknown reason code", "Stopped at ReasonReview.", "A code nobody recognises. Stops for a person."]
];

const doc = new Document({
  creator: "Recoup",
  title: "Cash Application — user guide",
  description: "How to run and check the Cash Application demo, for finance users",
  numbering: { config: [
    { reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 420, hanging: 260 } } } }] },
    { reference: "dots", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 420, hanging: 260 } } } }] }
  ] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Recoup — Cash Application user guide · demo environment", size: 16, color: "8894A0" })] })] }) },
    children: [
      // ---------------------------------------------------------------- cover
      new Paragraph({ spacing: { before: 820, after: 40 },
        children: [new TextRun({ text: "RECOUP", bold: true, size: 20, color: "8894A0", characterSpacing: 60 })] }),
      new Paragraph({ spacing: { after: 120 },
        children: [new TextRun({ text: "Cash Application", bold: true, size: 56, color: NAVY })] }),
      new Paragraph({ spacing: { after: 300 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: NAVY, space: 10 } },
        children: [new TextRun({ text: "Running and checking the demo", size: 30, color: SLATE })] }),
      p("This guide is for finance users. It covers what the system does, how to send a test payment yourself, the situations you can try, and what each one should do.", { after: 160 }),
      rich([{ text: "Version 3. ", bold: true },
        "Version 1 showed you how to read the screen but not how to put anything on it. Version 2 added the test payments but still needed someone technical to send them. This version does not: there is now a button on the page."], 320),
      callout("What you need", [
        "The demo web address and a login. Ask whoever set up the demo.",
        "Nothing else. The seven common situations are one click each.",
        "For the three extra situations — duplicates, foreign currency, several invoices at once — you also need the payment note files that came with this guide.",
        "Test data only. No real customer money moves."
      ], NAVY),
      new Paragraph({ children: [new PageBreak()] }),

      // ------------------------------------------------------- what it does
      h1("What this system does"),
      p("When a customer pays an invoice they often pay less than the full amount and send a note explaining why — a damaged pallet, a shortage, an agreed discount. Working out what they actually paid, which invoice it belongs to, and whether the deduction is justified is slow manual work."),
      p("This system does the first part. It reads the customer's note, confirms the money genuinely arrived, works out the shortfall, and hands a prepared case to the deductions team."),
      rich(["The important word is ", { text: "prepared", bold: true },
        ". It decides nothing, pays nothing and contacts nobody. A person still reviews and approves. Its job is to have the arithmetic and the evidence ready before that person opens the case."], 200),

      h2("Two things have to line up"),
      p("Every test needs both of these, and the order matters:", { after: 120 }),
      table(["", "What it is", "Why it matters"], [
        ["The payment note", "The email from the customer with a file attached, saying what they paid and why they held money back.", "Tells the system what the customer claims."],
        ["The payment confirmation", "Separate proof the money actually reached the bank.", "The system will not act on a claim alone. No confirmation, no allocation."]
      ], [1800, 3900, 3660]),
      p("Most of the situations below work by changing the confirmation — missing it, delaying it, reversing it — to show the system refusing to act.", { after: 140 }),

      h2("Which file formats does it accept?"),
      p("CSV, PDF and Excel. Five layouts of each are recognised, covering the common shapes a remittance advice arrives in: a labelled block, a table, an invoice grid, a statement-style list and a plain summary."),
      rich(["Anything else is refused before it is opened — and, since this version, the refusal ",
        { text: "appears on the operations screen as work for a person", bold: true },
        ". Previously it was refused silently, which meant a customer’s note could be turned away with nobody aware it had arrived."], 140),
      p("A file in an accepted format that still cannot be read as a payment note is treated the same way: refused, and visible.", { after: 160 }),
      new Paragraph({ children: [new PageBreak()] }),

      // ------------------------------------------------------------- sending
      h1("Sending a test payment"),
      p("Open the Agent Operations page. The first panel on the right is Send a test payment."),
      ...shot("guide/13-send-control.png", "Pick a situation, press Send. Nothing else is needed.", 520),
      stepli("Choose a situation from the dropdown."),
      stepli("Read the grey label next to it — that is what should happen."),
      stepli("Press Send, and wait a few seconds."),
      stepli("The line underneath tells you what happened. The payment also appears in the list below."),
      p("The bank confirmation is posted for you as part of the same click, in the right order. That is why the situations that depend on a missing, stale or reversed confirmation work with a single press.", { after: 160 }),
      callout("Why most of these are refusals", [
        "Five of the seven end in a hold or a stop, and that is the point.",
        "A system that only works on the happy path is not trustworthy.",
        "What it does when the money has not arrived, has not cleared or came back out again is the part worth demonstrating."
      ], GREEN),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
      h2("The seven you can send with the button"),
      table(["Situation", "What the panel should say", "What it is really testing"],
        ONECLICK, [2300, 3600, 3460], 18),
      new Paragraph({ children: [new PageBreak()] }),

      // ---------------------------------------------------------- file route
      h1("The three that still need a file"),
      p("Duplicates, foreign currency and multi-invoice payments are not on the button, because each needs a payment note the button does not build. The files came with this guide; ask whoever set up the demo to send the one you want."),
      p("You can open any of them in Excel first to see exactly what the customer is claiming — the invoice, the amount paid, the amount held back and the reason.", { after: 160 }),
      table(["#", "Scenario", "Payment note file", "Confirmation to post", "What should happen"],
        SCEN.map(([n, t, f, r, e]) => [n, t, f, r, e]),
        [500, 1700, 2200, 2100, 2860], 17),
      new Paragraph({ spacing: { after: 200 }, children: [] }),
      h2("What each one is really testing"),
      ...SCEN.flatMap(([n, t, , , , why]) => [rich([{ text: `${n}. ${t} — `, bold: true }, why], 90)]),
      new Paragraph({ children: [new PageBreak()] }),

      // ------------------------------------------------------------ checking
      h1("Checking the result"),
      p("Your payment appears in the Runs list, newest at the top."),
      ...shot("prod/final-02-runs.png", "Seven payments sent from the screen. Every column has a value, and the agent names read as names."),
      p("Read across: who paid, what state it reached, and the times. Then click the row to see the detail.", { after: 120 }),
      ...shot("guide/15-run-detail.png", "A completed short payment. The Allocation block is the finance answer.", 460),
      ...shot("guide/16-ledger.png", "The event ledger for the same payment: five steps, each in plain words, each citing the records behind it."),
      h2("Three states you will see"),
      table(["State", "Means", "Which situations"], [
        ["Completed", "Finished successfully. A case may or may not have been raised.", "Short payment, paid in full, multi-invoice"],
        ["Waiting", "Held up on purpose, because the money is not confirmed.", "Not arrived, not cleared, stale, reversed, euros"],
        ["Needs attention", "Stopped and cannot continue without a person.", "Unknown reason code, refused file"]
      ], [2000, 4400, 2960]),
      new Paragraph({ spacing: { after: 160 }, children: [] }),
      callout("Three things to check every time", [
        "The amount shows pence or cents — 250.00, not 250. A rounded figure is a fault worth reporting.",
        "A grey label reads ‘Assumed policy, not ratified’. It must be there. It means the rules used have not been formally signed off, so this is a demonstration and not an approved financial decision.",
        "Nothing on screen is a machine code. ‘Cash Application’, not cash_application. ‘Deposit deduction (DEP)’, not DEP on its own. If you see a bare code, report it."
      ], GREEN),
      new Paragraph({ spacing: { after: 160 }, children: [] }),
      h2("Putting a panel away"),
      p("Each panel on the right has a chevron in its header. Click the header to close it and click again to reopen. The event ledger scrolls inside its own panel, so a payment with a long history no longer pushes everything else off the page.", { after: 120 }),
      ...shot("prod/final-04-collapsed.png", "All four panels closed. Nothing is lost — they reopen where they were.", 520),
      new Paragraph({ children: [new PageBreak()] }),

      // ---------------------------------------------------------- what's new
      h1("What changed since version 2"),
      p("Each of these was found by testing against the live system, not in a review.", { after: 160 }),
      table(["Was", "Now"], [
        ["Sending a payment needed someone technical to run a command.", "Seven situations are one click from the page."],
        ["A payment that deducted nothing still raised a case for 0.00 and handed it to Deduction Forensics.", "Paid in full completes with no case. There is nothing to investigate, so nobody is sent to investigate it."],
        ["A refused file vanished. The sender got an error; the screen showed nothing.", "A refused customer note appears as work for a person, with the reason in words."],
        ["A payment that died mid-flight sat in Queued for ever.", "It turns into ‘Stopped before it finished’ and is counted as needing attention."],
        ["A payment waiting on money waited for ever.", "After a day it becomes ‘Waited too long for the money’."],
        ["The right-hand panels only grew.", "Every panel opens and closes; the ledger scrolls inside itself."],
        ["The Runs list showed cash_application; the detail showed DEP.", "‘Cash Application’ and ‘Deposit deduction (DEP)’."],
        ["Only CSV was accepted.", "CSV, PDF and Excel, five layouts each."]
      ], [4400, 4960], 18),
      new Paragraph({ children: [new PageBreak()] }),

      // -------------------------------------------------------- known issues
      h1("Still open"),
      p("Honest list. These are known and not yet done.", { after: 160 }),

      h2("Nothing happens after a case is raised"),
      rich(["A completed short payment hands a case to Deduction Forensics, and the roster correctly shows it as having a case to investigate. But Forensics does not then do anything — the investigation itself is a later piece of work. ",
        { text: "The handover is real; the work after it is not built yet.", bold: true }], 140),

      h2("A held payment is not retried on its own"),
      p("A payment waiting on money will not pick itself up when the money later arrives. Today it waits, and after a day it is flagged for a person. The background worker that would retry it, and the dead-letter list for ones that never resolve, are not approved for this release.", { after: 140 }),

      h2("Every button scenario uses the same customer"),
      p("Payments sent with the button all use CUST-001, so two different payments can look almost identical, differing only by reference and timestamp. They are different payments, not duplicates. The files supplied with this guide use a different customer each, which makes the list much easier to read.", { after: 140 }),

      h2("‘Maya Queue’ is listed as an agent"),
      p("It appears in the roster alongside three automated specialists, but it is not one — it is where cases wait for a person to decide. It is in the list because the roster shows every stage of the pipeline, not only the automated ones. The naming is still misleading.", { after: 140 }),
      new Paragraph({ children: [new PageBreak()] }),

      // --------------------------------------------------------------- reset
      h1("Clearing the test data"),
      p("When you have finished, clear the results so the next round starts from an empty screen."),
      stepli("Go to the Memory page under Governance."),
      stepli("Find the box titled Cash application test data."),
      stepli("Click Reset cash test data, then confirm."),
      ...shot("guide/06-reset-button.png", "The reset control on the Memory page.", 400),
      p("A message tells you exactly what was removed. Agent Operations should then be empty with all four counts at zero.", { after: 160 }),
      callout("This cannot be undone", [
        "Everything from the test session is removed permanently.",
        "It only removes cash test data — approvals and everything else on that page are untouched.",
        "Only use it on the demonstration system."
      ], AMBER),

      h2("What this demonstration is not"),
      p("A successful run does not mean the system is ready for real customer money. Four approvals are still outstanding, and they are sign-offs rather than software.", { after: 140 }),
      bullet("Confirmation that money arrived comes from a stand-in, not the finance system. Every result is labelled accordingly."),
      bullet("The rules used to categorise a deduction have not been formally signed off."),
      bullet("The mailbox that receives customer payment notes has not been formally approved."),
      bullet("The file layouts now accepted were chosen from common examples, not ratified against real customer mail."),
      p("Until the finance, security and architecture owners sign those off, treat everything here as a demonstration of how the process will work — not as an approved financial outcome.", { after: 140 })
    ]
  }]
});

Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log("written:", OUT, (b.length / 1024).toFixed(0) + "KB"); });

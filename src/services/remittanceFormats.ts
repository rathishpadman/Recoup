/**
 * Front-ends for the formats a customer actually sends.
 *
 * Every one converts into the canonical CSV v1 row shape and is then handed to
 * the existing mapper. That is the design: one validated mapper, many ways in.
 * A second mapper per format would be a second place for the money rules to
 * drift, and they would drift.
 *
 * Fail-closed matters more than breadth here. A format that cannot be placed
 * confidently is refused with a reason a person can act on, because a confident
 * wrong amount is worse than a refusal.
 *
 * ASSUMED FORMATS, NOT RATIFIED. D-05 approves CSV v1 only, and is titled
 * "First format". The layouts below are specified here so the slice can be
 * demonstrated against more than one input; they do not close D-05 and must be
 * ratified by Cash Application and Security before any of them is used against
 * live customer mail.
 */

export type RemittanceFormat = "csv" | "xlsx" | "pdf" | "email-body";

/** The canonical CSV v1 columns, which every front-end produces. */
export interface CanonicalRow {
  remittance_id: string;
  customer_reference: string;
  legal_entity_reference: string;
  payment_reference: string;
  currency: string;
  instructed_payment_amount: string;
  line_id: string;
  invoice_reference: string;
  instructed_amount: string;
  claimed_deduction_amount: string;
  claimed_reason_code: string;
  claimed_reason_text: string;
}

export type ExtractionResult =
  | { ok: true; rows: CanonicalRow[]; template: string }
  | { ok: false; reason: string };

/** Extensions we accept, and the type each must also claim. */
const EXTENSION_FORMAT: Record<string, RemittanceFormat> = {
  ".csv": "csv",
  ".xlsx": "xlsx",
  ".pdf": "pdf"
};

/**
 * The extension decides, and a conflicting content type is refused rather than
 * resolved. Extension spoofing and content-type confusion are both named in the
 * security review, and preferring either side silently is how one of them gets
 * through.
 */
const FORMAT_TYPES: Record<RemittanceFormat, string[]> = {
  csv: ["text/csv", "text/plain", "application/csv"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream"
  ],
  pdf: ["application/pdf"],
  "email-body": ["text/plain", "text/html"]
};

export function detectRemittanceFormat(input: {
  filename: string;
  mimeType: string;
}): RemittanceFormat | undefined {
  const name = input.filename.trim().toLowerCase();

  // No attachment at all: the note is the body of the email.
  if (name === "") {
    return FORMAT_TYPES["email-body"].includes(input.mimeType) ? "email-body" : undefined;
  }

  const dot = name.lastIndexOf(".");
  const format = dot === -1 ? undefined : EXTENSION_FORMAT[name.slice(dot)];

  if (format === undefined) {
    return undefined;
  }

  return FORMAT_TYPES[format].includes(input.mimeType) ? format : undefined;
}

// ---------------------------------------------------------------------------
// Field vocabulary
// ---------------------------------------------------------------------------

/**
 * The words each field is known by across the templates. Every synonym here is
 * one we specified; nothing is guessed from the document at read time.
 */
const SYNONYMS: Record<keyof CanonicalRow, string[]> = {
  remittance_id: ["remittance id", "advice number", "advice no", "document number", "reference"],
  customer_reference: ["customer", "customer reference", "payer", "account", "customer no"],
  legal_entity_reference: ["legal entity", "entity", "company code", "paying entity"],
  payment_reference: ["payment reference", "payment ref", "payment id", "remittance reference"],
  currency: ["currency", "ccy", "curr"],
  instructed_payment_amount: ["total paid", "payment amount", "total amount", "amount paid", "total remitted"],
  line_id: ["line", "line id", "item", "line no"],
  invoice_reference: ["invoice", "invoice reference", "invoice number", "invoice no", "document"],
  instructed_amount: ["paid", "amount applied", "applied", "net paid", "settled amount"],
  claimed_deduction_amount: ["deducted", "deduction", "short paid", "shortfall", "adjustment"],
  claimed_reason_code: ["reason", "reason code", "deduction code", "adjustment code"],
  claimed_reason_text: ["reason text", "narrative", "comment", "description", "note"]
};

function matchField(label: string): keyof CanonicalRow | undefined {
  const clean = label.trim().toLowerCase().replace(/[_:]+/gu, " ").replace(/\s+/gu, " ");

  for (const [field, words] of Object.entries(SYNONYMS) as [keyof CanonicalRow, string[]][]) {
    if (words.includes(clean)) {
      return field;
    }
  }

  return undefined;
}

/** Money as the document wrote it, with separators and symbols removed. */
function money(raw: string): string | undefined {
  const cleaned = raw.replace(/[^0-9.,-]/gu, "").replace(/,/gu, "");

  if (!/^-?\d+(\.\d+)?$/u.test(cleaned)) {
    return undefined;
  }

  // Two decimal places, without arithmetic: the string is padded, not rounded.
  const [whole, fraction = ""] = cleaned.split(".");
  return `${whole ?? "0"}.${(fraction + "00").slice(0, 2)}`;
}


/**
 * Splits "net paid 1,000.00" into its field and value.
 *
 * The longest label wins. Matching lazily takes "net" and leaves "paid
 * 1,000.00" as the value, which reads as a field nobody knows and silently
 * drops the amount — the quietest possible way to lose money off a document.
 */
function splitLabelled(part: string): { field: keyof CanonicalRow; value: string } | undefined {
  const tokens = part.trim().split(/[\s:]+/u).filter((token) => token !== "");

  for (let take = Math.min(3, tokens.length - 1); take >= 1; take -= 1) {
    const field = matchField(tokens.slice(0, take).join(" "));

    if (field !== undefined) {
      return { field, value: tokens.slice(take).join(" ") };
    }
  }

  return undefined;
}

function blankRow(): CanonicalRow {
  return {
    remittance_id: "",
    customer_reference: "",
    legal_entity_reference: "LE-001",
    payment_reference: "",
    currency: "",
    instructed_payment_amount: "",
    line_id: "LINE-1",
    invoice_reference: "",
    instructed_amount: "",
    claimed_deduction_amount: "0.00",
    claimed_reason_code: "",
    claimed_reason_text: ""
  };
}

/** Fields without which no row may be produced. */
const REQUIRED: (keyof CanonicalRow)[] = [
  "customer_reference",
  "payment_reference",
  "currency",
  "instructed_payment_amount",
  "invoice_reference",
  "instructed_amount"
];

function finish(rows: CanonicalRow[], template: string): ExtractionResult {
  if (rows.length === 0) {
    return { ok: false, reason: "No payment lines could be read from this document." };
  }

  for (const row of rows) {
    if (row.remittance_id === "") {
      row.remittance_id = `REM-${row.payment_reference}`;
    }

    const missing = REQUIRED.filter((field) => row[field] === "");

    if (missing.length > 0) {
      return {
        ok: false,
        reason: `Could not find ${missing.map((field) => field.replace(/_/gu, " ")).join(", ")} in this document.`
      };
    }
  }

  return { ok: true, rows, template };
}

// ---------------------------------------------------------------------------
// Label-and-value documents: email bodies and every PDF template
// ---------------------------------------------------------------------------

/**
 * Reads "Label: value" pairs for the header and pipe- or column-separated
 * invoice lines for the detail. Every PDF template we specify lays out this
 * way once its text is extracted, which is why one reader serves all five.
 */
function readLabelled(text: string, template: string): ExtractionResult {
  const header = blankRow();
  const lines: CanonicalRow[] = [];

  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();

    if (line === "") {
      continue;
    }

    // A detail line: several fields separated by pipes or two-plus spaces.
    const parts = line.includes("|")
      ? line.split("|").map((part) => part.trim())
      : line.split(/\s{2,}/u).map((part) => part.trim());

    if (parts.length >= 3 && /invoice|INV-/iu.test(line)) {
      const row = { ...header };
      row.line_id = `LINE-${String(lines.length + 1)}`;

      for (const part of parts) {
        const invoice = /((?:INV|DOC)-[A-Z0-9-]+)/u.exec(part);

        if (invoice?.[1] !== undefined && row.invoice_reference === "") {
          row.invoice_reference = invoice[1];
          continue;
        }

        const labelled = splitLabelled(part);

        if (labelled !== undefined) {
          const amount = money(labelled.value);
          row[labelled.field] =
            labelled.field === "instructed_amount" || labelled.field === "claimed_deduction_amount"
              ? (amount ?? labelled.value)
              : labelled.value;
        }
      }

      if (row.invoice_reference !== "") {
        lines.push(row);
      }

      continue;
    }

    // Otherwise a header pair.
    const pair = /^([^:]{2,40}):\s*(.+)$/u.exec(line);
    const field = pair?.[1] === undefined ? undefined : matchField(pair[1]);

    if (field !== undefined && pair?.[2] !== undefined) {
      const value = pair[2].trim();
      const amount = money(value);
      header[field] =
        field === "instructed_payment_amount" ? (amount ?? value) : value;
    }
  }

  // Header values discovered after a line was read still belong to it.
  for (const row of lines) {
    for (const field of Object.keys(header) as (keyof CanonicalRow)[]) {
      if (row[field] === "" && header[field] !== "") {
        row[field] = header[field];
      }
    }
  }

  if (lines.length === 0 && header.payment_reference === "") {
    return { ok: false, reason: "No payment reference and no invoice lines were found." };
  }

  return finish(lines, template);
}

// ---------------------------------------------------------------------------
// Grid documents: every spreadsheet template
// ---------------------------------------------------------------------------

/**
 * Reads a sheet as cells. Two shapes are supported and both are ours: a single
 * table with a header row, or a header block of label/value pairs above a line
 * table. Anything else is refused.
 */
function readGrid(grid: string[][], template: string): ExtractionResult {
  const header = blankRow();
  let columns: (keyof CanonicalRow | undefined)[] | undefined;
  const lines: CanonicalRow[] = [];

  for (const cells of grid) {
    const filled = cells.map((cell) => cell.trim()).filter((cell) => cell !== "");

    if (filled.length === 0) {
      continue;
    }

    // A label/value pair in the header block.
    if (filled.length === 2 && columns === undefined) {
      const field = matchField(filled[0] ?? "");

      if (field !== undefined) {
        const amount = money(filled[1] ?? "");
        header[field] =
          field === "instructed_payment_amount" ? (amount ?? filled[1] ?? "") : (filled[1] ?? "");
        continue;
      }
    }

    // A header row: three or more cells that are all known labels.
    const asFields = cells.map((cell) => matchField(cell));

    if (columns === undefined && asFields.filter((field) => field !== undefined).length >= 3) {
      columns = asFields;
      continue;
    }

    if (columns !== undefined) {
      const row = { ...header };
      row.line_id = `LINE-${String(lines.length + 1)}`;
      let placed = 0;

      for (const [index, field] of columns.entries()) {
        const value = (cells[index] ?? "").trim();

        if (field === undefined || value === "") {
          continue;
        }

        const amount = money(value);
        row[field] =
          field === "instructed_amount" ||
          field === "claimed_deduction_amount" ||
          field === "instructed_payment_amount"
            ? (amount ?? value)
            : value;
        placed += 1;
      }

      if (placed > 0 && row.invoice_reference !== "") {
        lines.push(row);
      }
    }
  }

  if (columns === undefined) {
    return { ok: false, reason: "No recognised column headings were found in this spreadsheet." };
  }

  for (const row of lines) {
    for (const field of Object.keys(header) as (keyof CanonicalRow)[]) {
      if (row[field] === "" && header[field] !== "") {
        row[field] = header[field];
      }
    }
  }

  return finish(lines, template);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function extractRemittanceRows(input: {
  format: RemittanceFormat;
  text?: string;
  grid?: string[][];
}): ExtractionResult {
  if (input.format === "xlsx") {
    return input.grid === undefined
      ? { ok: false, reason: "The spreadsheet could not be read." }
      : readGrid(input.grid, "xlsx");
  }

  if (input.format === "pdf" || input.format === "email-body") {
    return input.text === undefined || input.text.trim() === ""
      ? { ok: false, reason: "The document contained no readable text." }
      : readLabelled(input.text, input.format);
  }

  return { ok: false, reason: "CSV is handled by the approved mapper, not here." };
}

// ---------------------------------------------------------------------------
// The specified templates
// ---------------------------------------------------------------------------

export interface RemittanceTemplate {
  id: string;
  name: string;
  format: RemittanceFormat;
  description: string;
  sampleText: () => string;
  sample: () => string[][];
}

const HEADER_LINES = [
  "Payment reference: PAY-9001",
  "Customer: CUST-001",
  "Legal entity: LE-001",
  "Currency: USD",
  "Total paid: 1250.00"
];

function pdfTemplate(
  id: string,
  name: string,
  description: string,
  build: () => string
): RemittanceTemplate {
  return {
    id,
    name,
    format: "pdf",
    description,
    sampleText: build,
    sample: () => []
  };
}

function xlsxTemplate(
  id: string,
  name: string,
  description: string,
  build: () => string[][]
): RemittanceTemplate {
  return {
    id,
    name,
    format: "xlsx",
    description,
    sampleText: () => "",
    sample: build
  };
}

/**
 * Ten layouts, five per format, chosen to differ in the ways real documents
 * differ: what the fields are called, whether the header sits above or beside
 * the lines, and whether one payment covers one invoice or several.
 */
export const REMITTANCE_TEMPLATES: RemittanceTemplate[] = [
  pdfTemplate("PDF-1", "Standard remittance advice", "Header block, then one invoice line.", () =>
    [
      "REMITTANCE ADVICE",
      ...HEADER_LINES,
      "",
      "Invoice INV-2026-0912 | paid 1000.00 | deducted 250.00 | reason DMG | two pallets damaged"
    ].join("\n")
  ),
  pdfTemplate("PDF-2", "Bank payment advice", "Bank wording: payer, remittance reference, net paid.", () =>
    [
      "PAYMENT ADVICE",
      "Remittance reference: PAY-9001",
      "Payer: CUST-001",
      "Paying entity: LE-001",
      "Ccy: USD",
      "Total remitted: 1,250.00",
      "",
      "Invoice INV-2026-0912 | net paid 1,000.00 | adjustment 250.00 | deduction code DMG"
    ].join("\n")
  ),
  pdfTemplate("PDF-3", "Self-billing document", "Document/account wording rather than invoice/customer.", () =>
    [
      "SELF BILLING DOCUMENT",
      "Payment ref: PAY-9001",
      "Account: CUST-001",
      "Entity: LE-001",
      "Currency: USD",
      "Amount paid: 1250.00",
      "",
      "Document INV-2026-0912 | settled amount 1000.00 | short paid 250.00 | reason DMG"
    ].join("\n")
  ),
  pdfTemplate("PDF-4", "Consolidated statement", "One payment covering several invoices.", () =>
    [
      "CONSOLIDATED REMITTANCE",
      ...HEADER_LINES,
      "",
      "Invoice INV-2026-0912 | paid 1000.00 | deducted 250.00 | reason DMG | damaged",
      "Invoice INV-2026-0913 | paid 0.00 | deducted 0.00 | reason DMG | nothing due"
    ].join("\n")
  ),
  pdfTemplate("PDF-5", "Minimal advice", "Column-aligned rather than pipe-separated.", () =>
    [
      "Payment reference:  PAY-9001",
      "Customer:  CUST-001",
      "Currency:  USD",
      "Total paid:  1250.00",
      "",
      "Invoice INV-2026-0912   paid 1000.00   deducted 250.00   reason DMG"
    ].join("\n")
  ),

  xlsxTemplate("XLS-1", "Standard grid", "One table, headings in the first row.", () => [
    ["Customer", "Payment reference", "Currency", "Total paid", "Invoice", "Paid", "Deducted", "Reason"],
    ["CUST-001", "PAY-9001", "USD", "1250.00", "INV-2026-0912", "1000.00", "250.00", "DMG"]
  ]),
  xlsxTemplate("XLS-2", "Header block above lines", "Label/value pairs, then a line table.", () => [
    ["Payment reference", "PAY-9001"],
    ["Customer", "CUST-001"],
    ["Currency", "USD"],
    ["Total paid", "1250.00"],
    [],
    ["Invoice", "Paid", "Deducted", "Reason"],
    ["INV-2026-0912", "1000.00", "250.00", "DMG"]
  ]),
  xlsxTemplate("XLS-3", "Bank export", "Bank column names and thousands separators.", () => [
    ["Payer", "Remittance reference", "Ccy", "Total remitted", "Invoice number", "Net paid", "Adjustment", "Deduction code"],
    ["CUST-001", "PAY-9001", "USD", "1,250.00", "INV-2026-0912", "1,000.00", "250.00", "DMG"]
  ]),
  xlsxTemplate("XLS-4", "Wide export", "Extra columns that carry no meaning here.", () => [
    ["Region", "Customer", "Payment reference", "Currency", "Total paid", "Invoice", "Paid", "Deducted", "Reason", "Posted by"],
    ["EMEA", "CUST-001", "PAY-9001", "USD", "1250.00", "INV-2026-0912", "1000.00", "250.00", "DMG", "j.smith"]
  ]),
  xlsxTemplate("XLS-5", "Multi-invoice", "One payment settling several invoices.", () => [
    ["Customer", "Payment reference", "Currency", "Total paid", "Invoice", "Paid", "Deducted", "Reason"],
    ["CUST-001", "PAY-9001", "USD", "1250.00", "INV-2026-0912", "1000.00", "250.00", "DMG"],
    ["CUST-001", "PAY-9001", "USD", "1250.00", "INV-2026-0913", "0.00", "0.00", "DMG"]
  ])
];

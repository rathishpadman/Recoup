import {
  REMITTANCE_CSV_V1_HEADER,
  REMITTANCE_CSV_VERSION,
  RemittanceCsvRowSchema,
  type RemittanceCsvRow
} from "../../config/remittanceCsvV1.js";
import type { RemittanceAdviceInput } from "../core/cashApplication/match.js";

/**
 * Versioned UTF-8 CSV v1 mapper.
 *
 * This is a mapper, not a general extractor. It accepts exactly the approved
 * header and rejects everything else, because the failure mode worth designing
 * against is a column shift that maps an amount into the wrong field and looks
 * entirely plausible downstream.
 *
 * Fields not present in the approved format produce a mapping error. The
 * implementation infers no hidden defaults, and never populates a validated
 * reason: the mapper carries the customer's claim only.
 */

export type MappingFailure =
  | "empty_file"
  | "header_mismatch"
  | "row_invalid"
  | "inconsistent_header_row"
  | "missing_reason_code"
  | "not_utf8";

export type MapRemittanceResult =
  | { status: "mapped"; advice: RemittanceAdviceInput; mapperVersion: string }
  | { status: "rejected"; reason: MappingFailure; detail: string };

export interface MapRemittanceInput {
  csv: string;
  inboundMessageId: string;
  provenanceMode: RemittanceAdviceInput["provenanceMode"];
  sourceRecordIds: string[];
}

function splitCsvLine(line: string): string[] {
  // The approved format has no quoted fields. Accepting them would mean
  // accepting embedded separators and newlines, which is where a mapper turns
  // into a parser.
  return line.split(",").map((cell) => cell.trim());
}

function rejected(reason: MappingFailure, detail: string): MapRemittanceResult {
  return { status: "rejected", reason, detail };
}

export function mapRemittanceCsvV1(input: MapRemittanceInput): MapRemittanceResult {
  if (input.csv.includes("�")) {
    return rejected("not_utf8", "replacement character present; file is not valid UTF-8");
  }

  const lines = input.csv
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const [headerLine, ...rowLines] = lines;

  if (headerLine === undefined || rowLines.length === 0) {
    return rejected("empty_file", "no header or no data rows");
  }

  const header = splitCsvLine(headerLine);

  if (
    header.length !== REMITTANCE_CSV_V1_HEADER.length ||
    header.some((column, index) => column !== REMITTANCE_CSV_V1_HEADER[index])
  ) {
    return rejected("header_mismatch", `expected ${REMITTANCE_CSV_V1_HEADER.join(",")}`);
  }

  const rows: RemittanceCsvRow[] = [];

  for (const [index, rowLine] of rowLines.entries()) {
    const cells = splitCsvLine(rowLine);

    if (cells.length !== header.length) {
      return rejected(
        "inconsistent_header_row",
        `row ${String(index + 1)} has ${String(cells.length)} cells, header has ${String(header.length)}`
      );
    }

    const candidate = Object.fromEntries(header.map((column, position) => [column, cells[position]]));
    const parsed = RemittanceCsvRowSchema.safeParse(candidate);

    if (!parsed.success) {
      const missingReason = parsed.error.issues.some((issue) =>
        issue.path.includes("claimed_reason_code")
      );
      return rejected(
        missingReason ? "missing_reason_code" : "row_invalid",
        `row ${String(index + 1)}: ${parsed.error.issues[0]?.message ?? "invalid"}`
      );
    }

    rows.push(parsed.data);
  }

  const [first, ...rest] = rows;

  if (first === undefined) {
    return rejected("empty_file", "no data rows");
  }

  // Every row must agree on the payment-level fields. A file mixing two
  // remittances would otherwise allocate one payment's cash across both.
  const headerFields = [
    "remittance_id",
    "customer_reference",
    "legal_entity_reference",
    "payment_reference",
    "currency",
    "instructed_payment_amount"
  ] as const;

  for (const row of rest) {
    for (const field of headerFields) {
      if (row[field] !== first[field]) {
        return rejected("row_invalid", `rows disagree on ${field}`);
      }
    }
  }

  return {
    status: "mapped",
    mapperVersion: REMITTANCE_CSV_VERSION,
    advice: {
      remittanceId: first.remittance_id,
      inboundMessageId: input.inboundMessageId,
      customerReference: first.customer_reference,
      legalEntityReference: first.legal_entity_reference,
      paymentReference: first.payment_reference,
      currency: first.currency,
      instructedPaymentAmount: first.instructed_payment_amount,
      mapperVersion: REMITTANCE_CSV_VERSION,
      lines: rows.map((row) => ({
        lineId: row.line_id,
        invoiceReference: row.invoice_reference,
        instructedAmount: row.instructed_amount,
        claimedDeductionAmount: row.claimed_deduction_amount,
        claimedReasonCode: row.claimed_reason_code,
        claimedReasonTextSanitized: row.claimed_reason_text,
        sourceRecordIds: input.sourceRecordIds
      })),
      sourceRecordIds: input.sourceRecordIds,
      provenanceMode: input.provenanceMode
    }
  };
}

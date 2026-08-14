export interface PodDocumentPdfInput {
  contentHash: string;
  customerId: string;
  deliveredQuantity: string;
  evidenceId: string;
  invoiceRef: string;
  lineId: string;
  podReference: string;
  podSignedFullDelivery: boolean;
  retrievedAt: string;
  signedQuantity: string;
  sourceSystem: string;
}

const pageWidth = 612;
const pageHeight = 792;
const marginX = 48;
const contentRight = pageWidth - marginX;

/**
 * Renders a proof-of-delivery artifact as a self-contained PDF.
 *
 * The layout mirrors a 3PL delivery receipt (carrier header, consignment fields, a signed
 * quantity table and a receiver signature block) so the stored object reads as the shipping
 * document it represents rather than a field dump.
 */
export function renderPodDocumentPdf(input: PodDocumentPdfInput): Buffer {
  const shortage = quantityShortfall(input.deliveredQuantity, input.signedQuantity);
  const ops: string[] = [];

  // Header band.
  ops.push("0.145 0.184 0.169 rg", `${String(marginX)} 704 ${String(contentRight - marginX)} 56 re f`);
  text(ops, { bold: true, color: [1, 1, 1], size: 20, x: marginX + 16, y: 736, value: "PROOF OF DELIVERY" });
  text(ops, { color: [1, 1, 1], size: 9.5, x: marginX + 16, y: 718, value: `Carrier / 3PL: ${input.sourceSystem.replace(/_/gu, " ").toUpperCase()}` });
  text(ops, { align: "right", bold: true, color: [1, 1, 1], size: 11, x: contentRight - 16, y: 736, value: input.podReference });
  text(ops, { align: "right", color: [1, 1, 1], size: 9.5, x: contentRight - 16, y: 718, value: formatDate(input.retrievedAt) });

  // Consignment fields, two columns.
  let y = 672;
  field(ops, marginX, y, "Consignee", input.customerId);
  field(ops, 320, y, "Invoice reference", input.invoiceRef);
  y -= 46;
  field(ops, marginX, y, "Deduction line", input.lineId);
  field(ops, 320, y, "Delivery receipt", input.podReference);

  // Quantity table.
  y -= 62;
  rule(ops, y + 18);
  text(ops, { bold: true, size: 10, x: marginX, y, value: "Description" });
  text(ops, { align: "right", bold: true, size: 10, x: 400, y, value: "Delivered" });
  text(ops, { align: "right", bold: true, size: 10, x: contentRight, y, value: "Signed for" });
  rule(ops, y - 8);

  y -= 26;
  text(ops, { size: 10, x: marginX, y, value: `Consignment against ${input.invoiceRef}` });
  text(ops, { align: "right", size: 10, x: 400, y, value: input.deliveredQuantity });
  text(ops, { align: "right", size: 10, x: contentRight, y, value: input.signedQuantity });

  y -= 22;
  if (shortage !== undefined) {
    text(ops, { color: [0.6, 0.13, 0.13], size: 10, x: marginX, y, value: `Short-signed on delivery: ${shortage} unit(s) not accepted by the consignee.` });
  } else {
    text(ops, { color: [0.09, 0.4, 0.2], size: 10, x: marginX, y, value: "Full consignment signed for without exception." });
  }
  rule(ops, y - 12);

  // Delivery outcome.
  y -= 46;
  text(ops, { bold: true, size: 10, x: marginX, y, value: "Delivery outcome" });
  y -= 18;
  text(ops, {
    size: 10,
    x: marginX,
    y,
    value: input.podSignedFullDelivery
      ? "Signed in full. Consignee acknowledged receipt of the complete consignment."
      : "Signed short. Consignee acknowledged a partial receipt only; see exception above."
  });

  // Signature block.
  y -= 74;
  text(ops, { bold: true, size: 10, x: marginX, y, value: "Received and signed by" });
  y -= 40;
  line(ops, marginX, y, 300, y);
  line(ops, 340, y, contentRight, y);
  text(ops, { size: 8.5, x: marginX, y: y - 12, value: "Consignee signature" });
  text(ops, { size: 8.5, x: 340, y: y - 12, value: "Date of delivery" });
  text(ops, { size: 11, x: marginX + 4, y: y + 8, value: `${input.customerId} receiving desk` });
  text(ops, { size: 11, x: 344, y: y + 8, value: formatDate(input.retrievedAt) });

  // Provenance footer.
  rule(ops, 120);
  text(ops, { color: [0.35, 0.38, 0.36], size: 8, x: marginX, y: 106, value: `Evidence ID ${input.evidenceId}  |  Source system ${input.sourceSystem}  |  Retrieved ${input.retrievedAt}` });
  text(ops, { color: [0.35, 0.38, 0.36], size: 8, x: marginX, y: 94, value: `Content hash ${input.contentHash}` });
  text(ops, { color: [0.35, 0.38, 0.36], size: 8, x: marginX, y: 82, value: "Recoup materialized evidence artifact. Reproduced from the governed evidence record; not a live source-system original." });

  return buildPdf(ops.join("\n"));
}

interface TextOptions {
  align?: "left" | "right";
  bold?: boolean;
  color?: readonly [number, number, number];
  size: number;
  value: string;
  x: number;
  y: number;
}

function text(ops: string[], options: TextOptions): void {
  const [r, g, b] = options.color ?? [0.09, 0.13, 0.11];
  const font = options.bold === true ? "/F2" : "/F1";
  const width = approximateTextWidth(options.value, options.size, options.bold === true);
  const x = options.align === "right" ? options.x - width : options.x;

  ops.push(
    "BT",
    `${String(r)} ${String(g)} ${String(b)} rg`,
    `${font} ${String(options.size)} Tf`,
    `${String(round(x))} ${String(round(options.y))} Td`,
    `(${escapePdfText(options.value)}) Tj`,
    "ET"
  );
}

function field(ops: string[], x: number, y: number, label: string, value: string): void {
  text(ops, { color: [0.35, 0.38, 0.36], size: 8.5, x, y: y + 16, value: label.toUpperCase() });
  text(ops, { bold: true, size: 12, x, y, value });
}

function rule(ops: string[], y: number): void {
  line(ops, marginX, y, contentRight, y);
}

function line(ops: string[], x1: number, y1: number, x2: number, y2: number): void {
  ops.push(
    "0.80 0.84 0.81 RG",
    "0.75 w",
    `${String(round(x1))} ${String(round(y1))} m`,
    `${String(round(x2))} ${String(round(y2))} l`,
    "S"
  );
}

function quantityShortfall(delivered: string, signed: string): string | undefined {
  const deliveredValue = Number.parseFloat(delivered);
  const signedValue = Number.parseFloat(signed);
  if (!Number.isFinite(deliveredValue) || !Number.isFinite(signedValue) || signedValue >= deliveredValue) {
    return undefined;
  }

  return String(Number((deliveredValue - signedValue).toFixed(2)));
}

function formatDate(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }

  return parsed.toISOString().slice(0, 10);
}

// Helvetica averages ~0.5em per glyph; bold runs slightly wider. Good enough for right-alignment.
function approximateTextWidth(value: string, size: number, bold: boolean): number {
  return value.length * size * (bold ? 0.55 : 0.5);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\(/gu, "\\(").replace(/\)/gu, "\\)");
}

function buildPdf(content: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${String(pageWidth)} ${String(pageHeight)}] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${String(Buffer.byteLength(content, "utf8"))} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;

  return Buffer.from(body, "utf8");
}

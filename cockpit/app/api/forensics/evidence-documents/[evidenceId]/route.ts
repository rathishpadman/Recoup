import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";

interface EvidenceDocumentRouteContext {
  params: { evidenceId: string } | Promise<{ evidenceId: string }>;
}

interface EvidenceDocumentRow {
  customer_id: string;
  content_hash: string;
  document_type: string;
  evidence_id: string;
  payload_json: Record<string, unknown>;
  provenance: string;
  raw_text: string | null;
  retrieved_at: string;
  source_record_id: string;
  source_system: string;
  storage_uri: string | null;
}

const evidenceIdPattern = /^EVD-[A-Z0-9-]+$/u;

export async function GET(request: Request, context: EvidenceDocumentRouteContext): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const { evidenceId } = await context.params;
  const normalizedEvidenceId = evidenceId.trim();
  if (!evidenceIdPattern.test(normalizedEvidenceId)) {
    return Response.json({ error: "Invalid evidence document ID." }, { headers: noStoreHeaders(), status: 400 });
  }

  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  if (runtimeEnv.SUPABASE_URL === undefined || runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined) {
    return Response.json({ error: "Supabase evidence document source unavailable." }, { headers: noStoreHeaders(), status: 503 });
  }

  const response = await fetch(buildEvidenceDocumentUrl(runtimeEnv.SUPABASE_URL, normalizedEvidenceId), {
    cache: "no-store",
    headers: {
      accept: "application/json",
      apikey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${runtimeEnv.SUPABASE_SERVICE_ROLE_KEY}`
    },
    method: "GET"
  }).catch(() => undefined);
  if (response === undefined || !response.ok) {
    return Response.json({ error: "Supabase evidence document read failed." }, { headers: noStoreHeaders(), status: 503 });
  }

  const rows = (await response.json().catch(() => [])) as unknown;
  const row = Array.isArray(rows) ? rows.find(isEvidenceDocumentRow) : undefined;
  if (row === undefined) {
    return Response.json({ error: "Evidence document not found." }, { headers: noStoreHeaders(), status: 404 });
  }

  return buildEvidenceDocumentResponse(row);
}

function buildEvidenceDocumentUrl(supabaseUrl: string, evidenceId: string): string {
  const baseUrl = supabaseUrl.replace(/\/+$/u, "");
  const query = new URLSearchParams({
    evidence_id: `eq.${evidenceId}`,
    select:
      "evidence_id,customer_id,document_type,source_system,source_record_id,provenance,content_hash,retrieved_at,storage_uri,payload_json,raw_text"
  });

  return `${baseUrl}/rest/v1/recoup_evidence_documents?${query.toString()}`;
}

const generatedPdfDocumentTypes = new Set(["pod", "sap_invoice", "remittance_advice"]);

export function buildEvidenceDocumentResponse(row: EvidenceDocumentRow): Response {
  if (canRenderGeneratedPdf(row)) {
    const pdf = renderGeneratedEvidencePdf(row);

    return new Response(pdf, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `inline; filename="${row.evidence_id}.pdf"`,
        "content-type": "application/pdf",
        "x-content-type-options": "nosniff",
        "x-recoup-evidence-provenance": row.provenance
      },
      status: 200
    });
  }

  return new Response(renderEvidenceDocumentHtml(row), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${row.evidence_id}.html"`,
      "content-type": "text/html; charset=utf-8",
      "x-content-type-options": "nosniff"
    },
    status: 200
  });
}

function canRenderGeneratedPdf(row: EvidenceDocumentRow): boolean {
  return row.provenance === "source_generated" && generatedPdfDocumentTypes.has(row.document_type);
}

function renderGeneratedEvidencePdf(row: EvidenceDocumentRow): string {
  const lines = [
    "Recoup generated source evidence artifact",
    "Generated from controlled materialized evidence row; not a live source-system original.",
    "",
    `Evidence ID: ${row.evidence_id}`,
    `Document type: ${row.document_type}`,
    `Customer ID: ${row.customer_id}`,
    `Source system: ${row.source_system}`,
    `Source record: ${row.source_record_id}`,
    `Provenance: ${row.provenance}`,
    `Content hash: ${row.content_hash}`,
    `Retrieved at: ${row.retrieved_at}`,
    `Storage URI: ${row.storage_uri ?? "Unavailable"}`,
    "",
    "Evidence payload:",
    ...formatPayloadLines(row.payload_json)
  ];

  return buildSinglePagePdf(lines);
}

function formatPayloadLines(payload: Record<string, unknown>): string[] {
  return Object.entries(payload)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => wrapPdfLine(`${key}: ${formatPayloadValue(value)}`, 88));
}

function formatPayloadValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  return JSON.stringify(value);
}

function buildSinglePagePdf(lines: string[]): string {
  const contentLines = lines.slice(0, 36);
  const content = [
    "BT",
    "/F1 12 Tf",
    "48 744 Td",
    "14 TL",
    ...contentLines.flatMap((line, index) => [`(${escapePdfText(line)}) Tj`, ...(index === contentLines.length - 1 ? [] : ["T*"])]),
    "ET"
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${String(Buffer.byteLength(content, "utf8"))} >>\nstream\n${content}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${String(objects.length + 1)}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;

  return body;
}

function wrapPdfLine(line: string, width: number): string[] {
  if (line.length <= width) {
    return [line];
  }

  const lines: string[] = [];
  for (let offset = 0; offset < line.length; offset += width) {
    lines.push(line.slice(offset, offset + width));
  }

  return lines;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/\(/gu, "\\(").replace(/\)/gu, "\\)");
}

function renderEvidenceDocumentHtml(row: EvidenceDocumentRow): string {
  const fields: Array<[string, string]> = [
    ["Evidence ID", row.evidence_id],
    ["Document type", row.document_type],
    ["Source system", row.source_system],
    ["Source record", row.source_record_id],
    ["Provenance", row.provenance],
    ["Content hash", row.content_hash],
    ["Retrieved at", row.retrieved_at],
    ["Storage URI", row.storage_uri ?? "Unavailable"]
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(row.evidence_id)} evidence document</title>
    <style>
      body { color: #17201b; font-family: Arial, sans-serif; line-height: 1.45; margin: 32px; max-width: 920px; }
      h1 { font-size: 24px; margin: 0 0 16px; }
      dl { border: 1px solid #cdd6cf; border-radius: 8px; display: grid; grid-template-columns: 180px minmax(0, 1fr); overflow: hidden; }
      dt, dd { border-bottom: 1px solid #e3e8e4; margin: 0; padding: 10px 12px; }
      dt { background: #f4f7f5; color: #526057; font-weight: 700; }
      dd { font-family: "Courier New", monospace; overflow-wrap: anywhere; }
      dt:last-of-type, dd:last-of-type { border-bottom: 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(row.evidence_id)} source evidence document</h1>
    <dl>
      ${fields.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
    </dl>
  </body>
</html>`;
}

function isEvidenceDocumentRow(value: unknown): value is EvidenceDocumentRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row["customer_id"] === "string" &&
    typeof row["content_hash"] === "string" &&
    typeof row["document_type"] === "string" &&
    typeof row["evidence_id"] === "string" &&
    isRecord(row["payload_json"]) &&
    typeof row["provenance"] === "string" &&
    (typeof row["raw_text"] === "string" || row["raw_text"] === null) &&
    typeof row["retrieved_at"] === "string" &&
    typeof row["source_record_id"] === "string" &&
    typeof row["source_system"] === "string" &&
    (typeof row["storage_uri"] === "string" || row["storage_uri"] === null)
  );
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

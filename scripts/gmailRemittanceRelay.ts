import { createHmac } from "node:crypto";

/**
 * Gmail to the inbound remittance endpoint.
 *
 * Gmail has no outbound webhook, so something has to fetch the message and
 * post it. This is that relay, kept deliberately thin: it reads one message,
 * pulls the first CSV attachment, and posts the canonical shape the gmail
 * adapter parses. It makes no decision about whether the mail is acceptable —
 * sender allowlist, approved recipient, scanning and mapping all belong to the
 * backend, and this would be the wrong place to second-guess any of them.
 *
 * It needs a Gmail OAuth access token with gmail.readonly. Supply one that was
 * minted outside this script; it never asks for a password and never stores a
 * credential.
 *
 * Run with:
 *   GMAIL_ACCESS_TOKEN=ya29....                     \
 *   GMAIL_MESSAGE_ID=<id>                           \
 *   RECOUP_INBOUND_SHARED_SECRET=...                \
 *   RECOUP_COCKPIT_BASE_URL=https://...             \
 *   npx tsx scripts/gmailRemittanceRelay.ts
 *
 * To poll instead of naming a message, pass GMAIL_QUERY (Gmail search syntax,
 * for example 'has:attachment filename:csv newer_than:1d') and the newest
 * match is relayed.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[]; parts?: GmailPart[]; filename?: string; mimeType?: string; body?: { attachmentId?: string } };
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function headerValue(headers: GmailHeader[], name: string): string {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Depth-first, because Gmail nests parts inside multipart containers. */
function findCsvPart(part: GmailPart | undefined): GmailPart | undefined {
  if (part === undefined) {
    return undefined;
  }

  const filename = part.filename ?? "";
  const isCsv =
    filename.toLowerCase().endsWith(".csv") ||
    (part.mimeType === "text/csv" && filename !== "");

  if (isCsv && part.body?.attachmentId !== undefined) {
    return part;
  }

  for (const child of part.parts ?? []) {
    const found = findCsvPart(child);
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
}

async function gmail<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`gmail ${path} failed: ${String(response.status)} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function resolveMessageId(token: string): Promise<string> {
  const explicit = process.env.GMAIL_MESSAGE_ID?.trim();

  if (explicit !== undefined && explicit !== "") {
    return explicit;
  }

  const query = requireEnv("GMAIL_QUERY");
  const listed = await gmail<{ messages?: { id: string }[] }>(
    `/messages?maxResults=1&q=${encodeURIComponent(query)}`,
    token
  );
  const first = listed.messages?.[0]?.id;

  if (first === undefined) {
    throw new Error(`No Gmail message matched: ${query}`);
  }

  return first;
}

async function main(): Promise<void> {
  const token = requireEnv("GMAIL_ACCESS_TOKEN");
  const secret = requireEnv("RECOUP_INBOUND_SHARED_SECRET");
  const baseUrl = requireEnv("RECOUP_COCKPIT_BASE_URL").replace(/\/$/u, "");

  const messageId = await resolveMessageId(token);
  const message = await gmail<GmailMessage>(`/messages/${messageId}?format=full`, token);
  const headers = message.payload?.headers ?? [];

  const csvPart = findCsvPart({
    ...(message.payload?.filename === undefined ? {} : { filename: message.payload.filename }),
    ...(message.payload?.mimeType === undefined ? {} : { mimeType: message.payload.mimeType }),
    ...(message.payload?.body === undefined ? {} : { body: message.payload.body }),
    ...(message.payload?.parts === undefined ? {} : { parts: message.payload.parts })
  });

  if (csvPart?.body?.attachmentId === undefined) {
    throw new Error(`Message ${messageId} carries no CSV attachment.`);
  }

  const attachment = await gmail<{ data: string }>(
    `/messages/${messageId}/attachments/${csvPart.body.attachmentId}`,
    token
  );

  // Gmail returns base64url; the adapter expects standard base64.
  const contentBase64 = Buffer.from(attachment.data, "base64url").toString("base64");

  const payload = JSON.stringify({
    messageId,
    from: headerValue(headers, "From").replace(/^.*</u, "").replace(/>.*$/u, "").trim(),
    to: headerValue(headers, "To").replace(/^.*</u, "").replace(/>.*$/u, "").trim(),
    subject: headerValue(headers, "Subject"),
    receivedAt: new Date(Number(message.internalDate ?? Date.now())).toISOString(),
    attachment: {
      filename: csvPart.filename ?? "remittance.csv",
      mimeType: csvPart.mimeType ?? "text/csv",
      contentBase64
    }
  });

  const response = await fetch(`${baseUrl}/api/inbound/remittance`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-recoup-signature": createHmac("sha256", secret).update(payload).digest("hex")
    },
    body: payload
  });

  console.log(`gmail message ${messageId} relayed`);
  console.log(`attachment: ${csvPart.filename ?? "remittance.csv"}`);
  console.log(`inbound responded ${String(response.status)}: ${await response.text()}`);

  // 202 accepted, 409 already seen. Anything else is a refusal worth surfacing.
  if (response.status !== 202 && response.status !== 409) {
    process.exitCode = 1;
  }
}

await main();

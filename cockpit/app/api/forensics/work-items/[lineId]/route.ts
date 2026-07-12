import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";
import {
  mayaForensicsWorkItemReadModelKey,
  publishCachedReadModelPayload,
  readCachedReadModelPayload,
  readModelJsonResponse,
  readModelCacheHeader,
  refreshReadModelAfterResponse,
  scheduledReadModelMaxAgeMs
} from "../../../read-model-cache.ts";

type RuntimeEnv = Partial<Record<string, string | undefined>>;

interface ApprovalReceiptSnapshot {
  actionId: string;
  auditEntryHash: string;
  status: "human_decided";
}

interface WorkItemRouteContext {
  params: { lineId: string } | Promise<{ lineId: string }>;
}

export async function GET(request: Request, context: WorkItemRouteContext): Promise<Response> {
  const runtimeEnv = loadLocalRuntimeEnvFiles();
  const { lineId } = await context.params;
  const authHeaders = buildVerifiedHumanAuthHeaders(runtimeEnv, request.headers, {
    allowDemoSessionRoles: ["maya"]
  });
  if (authHeaders === undefined) {
    return Response.json({ error: "Verified human cockpit auth required." }, { headers: noStoreHeaders(), status: 401 });
  }

  const modelKey = mayaForensicsWorkItemReadModelKey(lineId);
  const cached = await readCachedReadModelPayload(runtimeEnv, modelKey, "forensics-analyst", {
    maxAgeMs: scheduledReadModelMaxAgeMs,
    payloadSurface: "forensics-work-item-detail"
  });
  if (
    cached !== undefined &&
    cachedWorkItemDetailCanBeReused(cached.payload, lineId) &&
    (await cachedWorkItemDetailApprovalStateIsFresh(runtimeEnv, cached.payload))
  ) {
    const responsePayload = await augmentGroupedWorkItemDetailFromSiblingCaches(runtimeEnv, cached.payload, lineId);
    refreshReadModelAfterResponse(runtimeEnv, authHeaders, {
      method: "GET",
      path: `/forensics/work-items/${encodeURIComponent(lineId)}`
    });
    return readModelJsonResponse(responsePayload, "hit", { sourceRefreshedAt: cached.sourceRefreshedAt });
  }

  try {
    const upstream = await fetch(
      `${runtimeEnv.RECOUP_API_URL ?? "http://127.0.0.1:4317"}/forensics/work-items/${encodeURIComponent(lineId)}`,
      {
        cache: "no-store",
        headers: authHeaders,
        method: "GET"
      }
    );
    const body = await upstream.text();
    if (upstream.ok) {
      const payload = parseWorkItemDetailPayload(body);
      if (payload === undefined || !workItemDetailPayloadMatchesLine(payload, lineId)) {
        return Response.json({ error: "Forensics work item detail service unavailable." }, { headers: noStoreHeaders(), status: 502 });
      }
      const responsePayload = await augmentGroupedWorkItemDetailFromSiblingCaches(runtimeEnv, payload, lineId);
      const selected = readRecord(responsePayload.selected);
      const workItem = readRecord(responsePayload.workItem);
      const workItemLineIds = readNonEmptyStringArray(workItem?.lineIds);
      if (selected !== undefined && cachedWorkItemDetailHasCanonicalEvidenceProof(selected, workItemLineIds)) {
        await publishCachedReadModelPayload(runtimeEnv, {
          modelKey,
          payload: responsePayload,
          payloadSurface: "forensics-work-item-detail",
          previousSourceRecordIds: [],
          rowSurface: "forensics-analyst",
          sourceRecordIds: collectWorkItemDetailRecordIds(responsePayload, lineId)
        });
      }

      return new Response(JSON.stringify(responsePayload), {
        headers: {
          "cache-control": "no-store",
          "content-type": upstream.headers.get("content-type") ?? "application/json",
          [readModelCacheHeader]: upstream.headers.get(readModelCacheHeader) ?? "miss"
        },
        status: upstream.status
      });
    }

    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json"
      },
      status: upstream.status
    });
  } catch {
    return Response.json({ error: "Forensics work item detail service unavailable." }, { headers: noStoreHeaders(), status: 502 });
  }
}

function noStoreHeaders(): HeadersInit {
  return { "cache-control": "no-store" };
}

function parseWorkItemDetailPayload(body: string): Record<string, unknown> | undefined {
  try {
    const payload = JSON.parse(body) as unknown;
    if (
      typeof payload === "object" &&
      payload !== null &&
      !Array.isArray(payload) &&
      "surface" in payload &&
      payload.surface === "forensics-work-item-detail"
    ) {
      return payload;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function cachedWorkItemDetailCanBeReused(payload: Record<string, unknown>, lineId: string): boolean {
  const selected = readRecord(payload.selected);
  const workItem = readRecord(payload.workItem);
  if (selected === undefined || workItem === undefined || !workItemDetailPayloadMatchesLine(payload, lineId)) {
    return false;
  }

  const lineIds = readNonEmptyStringArray(workItem.lineIds);
  return cachedWorkItemDetailHasCanonicalEvidenceProof(selected, lineIds);
}

function workItemDetailPayloadMatchesLine(payload: Record<string, unknown>, lineId: string): boolean {
  const selected = readRecord(payload.selected);
  const workItem = readRecord(payload.workItem);
  if (selected === undefined || workItem === undefined) {
    return false;
  }

  const lineIds = Array.isArray(workItem.lineIds) ? workItem.lineIds.filter((value): value is string => typeof value === "string") : [];
  const workItemLineId = readNonEmptyString(workItem.lineId);
  const workItemId = readNonEmptyString(workItem.workItemId);

  return (
    payload.lineId === lineId &&
    selected.lineId === lineId &&
    lineIds.includes(lineId) &&
    workItemLineId !== undefined &&
    workItemId !== undefined &&
    workItemLineId === workItemId &&
    lineIds.includes(workItemLineId)
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

async function cachedWorkItemDetailApprovalStateIsFresh(runtimeEnv: RuntimeEnv, payload: Record<string, unknown>): Promise<boolean> {
  const actionId = readCachedActionId(payload);
  if (actionId === undefined) {
    return false;
  }

  const currentReceipt = await readCurrentApprovalReceipt(runtimeEnv, actionId);
  if (currentReceipt === "unavailable") {
    return false;
  }

  const cachedReceipt = readCachedApprovalReceipt(payload);
  if (currentReceipt === undefined) {
    return cachedReceipt === undefined && !Object.hasOwn(payload, "approvalReceipt");
  }

  return (
    cachedReceipt !== undefined &&
    cachedReceipt.actionId === currentReceipt.actionId &&
    cachedReceipt.auditEntryHash === currentReceipt.auditEntryHash
  );
}

function readCachedActionId(payload: Record<string, unknown>): string | undefined {
  const recoveryDraft = readRecord(payload.recoveryDraft);
  const selected = readRecord(payload.selected);
  const selectedDraft = readRecord(selected?.draft);
  const receipt = readRecord(payload.approvalReceipt);

  return (
    readNonEmptyString(recoveryDraft?.actionId) ??
    readNonEmptyString(selectedDraft?.actionId) ??
    readNonEmptyString(receipt?.actionId)
  );
}

function readCachedApprovalReceipt(payload: Record<string, unknown>): ApprovalReceiptSnapshot | undefined {
  return readApprovalReceiptSnapshot(readRecord(payload.approvalReceipt));
}

async function readCurrentApprovalReceipt(
  runtimeEnv: RuntimeEnv,
  actionId: string
): Promise<ApprovalReceiptSnapshot | "unavailable" | undefined> {
  if (runtimeEnv.SUPABASE_SERVICE_ROLE_KEY === undefined || runtimeEnv.SUPABASE_URL === undefined) {
    return "unavailable";
  }

  const tableName = runtimeEnv.RECOUP_SUPABASE_MEMORY_TABLE ?? "recoup_memory_records";
  if (!isSafeTableName(tableName)) {
    return "unavailable";
  }

  try {
    const approvalRecordId = `approval:${actionId}`;
    const url = new URL(`${normalizeSupabaseUrl(runtimeEnv.SUPABASE_URL)}/rest/v1/${tableName}`);
    url.searchParams.set("select", "id,scope,category,trust_level,payload_json");
    url.searchParams.set("id", `eq.${approvalRecordId}`);
    url.searchParams.set("scope", `eq.${approvalRecordId}`);
    url.searchParams.set("category", "eq.approval_records");
    url.searchParams.set("limit", "1");

    const response = await fetch(url.href, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        apikey: runtimeEnv.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${runtimeEnv.SUPABASE_SERVICE_ROLE_KEY}`
      },
      method: "GET"
    });
    if (!response.ok) {
      return "unavailable";
    }

    const rows = (await response.json()) as unknown;
    if (!Array.isArray(rows) || rows.length === 0) {
      return undefined;
    }

    const row = readRecord(rows[0]);
    if (
      row === undefined ||
      row.id !== approvalRecordId ||
      row.scope !== approvalRecordId ||
      row.category !== "approval_records" ||
      row.trust_level !== "trusted"
    ) {
      return "unavailable";
    }

    const payload = parseJsonRecord(row.payload_json);
    const receipt = readApprovalReceiptSnapshot(payload);
    return receipt?.actionId === actionId ? receipt : "unavailable";
  } catch {
    return "unavailable";
  }
}

function readApprovalReceiptSnapshot(record: Record<string, unknown> | undefined): ApprovalReceiptSnapshot | undefined {
  const actionId = readNonEmptyString(record?.actionId);
  const auditEntryHash = readNonEmptyString(record?.auditEntryHash);
  const status = readNonEmptyString(record?.status);
  if (actionId === undefined || auditEntryHash === undefined || !isContentHash(auditEntryHash) || status !== "human_decided") {
    return undefined;
  }

  return { actionId, auditEntryHash, status };
}

function parseJsonRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  return readRecord(parsed);
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

async function augmentGroupedWorkItemDetailFromSiblingCaches(
  runtimeEnv: RuntimeEnv,
  payload: Record<string, unknown>,
  requestedLineId: string
): Promise<Record<string, unknown>> {
  const selected = readRecord(payload.selected);
  const evidencePack = readRecord(selected?.evidencePack);
  const workItem = readRecord(payload.workItem);
  if (selected === undefined || evidencePack === undefined || workItem === undefined) {
    return payload;
  }

  const lineIds = readNonEmptyStringArray(workItem.lineIds);
  const workItemLineId = readNonEmptyString(workItem.lineId);
  const workItemId = readNonEmptyString(workItem.workItemId);
  if (
    lineIds.length <= 1 ||
    workItemLineId === undefined ||
    workItemId === undefined ||
    !lineIds.includes(requestedLineId)
  ) {
    return payload;
  }

  let mergedRecordIds = readNonEmptyStringArray(evidencePack.recordIds);
  let mergedDocuments = readRecordArray(evidencePack.documents);
  const documentKeys = new Set(mergedDocuments.map(evidenceDocumentKey));
  let changed = false;

  for (const siblingLineId of lineIds) {
    if (siblingLineId === requestedLineId) {
      continue;
    }

    const siblingCached = await readCachedReadModelPayload(runtimeEnv, mayaForensicsWorkItemReadModelKey(siblingLineId), "forensics-analyst", {
      maxAgeMs: scheduledReadModelMaxAgeMs,
      payloadSurface: "forensics-work-item-detail"
    });
    if (siblingCached === undefined || !cachedWorkItemDetailCanBeReused(siblingCached.payload, siblingLineId)) {
      continue;
    }

    const siblingSelected = readRecord(siblingCached.payload.selected);
    const siblingWorkItem = readRecord(siblingCached.payload.workItem);
    const siblingEvidencePack = readRecord(siblingSelected?.evidencePack);
    if (
      siblingSelected === undefined ||
      siblingWorkItem === undefined ||
      siblingEvidencePack === undefined ||
      readNonEmptyString(siblingWorkItem.lineId) !== workItemLineId ||
      readNonEmptyString(siblingWorkItem.workItemId) !== workItemId
    ) {
      continue;
    }

    const nextRecordIds = dedupeStrings([...mergedRecordIds, ...readNonEmptyStringArray(siblingEvidencePack.recordIds)]);
    if (nextRecordIds.length !== mergedRecordIds.length) {
      mergedRecordIds = nextRecordIds;
      changed = true;
    }

    for (const siblingDocument of readRecordArray(siblingEvidencePack.documents)) {
      const siblingDocumentKey = evidenceDocumentKey(siblingDocument);
      if (documentKeys.has(siblingDocumentKey)) {
        continue;
      }
      documentKeys.add(siblingDocumentKey);
      mergedDocuments = [...mergedDocuments, siblingDocument];
      changed = true;
    }
  }

  if (!changed) {
    return payload;
  }

  const nextPayload = structuredClone(payload);
  const nextSelected = readRecord(nextPayload.selected);
  const nextEvidencePack = readRecord(nextSelected?.evidencePack);
  if (nextSelected === undefined || nextEvidencePack === undefined) {
    return payload;
  }

  nextEvidencePack.recordIds = mergedRecordIds;
  nextEvidencePack.documents = mergedDocuments;
  const nextProvenance = readRecord(nextEvidencePack.provenance);
  if (nextProvenance !== undefined) {
    nextProvenance.recordIds = dedupeStrings([...readNonEmptyStringArray(nextProvenance.recordIds), ...mergedRecordIds]);
  }

  return nextPayload;
}

function cachedWorkItemDetailHasCanonicalEvidenceProof(
  selected: Record<string, unknown>,
  workItemLineIds: readonly string[]
): boolean {
  const evidencePack = readRecord(selected.evidencePack);
  const documents = Array.isArray(evidencePack?.documents) ? evidencePack.documents : [];
  const packetRecordIds = readNonEmptyStringArray(evidencePack?.recordIds);
  const packetProvenance = readRecord(evidencePack?.provenance);
  const packetProvenanceRecordIds = readNonEmptyStringArray(packetProvenance?.recordIds);
  const requiresGroupedScopeProof = workItemLineIds.length > 1;
  if (documents.length === 0) {
    return false;
  }

  if (
    requiresGroupedScopeProof &&
    !workItemLineIds.every(
      (lineId) => packetRecordIds.includes(lineId) && packetProvenanceRecordIds.includes(lineId)
    )
  ) {
    return false;
  }

  return documents.every((document) => {
    const record = readRecord(document);
    const evidenceId = readNonEmptyString(record?.evidenceId);
    const receiptId = readNonEmptyString(record?.receiptId);
    const contentHash = readNonEmptyString(record?.contentHash);
    const storageUri = readNonEmptyString(record?.storageUri);
    const storageHref = readNonEmptyString(record?.storageHref);

    return (
      record !== undefined &&
      evidenceId !== undefined &&
      receiptId !== undefined &&
      contentHash !== undefined &&
      isContentHash(contentHash) &&
      storageHref !== undefined &&
      (storageUri === undefined || storageUri === buildCanonicalEvidenceDocumentStorageUri(evidenceId)) &&
      isSupportedEvidenceHref(storageHref, evidenceId)
    );
  });
}

function buildCanonicalEvidenceDocumentHref(evidenceId: string): string {
  return `/api/forensics/evidence-documents/${encodeURIComponent(evidenceId)}`;
}

function buildCanonicalEvidenceDocumentStorageUri(evidenceId: string): string {
  return `supabase://recoup_evidence_documents/${evidenceId}`;
}

function isSupportedEvidenceHref(value: string, evidenceId: string): boolean {
  const normalizedHref = value.trim();
  if (/^https?:\/\//iu.test(normalizedHref)) {
    return true;
  }

  return normalizedHref === buildCanonicalEvidenceDocumentHref(evidenceId);
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNonEmptyStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(readRecord).filter((entry): entry is Record<string, unknown> => entry !== undefined) : [];
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function evidenceDocumentKey(document: Record<string, unknown>): string {
  return (
    readNonEmptyString(document.evidenceId) ??
    readNonEmptyString(document.documentId) ??
    readNonEmptyString(document.sourceRecordId) ??
    JSON.stringify(document)
  );
}

function isContentHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function isSafeTableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(value);
}

function collectWorkItemDetailRecordIds(payload: Record<string, unknown>, lineId: string): string[] {
  const recordIds = new Set<string>([lineId]);
  collectRecordIds(payload, recordIds);

  return [...recordIds].filter((recordId) => recordId.trim().length > 0);
}

function collectRecordIds(value: unknown, recordIds: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRecordIds(item, recordIds);
    }
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "recordIds" && Array.isArray(nestedValue)) {
      for (const recordId of nestedValue) {
        if (typeof recordId === "string") {
          recordIds.add(recordId);
        }
      }
      continue;
    }

    collectRecordIds(nestedValue, recordIds);
  }
}

import { loadLocalRuntimeEnvFiles } from "../../../../../../config/localRuntimeEnv.ts";
import { buildVerifiedHumanAuthHeaders } from "../../../human-auth.ts";
import {
  mayaForensicsWorkItemReadModelKey,
  publishCachedReadModelPayload,
  readCachedReadModelPayload,
  readModelJsonResponse,
  readModelCacheHeader,
  refreshReadModelAfterResponse
} from "../../../read-model-cache.ts";

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
    payloadSurface: "forensics-work-item-detail"
  });
  if (cached !== undefined) {
    refreshReadModelAfterResponse(runtimeEnv, authHeaders, {
      method: "GET",
      path: `/forensics/work-items/${encodeURIComponent(lineId)}`
    });
    return readModelJsonResponse(cached.payload, "hit", { sourceRefreshedAt: cached.sourceRefreshedAt });
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
      if (payload !== undefined) {
        await publishCachedReadModelPayload(runtimeEnv, {
          modelKey,
          payload,
          payloadSurface: "forensics-work-item-detail",
          rowSurface: "forensics-analyst",
          sourceRecordIds: collectWorkItemDetailRecordIds(payload, lineId)
        });
      }
    }

    return new Response(body, {
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        ...(upstream.ok ? { [readModelCacheHeader]: upstream.headers.get(readModelCacheHeader) ?? "miss" } : {})
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

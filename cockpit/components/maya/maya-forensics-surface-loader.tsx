"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  ConnectorReadinessCockpitModel,
  ForensicsCockpitModel
} from "../../app/cockpit-data.ts";
import type { DemoSession } from "../../app/demo-auth.ts";
import { MayaForensicsSurface } from "./maya-forensics-surface.tsx";
import { MayaShadcnLoadingShell } from "./maya-shadcn-loading-shell.tsx";
import type { MayaForensicsBusinessFreshness } from "./types.ts";

const readModelCacheHeader = "x-recoup-read-model-cache";
const readModelSourceHashHeader = "x-recoup-read-model-source-hash";
const readModelReceiptHashHeader = "x-recoup-read-model-receipt-hash";

type LoaderState =
  | { status: "loading" }
  | {
      connectors: ConnectorReadinessCockpitModel;
      businessFreshness: MayaForensicsBusinessFreshness;
      model: ForensicsCockpitModel;
      modelVersion: number;
      status: "ready";
    }
  | { message: string; status: "error" };
type RefreshState =
  | { status: "idle" }
  | { status: "refreshing" }
  | { message: string; status: "error" };
interface ForensicsInvalidationEvent {
  generatedAt: string;
  receiptHash: string;
  sourceHash: string;
  type: "forensics-read-model-invalidated";
}
type CurrentBusinessHashes = { receiptHash?: string; sourceHash?: string };

export function MayaForensicsSurfaceLoader({ session }: Readonly<{ session: DemoSession }>) {
  const [state, setState] = useState<LoaderState>({ status: "loading" });
  const [refreshState, setRefreshState] = useState<RefreshState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const currentHashesRef = useRef<CurrentBusinessHashes>({});
  const refreshInFlightRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  const sseReloadInFlightRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    refreshRequestIdRef.current += 1;
    refreshInFlightRef.current = false;
    setState({ status: "loading" });

    void loadMayaForensicsModels(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          currentHashesRef.current = currentBusinessHashesFromFreshness(loaded.businessFreshness);
          setState({ status: "ready", ...loaded, modelVersion: reloadKey });
          setRefreshState({ status: "idle" });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            message: error instanceof Error ? error.message : "Maya workspace data is unavailable.",
            status: "error"
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [reloadKey]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      markBusinessFreshnessDegraded("Forensics live invalidation stream is unavailable in this browser.");
      return;
    }

    const events = new EventSource("/api/forensics/events");
    events.addEventListener("connected", () => {
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              businessFreshness: connectedBusinessFreshness(current.businessFreshness)
            }
          : current
      );
    });
    events.addEventListener("forensics-read-model-invalidated", (message) => {
      const event = parseForensicsInvalidationEvent(message);
      if (event === undefined) {
        return;
      }

      void reloadForSseInvalidation(event);
    });
    events.onerror = () => {
      markBusinessFreshnessDegraded("Forensics live invalidation stream is degraded; displayed business data may be stale.");
    };

    return () => {
      events.close();
    };
  }, []);

  async function handleRefreshSources(): Promise<void> {
    if (state.status !== "ready" || refreshInFlightRef.current) {
      return;
    }

    const refreshRequestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = refreshRequestId;
    refreshInFlightRef.current = true;
    setRefreshState({ status: "refreshing" });
    try {
      const loaded = await refreshMayaForensicsModels();
      if (refreshRequestIdRef.current !== refreshRequestId) {
        return;
      }
      setState((current) => {
        if (current.status !== "ready") {
          return current;
        }

        currentHashesRef.current = currentBusinessHashesFromFreshness(loaded.businessFreshness);

        return {
          status: "ready",
          ...loaded,
          modelVersion: current.modelVersion + 1
        };
      });
      setRefreshState({ status: "idle" });
    } catch (error) {
      if (refreshRequestIdRef.current !== refreshRequestId) {
        return;
      }
      setRefreshState({
        message: error instanceof Error ? error.message : "Maya source refresh failed.",
        status: "error"
      });
    } finally {
      if (refreshRequestIdRef.current === refreshRequestId) {
        refreshInFlightRef.current = false;
      }
    }
  }

  async function reloadForSseInvalidation(event: ForensicsInvalidationEvent): Promise<void> {
    const currentHashes = currentHashesRef.current;
    if (event.sourceHash !== currentHashes.sourceHash || event.receiptHash !== currentHashes.receiptHash) {
      if (sseReloadInFlightRef.current) {
        return;
      }
      sseReloadInFlightRef.current = true;
      try {
        const loaded = await loadMayaForensicsModels(undefined);
        currentHashesRef.current = currentBusinessHashesFromFreshness(loaded.businessFreshness);
        setState((current) => {
          if (current.status !== "ready") {
            return current;
          }

          return {
            status: "ready",
            ...loaded,
            modelVersion: current.modelVersion + 1
          };
        });
      } catch {
        markBusinessFreshnessDegraded("Forensics live invalidation arrived, but the refreshed business model is unavailable.");
      } finally {
        sseReloadInFlightRef.current = false;
      }
    }
  }

  function markBusinessFreshnessDegraded(message: string): void {
    setState((current) =>
      current.status === "ready"
        ? {
            ...current,
            businessFreshness: {
              ...current.businessFreshness,
              message,
              status: "degraded",
              updatedAtIso: new Date().toISOString()
            }
          }
        : current
    );
  }

  if (state.status === "loading") {
    return <MayaShadcnLoadingShell />;
  }

  if (state.status === "error") {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6" data-testid="maya-shadcn-load-error">
        <Alert className="max-w-xl border-destructive/35 bg-destructive/5">
          <AlertTriangleIcon aria-hidden="true" className="size-4" />
          <AlertTitle>Forensics workspace unavailable</AlertTitle>
          <AlertDescription className="grid gap-4">
            <span>{state.message}</span>
            <Button
              className="w-fit gap-2"
              onClick={() => {
                setReloadKey((value) => value + 1);
              }}
              type="button"
              variant="outline"
            >
              <RefreshCwIcon aria-hidden="true" className="size-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <MayaForensicsSurface
      connectors={state.connectors}
      businessFreshness={state.businessFreshness}
      model={state.model}
      modelVersion={state.modelVersion}
      onRefreshSources={() => {
        void handleRefreshSources();
      }}
      {...(refreshState.status === "error" ? { refreshError: refreshState.message } : {})}
      refreshStatus={refreshState.status}
      session={session}
    />
  );
}

async function loadMayaForensicsModels(signal: AbortSignal | undefined): Promise<{
  connectors: ConnectorReadinessCockpitModel;
  businessFreshness: MayaForensicsBusinessFreshness;
  model: ForensicsCockpitModel;
}> {
  const [modelResponse, connectors] = await Promise.all([
    fetchJsonWithHeaders("/api/forensics", signal, "Forensics workbench"),
    fetchJson("/api/connectors", signal, "Connector readiness")
  ]);
  const model = modelResponse.body;

  if (!isForensicsCockpitModel(model)) {
    throw new Error("Forensics workbench returned an invalid backend model.");
  }
  if (!isConnectorReadinessModel(connectors)) {
    throw new Error("Connector readiness returned an invalid backend model.");
  }

  return {
    businessFreshness: businessFreshnessFromHeaders(modelResponse.headers),
    connectors,
    model
  };
}

async function refreshMayaForensicsModels(): Promise<{
  connectors: ConnectorReadinessCockpitModel;
  businessFreshness: MayaForensicsBusinessFreshness;
  model: ForensicsCockpitModel;
}> {
  const [modelResponse, connectors] = await Promise.all([
    fetchJsonWithHeaders("/api/forensics/refresh", undefined, "Forensics source refresh", { method: "POST" }),
    fetchJson("/api/connectors", undefined, "Connector readiness")
  ]);
  const model = modelResponse.body;

  if (!isForensicsCockpitModel(model)) {
    throw new Error("Forensics source refresh returned an invalid backend model.");
  }
  if (!isConnectorReadinessModel(connectors)) {
    throw new Error("Connector readiness returned an invalid backend model.");
  }

  return {
    businessFreshness: businessFreshnessFromHeaders(modelResponse.headers),
    connectors,
    model
  };
}

async function fetchJson(
  path: string,
  signal: AbortSignal | undefined,
  label: string,
  init: RequestInit = {}
): Promise<unknown> {
  return (await fetchJsonWithHeaders(path, signal, label, init)).body;
}

async function fetchJsonWithHeaders(
  path: string,
  signal: AbortSignal | undefined,
  label: string,
  init: RequestInit = {}
): Promise<{ body: unknown; headers: Headers }> {
  const response =
    signal === undefined
      ? await fetch(path, { cache: "no-store", ...init })
      : await fetch(path, { cache: "no-store", ...init, signal });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status.toString()}.`);
  }

  return { body: (await response.json()) as unknown, headers: response.headers };
}

function businessFreshnessFromHeaders(headers: Headers): MayaForensicsBusinessFreshness {
  const freshness: MayaForensicsBusinessFreshness = {
    status: "connected",
    updatedAtIso: new Date().toISOString()
  };
  const cacheStatus = headers.get(readModelCacheHeader);
  const receiptHash = headers.get(readModelReceiptHashHeader);
  const sourceHash = headers.get(readModelSourceHashHeader);
  if (cacheStatus !== null) {
    freshness.cacheStatus = cacheStatus;
  }
  if (receiptHash !== null) {
    freshness.receiptHash = receiptHash;
  }
  if (sourceHash !== null) {
    freshness.sourceHash = sourceHash;
  }

  return freshness;
}

function connectedBusinessFreshness(current: MayaForensicsBusinessFreshness): MayaForensicsBusinessFreshness {
  const next: MayaForensicsBusinessFreshness = {
    status: "connected",
    updatedAtIso: new Date().toISOString()
  };
  if (current.cacheStatus !== undefined) {
    next.cacheStatus = current.cacheStatus;
  }
  if (current.receiptHash !== undefined) {
    next.receiptHash = current.receiptHash;
  }
  if (current.sourceHash !== undefined) {
    next.sourceHash = current.sourceHash;
  }

  return next;
}

function currentBusinessHashesFromFreshness(freshness: MayaForensicsBusinessFreshness): CurrentBusinessHashes {
  const hashes: CurrentBusinessHashes = {};
  if (freshness.receiptHash !== undefined) {
    hashes.receiptHash = freshness.receiptHash;
  }
  if (freshness.sourceHash !== undefined) {
    hashes.sourceHash = freshness.sourceHash;
  }

  return hashes;
}

function parseForensicsInvalidationEvent(event: Event): ForensicsInvalidationEvent | undefined {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return undefined;
  }

  try {
    const parsed = JSON.parse(event.data) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }
    if (
      parsed.type === "forensics-read-model-invalidated" &&
      typeof parsed.generatedAt === "string" &&
      isHashString(parsed.receiptHash) &&
      isHashString(parsed.sourceHash)
    ) {
      return {
        generatedAt: parsed.generatedAt,
        receiptHash: parsed.receiptHash,
        sourceHash: parsed.sourceHash,
        type: parsed.type
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isHashString(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isForensicsCockpitModel(value: unknown): value is ForensicsCockpitModel {
  return (
    isRecord(value) &&
    value.surface === "forensics-analyst" &&
    Array.isArray(value.kpiStrip) &&
    Array.isArray(value.worklist) &&
    isRecord(value.selected) &&
    typeof value.selected.lineId === "string" &&
    Array.isArray(value.actionInbox) &&
    isRecord(value.multimodalDock) &&
    Array.isArray(value.mayaJourney) &&
    isRecord(value.recoveryTracker) &&
    Array.isArray(value.retrievalStatus) &&
    isRecord(value.containmentPanel) &&
    typeof value.whatChanged === "string" &&
    typeof value.aiInsight === "string"
  );
}

function isConnectorReadinessModel(value: unknown): value is ConnectorReadinessCockpitModel {
  return (
    isRecord(value) &&
    value.surface === "connector-readiness" &&
    typeof value.checkedAtIso === "string" &&
    typeof value.lastRefreshedLabel === "string" &&
    Array.isArray(value.sourceHealth) &&
    Array.isArray(value.sourceTiles) &&
    Array.isArray(value.connectors)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

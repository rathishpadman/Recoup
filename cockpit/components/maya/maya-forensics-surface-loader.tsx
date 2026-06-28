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

type LoaderState =
  | { status: "loading" }
  | {
      connectors: ConnectorReadinessCockpitModel;
      model: ForensicsCockpitModel;
      modelVersion: number;
      status: "ready";
    }
  | { message: string; status: "error" };
type RefreshState =
  | { status: "idle" }
  | { status: "refreshing" }
  | { message: string; status: "error" };

export function MayaForensicsSurfaceLoader({ session }: Readonly<{ session: DemoSession }>) {
  const [state, setState] = useState<LoaderState>({ status: "loading" });
  const [refreshState, setRefreshState] = useState<RefreshState>({ status: "idle" });
  const [reloadKey, setReloadKey] = useState(0);
  const refreshInFlightRef = useRef(false);
  const refreshRequestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    refreshRequestIdRef.current += 1;
    refreshInFlightRef.current = false;
    setState({ status: "loading" });

    void loadMayaForensicsModels(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
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
      key={state.modelVersion}
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

async function loadMayaForensicsModels(signal: AbortSignal): Promise<{
  connectors: ConnectorReadinessCockpitModel;
  model: ForensicsCockpitModel;
}> {
  const [model, connectors] = await Promise.all([
    fetchJson<ForensicsCockpitModel>("/api/forensics", signal, "Forensics workbench"),
    fetchJson<ConnectorReadinessCockpitModel>("/api/connectors", signal, "Connector readiness")
  ]);

  if (!isForensicsCockpitModel(model)) {
    throw new Error("Forensics workbench returned an invalid backend model.");
  }
  if (!isConnectorReadinessModel(connectors)) {
    throw new Error("Connector readiness returned an invalid backend model.");
  }

  return { connectors, model };
}

async function refreshMayaForensicsModels(): Promise<{
  connectors: ConnectorReadinessCockpitModel;
  model: ForensicsCockpitModel;
}> {
  const [model, connectors] = await Promise.all([
    fetchJson<ForensicsCockpitModel>("/api/forensics/refresh", undefined, "Forensics source refresh", { method: "POST" }),
    fetchJson<ConnectorReadinessCockpitModel>("/api/connectors", undefined, "Connector readiness")
  ]);

  if (!isForensicsCockpitModel(model)) {
    throw new Error("Forensics source refresh returned an invalid backend model.");
  }
  if (!isConnectorReadinessModel(connectors)) {
    throw new Error("Connector readiness returned an invalid backend model.");
  }

  return { connectors, model };
}

async function fetchJson<T>(
  path: string,
  signal: AbortSignal | undefined,
  label: string,
  init: RequestInit = {}
): Promise<T> {
  const response =
    signal === undefined
      ? await fetch(path, { cache: "no-store", ...init })
      : await fetch(path, { cache: "no-store", ...init, signal });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status.toString()}.`);
  }

  return (await response.json()) as T;
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

"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
      status: "ready";
    }
  | { message: string; status: "error" };

export function MayaForensicsSurfaceLoader({ session }: Readonly<{ session: DemoSession }>) {
  const [state, setState] = useState<LoaderState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void loadMayaForensicsModels(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", ...loaded });
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

  return <MayaForensicsSurface connectors={state.connectors} model={state.model} session={session} />;
}

async function loadMayaForensicsModels(signal: AbortSignal): Promise<{
  connectors: ConnectorReadinessCockpitModel;
  model: ForensicsCockpitModel;
}> {
  const [model, connectors] = await Promise.all([
    fetchJson<ForensicsCockpitModel>("/api/forensics", signal, "Forensics workbench"),
    fetchJson<ConnectorReadinessCockpitModel>("/api/connectors", signal, "Connector readiness")
  ]);

  return { connectors, model };
}

async function fetchJson<T>(path: string, signal: AbortSignal, label: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status.toString()}.`);
  }

  return (await response.json()) as T;
}

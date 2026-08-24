"use client";

import { useRouter } from "next/navigation.js";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { CollapsiblePanel } from "./collapsible-panel.tsx";

/**
 * Sends one test payment from the screen.
 *
 * Until this existed a finance user could read the results but never produce
 * any: sending needed a signed request, so the person the screen is built for
 * had to ask someone else to run a command to see their own system work.
 *
 * The scenarios come from the backend rather than being listed here, so the
 * dropdown cannot drift from what the server will actually accept. The shared
 * secret stays on the server; the browser only names a scenario.
 */

interface Scenario {
  id: string;
  name: string;
  expectation: string;
}

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; message: string }
  | { status: "failed"; message: string };

export function SendTestPayment() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [chosen, setChosen] = useState("");
  const [state, setState] = useState<SendState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/rehearsal/test-payment-scenarios")
      .then(async (response): Promise<{ scenarios?: Scenario[] }> =>
        response.ok ? ((await response.json()) as { scenarios?: Scenario[] }) : { scenarios: [] }
      )
      .then((body) => {
        if (cancelled) {
          return;
        }

        const list = body.scenarios ?? [];
        setScenarios(list);
        setChosen(list[0]?.id ?? "");
      })
      .catch(() => {
        // Leaving the list empty disables the control, which is the honest
        // outcome: if the scenarios cannot be read, nothing can be sent.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selected = scenarios.find((scenario) => scenario.id === chosen);

  async function send(): Promise<void> {
    setState({ status: "sending" });

    try {
      const response = await fetch("/api/rehearsal/send-test-payment", {
        body: JSON.stringify({ scenario: chosen }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        setState({
          status: "failed",
          message:
            response.status === 404
              ? "Test payments are not enabled on this deployment."
              : "The payment could not be sent."
        });
        return;
      }

      const body = (await response.json()) as { state?: string; caseId?: string | null };
      const outcome =
        body.state === "Ready"
          ? body.caseId === null || body.caseId === undefined
            ? "Finished. Nothing was deducted, so no case was raised."
            : "Finished and raised a case."
          : body.state === "AwaitingCashReceipt"
            ? "Holding, because the money is not confirmed."
            : `Stopped at ${String(body.state)}.`;

      setState({ status: "sent", message: `Sent. ${outcome}` });
      router.refresh();
    } catch {
      setState({ status: "failed", message: "The send service is unavailable." });
    }
  }

  return (
    <CollapsiblePanel testId="send-test-payment" title="Send a test payment">
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Pick a situation and send it. The payment appears in the list below within a few seconds.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="test-payment-scenario">
            Scenario
          </label>
          <select
            id="test-payment-scenario"
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            value={chosen}
            disabled={scenarios.length === 0 || state.status === "sending"}
            onChange={(event) => {
              setChosen(event.target.value);
              setState({ status: "idle" });
            }}
            data-testid="send-test-payment-scenario"
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
            disabled={chosen === "" || state.status === "sending"}
            onClick={() => void send()}
            data-testid="send-test-payment-send"
          >
            {state.status === "sending" ? "Sending…" : "Send"}
          </button>

          {selected === undefined ? null : (
            <Badge variant="secondary" data-testid="send-test-payment-expectation">
              {selected.expectation}
            </Badge>
          )}
        </div>

        <p aria-live="polite" className="text-sm" data-testid="send-test-payment-status">
          {state.status === "sent" || state.status === "failed"
            ? state.message
            : state.status === "sending"
              ? "Sending the payment note."
              : scenarios.length === 0
                ? "Test payments are not available here."
                : "Ready."}
        </p>
      </div>
    </CollapsiblePanel>
  );
}

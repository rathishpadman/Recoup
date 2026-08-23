"use client";

import { useRouter } from "next/navigation.js";
import { useState } from "react";

/**
 * Clears the cash application slice between test cycles.
 *
 * MVP affordance. Every cash row is test data here, so this removes all of
 * them: runs, events, cases, allocations, remittances, receipts and inbox rows.
 * It is the only path that can delete from those tables — they are append-only
 * for every other caller — so it asks twice before doing it.
 *
 * The counts it reports come back from the database, not from anything counted
 * here, so the message says what was actually removed.
 */

type ResetState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "resetting" }
  | { status: "done"; summary: string }
  | { status: "failed"; message: string };

export function CashDemoResetControl() {
  const router = useRouter();
  const [state, setState] = useState<ResetState>({ status: "idle" });

  async function reset(): Promise<void> {
    setState({ status: "resetting" });

    try {
      const response = await fetch("/api/admin/cash-demo-reset", {
        body: JSON.stringify({ confirm: "reset-cash-demo-data" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        setState({
          status: "failed",
          message:
            response.status === 404
              ? "Cash demo reset is not enabled on this deployment."
              : "Reset failed. Nothing was removed."
        });
        return;
      }

      const body = (await response.json()) as { deleted?: Record<string, number> };
      const deleted = body.deleted ?? {};
      const total = Object.values(deleted).reduce((sum, count) => sum + count, 0);

      setState({
        status: "done",
        summary:
          total === 0
            ? "Nothing to remove: the cash slice was already empty."
            : `Removed ${String(total)} rows — ${Object.entries(deleted)
                .filter(([, count]) => count > 0)
                .map(([table, count]) => `${String(count)} ${table.replace(/_/gu, " ")}`)
                .join(", ")}.`
      });
      router.refresh();
    } catch {
      setState({ status: "failed", message: "Reset service unavailable." });
    }
  }

  return (
    <section className="governance-surface" data-testid="cash-demo-reset">
      <header>
        <h2>Cash application test data</h2>
        <p>
          Clears every cash run, case, allocation, remittance and receipt so the next test cycle
          starts from an empty Agent Operations screen. This cannot be undone.
        </p>
      </header>

      {state.status === "confirming" ? (
        <div role="alertdialog" aria-label="Confirm cash demo reset">
          <p>
            <strong>Remove all cash test data?</strong> Agent Operations will be empty afterwards
            and the removed rows cannot be recovered.
          </p>
          <button type="button" onClick={() => void reset()} data-testid="cash-demo-reset-confirm">
            Yes, remove it
          </button>
          <button
            type="button"
            onClick={() => {
              setState({ status: "idle" });
            }}
            data-testid="cash-demo-reset-cancel"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={state.status === "resetting"}
          onClick={() => {
            setState({ status: "confirming" });
          }}
          data-testid="cash-demo-reset-start"
        >
          {state.status === "resetting" ? "Removing…" : "Reset cash test data"}
        </button>
      )}

      <p aria-live="polite" data-testid="cash-demo-reset-status">
        {state.status === "done"
          ? state.summary
          : state.status === "failed"
            ? state.message
            : state.status === "resetting"
              ? "Removing cash test data."
              : "Ready."}
      </p>
    </section>
  );
}

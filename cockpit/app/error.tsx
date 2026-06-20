"use client";

import { WarningIcon as Warning } from "@phosphor-icons/react/dist/csr/Warning";

export default function Error({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="state-shell">
      <section className="state-panel error-state" role="alert">
        <div className="state-mark">
          <Warning size={22} />
        </div>
        <p className="micro">Recovery service unavailable</p>
        <h1>Unable to load the cockpit</h1>
        <p>The UI is intact, but the read-model API did not return the governed recovery state.</p>
        <button
          onClick={() => {
            reset();
          }}
          type="button"
        >
          Retry loading
        </button>
      </section>
    </main>
  );
}

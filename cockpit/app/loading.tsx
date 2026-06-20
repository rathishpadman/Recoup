import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/dist/ssr/CircleNotch";

export default function Loading() {
  return (
    <main className="state-shell">
      <section aria-busy="true" className="state-panel" aria-label="Loading Recoup cockpit">
        <div className="state-mark">
          <CircleNotch size={22} />
        </div>
        <p className="micro">Loading cockpit</p>
        <h1>Preparing governed recovery work</h1>
        <p>Retrieving cited read models, audit trace, memory state, and approval queues.</p>
        <div className="skeleton-stack" aria-hidden="true">
          <span className="skeleton-line wide" />
          <span className="skeleton-line" />
          <span className="skeleton-line short" />
        </div>
      </section>
    </main>
  );
}

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The right-hand column has to be closeable.
 *
 * Reported from the screen: "the right side panel is not collapsible it just
 * extends". Four panels stack there — send, handoffs, run details, ledger —
 * and every one of them grows with its content. A run with a dozen events
 * pushes the ledger far below the fold, and because the panels above it cannot
 * be closed there is no way to bring it back up. The page becomes a column you
 * scroll rather than a workspace you read.
 *
 * Two separate things are asserted, because they fail independently:
 *
 *  - each panel opens and closes, so a reader can put away what they are not
 *    using;
 *  - the ledger scrolls inside its own panel, so one long run cannot set the
 *    height of the page.
 *
 * The Card lives in the shared wrapper rather than in each panel, which keeps
 * the "at most one Card per component" design rule intact.
 */

const DIR = "cockpit/components/agent-operations";

function source(file: string): string {
  return readFileSync(`${DIR}/${file}`, "utf8");
}

/** The panels stacked in the right-hand column. */
const COLLAPSIBLE_PANELS = [
  "send-test-payment.tsx",
  "handoff-graph.tsx",
  "run-detail.tsx",
  "activity-ledger.tsx"
];

describe("the right-hand column can be put away", () => {
  it("offers a shared collapsible panel rather than four separate solutions", () => {
    expect(readdirSync(DIR)).toContain("collapsible-panel.tsx");
  });

  it("builds the panel on the design system's collapsible, not a hand-rolled toggle", () => {
    const panel = source("collapsible-panel.tsx");

    expect(panel).toContain("@/components/ui/collapsible");
    expect(panel).toContain("CollapsibleTrigger");
  });

  it("gives the trigger a stable testid so the state is reachable", () => {
    expect(source("collapsible-panel.tsx")).toContain("-toggle");
  });

  it.each(COLLAPSIBLE_PANELS)("closes and reopens %s", (file) => {
    const panel = source(file);

    expect(panel).toContain("CollapsiblePanel");
    // A panel that still opens its own Card is not inside the wrapper.
    expect(panel).not.toMatch(/<Card(?![A-Za-z])/u);
  });
});

describe("one long run does not set the height of the page", () => {
  it("scrolls the ledger inside its own panel", () => {
    const ledger = source("activity-ledger.tsx");

    expect(ledger).toMatch(/max-h-/u);
    expect(ledger).toMatch(/overflow-(y-)?auto/u);
  });

  it("keeps the ledger header visible while its rows scroll", () => {
    // Scrolling a table without pinning its header leaves the reader looking
    // at six unlabelled columns.
    expect(source("activity-ledger.tsx")).toMatch(/sticky/u);
  });
});

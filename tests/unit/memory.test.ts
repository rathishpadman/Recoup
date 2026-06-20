import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "../../src/memory/store.js";
import { readSessionState, writeSessionState } from "../../src/memory/session.js";

describe("memory store", () => {
  it("writes and reads session state by scope", () => {
    const store = createInMemoryStore();
    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-HARBOR-ORDER-640K",
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });

    expect(readSessionState(store, "session-demo", "active-case")).toMatchObject({
      category: "session_state",
      payload: { key: "active-case", value: "ARB-HARBOR-ORDER-640K" },
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });
  });

  it("returns the latest current-state record for repeated deterministic IDs", () => {
    const store = createInMemoryStore();

    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-HARBOR-ORDER-640K",
      recordIds: ["ARB-HARBOR-ORDER-640K"]
    });
    writeSessionState(store, {
      sessionId: "session-demo",
      key: "active-case",
      value: "ARB-CRESTLINE-DEDUCTION",
      recordIds: ["ARB-CRESTLINE-DEDUCTION"]
    });

    expect(readSessionState(store, "session-demo", "active-case")).toMatchObject({
      payload: { key: "active-case", value: "ARB-CRESTLINE-DEDUCTION" },
      recordIds: ["ARB-CRESTLINE-DEDUCTION"]
    });
    expect(store.list("session:session-demo")).toHaveLength(1);
  });
});

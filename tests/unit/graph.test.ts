import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { scoreCorroborationGraph } from "../../src/core/graph.js";

describe("corroboration graph scoring", () => {
  it("ranks mutually corroborating source nodes above isolated noise nodes", () => {
    const result = scoreCorroborationGraph({
      nodes: [{ id: "pod" }, { id: "carrier" }, { id: "photo" }, { id: "sap" }, { id: "noise" }],
      edges: [
        { from: "pod", to: "carrier", weight: "3" },
        { from: "pod", to: "photo", weight: "2" },
        { from: "pod", to: "sap", weight: "1" },
        { from: "carrier", to: "photo", weight: "1" }
      ],
      iterations: 20
    });

    expect(result[0]?.nodeId).toBe("pod");
    expect(result[0]?.score.gt(result[1]?.score ?? new Decimal(0))).toBe(true);
    expect(result.at(-1)?.nodeId).toBe("noise");
    expect(result[result.length - 2]?.score.gt(result.at(-1)?.score ?? new Decimal(0))).toBe(true);
  });

  it("returns identical ordered score strings for identical inputs", () => {
    const input = {
      nodes: [{ id: "sap" }, { id: "pod" }, { id: "carrier" }, { id: "noise" }],
      edges: [
        { from: "sap", to: "pod", weight: "2" },
        { from: "pod", to: "carrier", weight: "1" }
      ],
      iterations: 8
    };

    const first = scoreCorroborationGraph(input).map((entry) => `${entry.nodeId}:${entry.score.toFixed(18)}`);
    const second = scoreCorroborationGraph(input).map((entry) => `${entry.nodeId}:${entry.score.toFixed(18)}`);

    expect(second).toEqual(first);
  });

  it("returns only node IDs and Decimal scores without dollar or amount fields", () => {
    const [entry] = scoreCorroborationGraph({
      nodes: [{ id: "pod" }, { id: "carrier" }],
      edges: [{ from: "pod", to: "carrier", weight: "1" }],
      iterations: 4
    });

    expect(typeof entry?.nodeId).toBe("string");
    expect(entry?.score).toBeInstanceOf(Decimal);
    expect(Object.keys(entry ?? {}).sort()).toEqual(["nodeId", "score"]);
    expect(Object.keys(entry ?? {}).some((key) => key.toLowerCase().includes("amount"))).toBe(false);
    expect(Object.keys(entry ?? {}).some((key) => key.toLowerCase().includes("dollar"))).toBe(false);
  });

  it("rejects invalid graph inputs without producing a score", () => {
    expect(() => scoreCorroborationGraph({ nodes: [], edges: [], iterations: 1 })).toThrow(
      "Corroboration graph requires at least one node."
    );
    expect(() =>
      scoreCorroborationGraph({ nodes: [{ id: "pod" }], edges: [], iterations: 0 })
    ).toThrow("Corroboration graph iterations must be at least 1.");
    expect(() =>
      scoreCorroborationGraph({
        nodes: [{ id: "pod" }],
        edges: [{ from: "pod", to: "missing", weight: "1" }],
        iterations: 1
      })
    ).toThrow("Corroboration graph edge references an unknown node.");
    expect(() =>
      scoreCorroborationGraph({
        nodes: [{ id: "pod" }, { id: "carrier" }],
        edges: [{ from: "pod", to: "carrier", weight: "-1" }],
        iterations: 1
      })
    ).toThrow("Corroboration graph edge weights cannot be negative.");
    expect(() =>
      scoreCorroborationGraph({
        nodes: [{ id: "pod" }, { id: "carrier" }],
        edges: [{ from: "pod", to: "carrier", weight: "0" }],
        iterations: 1
      })
    ).toThrow("Corroboration graph edge weights must be greater than 0.");
  });
});

import { describe, expect, it } from "vitest";
import { createMcpToolFacade } from "../../src/mcp/server.js";

describe("MCP tool visibility", () => {
  it("does not expose internal core or decision tools through MCP", () => {
    const names = createMcpToolFacade().listTools().map((tool) => tool.name);

    expect(names).not.toContain("core.evaluateRule");
    expect(names).not.toContain("core.riskMeshClosedLoop");
    expect(names).not.toContain("decisions.deductionVerdict");
    expect(names).not.toContain("approvals.decide");
    expect(names).toContain("retrieval.sap");
    expect(names).toContain("audit.read");
  });

  it("denies draft action calls from read-only MCP clients", () => {
    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:cfo"
    });

    expect(() => facade.callTool("actions.draftRebill", { decisionId: "deduction-decision:S1-L2" })).toThrow(
      "Actor is not permitted to create draft-only action artifacts."
    );
    expect(facade.callTool("query.answer", { question: "Show cited status" })).toMatchObject({
      status: "disabled_offline_safe"
    });
  });
});

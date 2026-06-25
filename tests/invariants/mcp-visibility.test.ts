import { describe, expect, it } from "vitest";
import { day1GovernedConfigSeed } from "../../config/governed.js";
import type { SourcePort, SourceRiskObservationSnapshot } from "../../src/adapters/source.js";
import { SyntheticSource } from "../../src/adapters/synthetic.js";
import { createMcpToolFacade } from "../../src/mcp/server.js";
import { fixtureForensicsServiceContext } from "../helpers/forensics-fixtures.js";

const governedConfig = day1GovernedConfigSeed.values;
const source = new SyntheticSource({ seed: 42 });

describe("MCP tool visibility", () => {
  it("does not expose internal core or decision tools through MCP", () => {
    const names = createMcpToolFacade().listTools().map((tool) => tool.name);

    expect(names).not.toContain("core.evaluateRule");
    expect(names).not.toContain("core.riskMeshClosedLoop");
    expect(names).not.toContain("decisions.deductionVerdict");
    expect(names).not.toContain("approvals.decide");
    expect(names).toContain("retrieval.sap");
    expect(names).toContain("retrieval.bureau");
    expect(names).toContain("sources.r1Read");
    expect(names).toContain("audit.read");
    expect(names).toContain("agent_tool_sentinel_position");
    expect(names).toContain("agent_tool_containment_intent_position");
  });

  it("exposes read-only agent-to-agent advisory tools without exposing internal core decisions", () => {
    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:david-lead",
      serviceContext: { governedConfig, source }
    });

    expect(facade.callTool("agent_tool_sentinel_position", { caseId: "ARB-HARBOR-ORDER-640K" })).toMatchObject({
      customerId: "CUST-HARBOR",
      status: "blocked"
    });
    expect(facade.callTool("agent_tool_containment_intent_position", { caseId: "ARB-HARBOR-ORDER-640K" })).toMatchObject({
      contained: false,
      customerId: "CUST-HARBOR",
      intentLabel: "distressed-honest"
    });
    expect(() => facade.callTool("agent_tool_sentinel_position", { caseId: "not-harbor" })).toThrow();
  });

  it("exposes the R1 source-read tool through MCP as read-only source provenance", () => {
    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:maya-lead"
    });

    expect(facade.callTool("sources.r1Read", { need: "payment-history", customerId: "USCU_S04" })).toMatchObject({
      need: "payment-history",
      provenance: {
        ownerInput: "R2-5",
        primary: "supabase"
      },
      sourceMode: "supabase_authoritative"
    });
  });

  it("fails closed instead of using static Harbor containment evidence when MCP has no source risk snapshot", () => {
    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:david-lead",
      serviceContext: {
        governedConfig,
        source: sourceWithRiskObservationSnapshot(undefined)
      }
    });

    expect(() => facade.callTool("agent_tool_containment_intent_position", { caseId: "ARB-HARBOR-ORDER-640K" })).toThrow(
      "Harbor Containment requires a cited source risk observation snapshot."
    );
  });

  it("uses source-backed Harbor risk observation record IDs for MCP containment intent", () => {
    const recordIds = ["CUST-HARBOR", "USCU_S04", "90000036", "90000085", "BUREAU-HARBOR-TAX-LIEN"];
    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:david-lead",
      serviceContext: {
        governedConfig,
        source: sourceWithRiskObservationSnapshot({
          customerId: "CUST-HARBOR",
          observedSignals: {
            baselineDsoDays: 32,
            currentDsoDays: 51,
            disputeSpike: true,
            lienSignal: true
          },
          rDriftObservations: {
            baselineDsoDays: 32,
            currentDsoDays: 51
          },
          recordIds,
          sourceNormalization: {
            missingFields: [
              "rScoreComponentScores.agingConcentration",
              "rScoreComponentScores.disputeRate",
              "rScoreComponentScores.dsoAdp",
              "rScoreComponentScores.overLimitFrequency"
            ],
            sourcePort: "SourcePort.loadRiskObservationSnapshot"
          }
        })
      }
    });

    const result = facade.callTool("agent_tool_containment_intent_position", { caseId: "ARB-HARBOR-ORDER-640K" }) as {
      deterministicBasis: { sourcePort: string };
      recordIds: string[];
    };

    expect(result.recordIds).toEqual(recordIds);
    expect(result.recordIds).not.toContain("LEDGER-HARBOR-DISTRESSED-HONEST");
    expect(result.deterministicBasis.sourcePort).toBe("SourcePort.loadRiskObservationSnapshot");
  });

  it("denies draft action calls from read-only MCP clients", () => {
    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:cfo",
      serviceContext: { ...fixtureForensicsServiceContext, governedConfig, source }
    });

    expect(() => facade.callTool("actions.draftRebill", { decisionId: "deduction-decision:S1-L2" })).toThrow(
      "Actor is not permitted to create draft-only action artifacts."
    );
    expect(
      facade.callTool("query.answer", {
        question: "Show cited status for selected evidence",
        recordIds: ["S3-L1", "POD-SIGNED-1", "INV-S3-1"],
        selectedLineId: "S3-L1"
      })
    ).toMatchObject({
      sourceReadStatus: "source_backed_selected_scope",
      sourceReads: {
        canonicalModel: "EvidenceDocument",
        selectedLineId: "S3-L1"
      }
    });
  });

  it("denies draft action calls when MCP capabilities are omitted", () => {
    const facade = createMcpToolFacade({
      actorId: "human:maya-lead",
      serviceContext: { governedConfig, source }
    });

    expect(() => facade.callTool("actions.draftRebill", { decisionId: "deduction-decision:S1-L2" })).toThrow(
      "Actor is not permitted to create draft-only action artifacts."
    );
  });

  it("fails closed instead of using prefix-derived evidence when MCP has no Supabase evidence context", () => {
    const line = source.loadSettlementRun().deductionLines.find((deductionLine) => deductionLine.lineId === "S1-L2");
    expect(line).toBeDefined();

    const facade = createMcpToolFacade({
      actorCapabilities: ["read"],
      actorId: "human:maya-lead"
    });

    expect(() => facade.callTool("retrieval.sap", line)).toThrow(
      "Supabase SAP evidence source required for retrieval.sap."
    );
    expect(() => facade.callTool("retrieval.docs", line)).toThrow(
      "Supabase synthetic evidence source required for retrieval.docs."
    );
    expect(() => facade.callTool("retrieval.tpm", line)).toThrow(
      "Supabase synthetic evidence source required for retrieval.tpm."
    );
    expect(() => facade.callTool("retrieval.bureau", line)).toThrow(
      "Supabase synthetic evidence source required for retrieval.bureau."
    );
  });
});

function sourceWithRiskObservationSnapshot(snapshot: SourceRiskObservationSnapshot | undefined): SourcePort {
  return {
    loadRiskObservationSnapshot(customerId) {
      return snapshot?.customerId === customerId ? snapshot : undefined;
    },
    loadSettlementRun() {
      return source.loadSettlementRun();
    }
  };
}

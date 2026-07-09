import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ForensicsCockpitModel } from "../../cockpit/app/cockpit-data.ts";
import { ContainmentBriefCard } from "../../cockpit/components/maya/containment-brief-card.tsx";

const panelFixture: ForensicsCockpitModel["containmentPanel"] = {
  actionPostureLabel: "No hold or freeze action staged",
  behavioralEvidenceIds: ["TPM-CONTRACT-1", "POD-SIGNED-1", "PRICE-CLAUSE-1"],
  basisRows: [
    {
      label: "Gaming gate",
      provenance: {
        deterministicBasis: "governed-config-snapshot",
        recordIds: ["S3-L1", "S6-L1"],
        sourceKind: "derived_backend",
        sourceName: "containment"
      },
      value: "governed-config-snapshot"
    },
    {
      label: "Configured window",
      provenance: {
        deterministicBasis: "rScoreComponents.windowDays",
        recordIds: ["S3-L1", "S6-L1"],
        sourceKind: "derived_backend",
        sourceName: "containment"
      },
      value: "30 days"
    }
  ],
  componentReadoutLabel: "Day-1 deterministic component readout; production R-score/R-drift remains out of scope.",
  customerId: "CUST-CRESTLINE",
  customerLabel: "Crestline Grocery",
  handoff: {
    label: "David / Risk Mesh reference",
    provenance: {
      deterministicBasis: "risk mesh review-only handoff",
      recordIds: ["S3-L1", "S6-L1"],
      sourceKind: "derived_backend",
      sourceName: "containment"
    },
    recordIds: ["S3-L1", "S6-L1"],
    status: "review-only handoff",
    target: "Risk Mesh"
  },
  intentLabel: "gaming",
  postureLabel: "HITL risk review only",
  provenance: {
    deterministicBasis: "assessCrestlineM6Containment read model",
    recordIds: ["S3-L1", "S6-L1"],
    sourceKind: "derived_backend",
    sourceName: "containment"
  },
  recordIds: ["S3-L1", "POD-SIGNED-1", "S6-L1", "PRICE-CLAUSE-1"],
  recordStripLabel: "Containment review record IDs",
  statusLabel: "Gaming-gate review candidate"
};

describe("ContainmentBriefCard", () => {
  it("renders the containment panel as a read-only Maya overview brief", () => {
    const markup = renderToStaticMarkup(createElement(ContainmentBriefCard, { panel: panelFixture }));

    expect(markup).toContain("Gaming-gate review candidate");
    expect(markup).toContain("Crestline Grocery");
    expect(markup).toContain("gaming");
    expect(markup).toContain("HITL risk review only");
    expect(markup).toContain("Risk Mesh");
    expect(markup).toContain("review-only handoff");
    expect(markup).toContain("Gaming gate");
    expect(markup).toContain("Configured window");
    expect(markup).toContain("governed-config-snapshot");
    expect(markup).toContain("30 days");
    expect(markup).toContain("No hold or freeze action staged");
    expect(markup).toContain("Containment review record IDs");
    expect(markup).toContain("TPM-CONTRACT-1");
    expect(markup).toContain("PRICE-CLAUSE-1");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<a ");
  });

  it("renders nothing when the panel is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(ContainmentBriefCard, { panel: undefined }));

    expect(markup).toBe("");
  });
});

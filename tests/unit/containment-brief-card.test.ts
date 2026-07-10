import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ForensicsCockpitModel } from "../../cockpit/app/cockpit-data.ts";
import { ContainmentBriefCard } from "../../cockpit/components/maya/containment-brief-card.tsx";

const panelFixture: ForensicsCockpitModel["containmentPanel"] = {
  actionPostureLabel: "No hold or freeze action staged",
  behavioralEvidenceIds: ["TPM-CONTRACT-1", "POD-SIGNED-1", "PRICE-CLAUSE-1"],
  actionBasisLabel:
    "Repeat invalid shortage and pricing pattern exceeded the governed gaming gate; route Soft -> Hard -> Hold review to Risk Mesh without external dispatch.",
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
  evidenceLinks: [
    {
      label: "Promotion correlation evidence",
      reason: "TPM evidence links the invalid pattern to a promotion correlation.",
      recordId: "TPM-CONTRACT-1",
      tone: "evidence"
    },
    {
      label: "Signed POD evidence",
      reason: "POD evidence anchors the shortage mismatch branch.",
      recordId: "POD-SIGNED-1",
      tone: "critical"
    },
    {
      label: "Contract pricing evidence",
      reason: "Contract evidence anchors the pricing-below-contract branch.",
      recordId: "PRICE-CLAUSE-1",
      tone: "warning"
    }
  ],
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
  methodologyReasons: [
    {
      label: "Invalid deduction mix",
      provenance: {
        deterministicBasis: "rScoreComponents.invalidLineCount",
        recordIds: ["S3-L1", "S6-L1"],
        sourceKind: "derived_backend",
        sourceName: "containment"
      },
      reason: "Shortage and pricing failures both appear in the same configured review window.",
      recordIds: ["S3-L1", "S6-L1", "POD-SIGNED-1", "PRICE-CLAUSE-1"],
      thresholdLabel: "Threshold >= 2",
      tone: "critical",
      value: "6 lines"
    },
    {
      label: "Value floor",
      provenance: {
        deterministicBasis: "rScoreComponents.invalidValueAmount",
        recordIds: ["S3-L1", "S6-L1", "POD-SIGNED-1", "PRICE-CLAUSE-1"],
        sourceKind: "derived_backend",
        sourceName: "containment"
      },
      reason: "The code-computed value of invalid pattern lines clears the governed floor.",
      recordIds: ["S3-L1", "S6-L1", "POD-SIGNED-1", "PRICE-CLAUSE-1"],
      thresholdLabel: "Floor $25,000.00",
      tone: "warning",
      value: "$63,900.00"
    },
    {
      label: "No wrongful containment guard",
      provenance: {
        deterministicBasis: "noWrongfulContainment",
        recordIds: ["S3-L1", "S6-L1"],
        sourceKind: "derived_backend",
        sourceName: "containment"
      },
      reason: "The candidate is review-only; no hold, freeze, or external action is staged.",
      recordIds: ["S3-L1", "S6-L1"],
      thresholdLabel: "HITL review only",
      tone: "safe",
      value: "Passed"
    }
  ],
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
  it("renders the containment panel as a self-explanatory read-only Maya containment brief", () => {
    const markup = renderToStaticMarkup(createElement(ContainmentBriefCard, { panel: panelFixture }));

    expect(markup).toContain("Gaming-gate review candidate");
    expect(markup).toContain("Read-only behavioral containment candidate");
    expect(markup).toContain("No hold, freeze, or external action is staged from this view.");
    expect(markup).toContain("Why Crestline Grocery was selected");
    expect(markup).toContain("Governed gaming methodology");
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
    expect(markup).toContain("Invalid deduction mix");
    expect(markup).toContain("Value floor");
    expect(markup).toContain("6 lines");
    expect(markup).toContain("Threshold &gt;= 2");
    expect(markup).toContain("No wrongful containment guard");
    expect(markup).toContain("data-tone=\"critical\"");
    expect(markup).toContain("data-tone=\"safe\"");
    expect(markup).toContain("Repeat invalid shortage and pricing pattern exceeded the governed gaming gate");
    expect(markup).toContain("Containment review record IDs");
    expect(markup).toContain("TPM-CONTRACT-1");
    expect(markup).toContain("PRICE-CLAUSE-1");
    expect(markup).toContain("href=\"#maya-containment-evidence-POD-SIGNED-1\"");
    expect(markup).toContain("aria-label=\"Open containment evidence POD-SIGNED-1\"");
    expect(markup).toContain("Signed POD evidence");
    expect(markup).not.toContain("<button");
  });

  it("renders nothing when the panel is unavailable", () => {
    const markup = renderToStaticMarkup(createElement(ContainmentBriefCard, { panel: undefined }));

    expect(markup).toBe("");
  });

  it("renders a read-only compatibility state for older cached containment payloads", () => {
    const legacyPanel = {
      ...panelFixture,
      actionBasisLabel: undefined,
      evidenceLinks: undefined,
      methodologyReasons: undefined
    } as unknown as ForensicsCockpitModel["containmentPanel"];

    const markup = renderToStaticMarkup(createElement(ContainmentBriefCard, { panel: legacyPanel }));

    expect(markup).toContain("Gaming-gate review candidate");
    expect(markup).toContain("Legacy read-model compatibility");
    expect(markup).toContain("Governed containment basis is preserved");
    expect(markup).toContain("0 cited records");
    expect(markup).not.toContain("<button");
  });

  it("normalizes older value-at-risk methodology labels into the shorter value floor label", () => {
    const legacyLabelPanel = {
      ...panelFixture,
      methodologyReasons: panelFixture.methodologyReasons.map((reason) =>
        reason.label === "Value floor" ? { ...reason, label: "Value at risk floor" } : reason
      )
    };

    const markup = renderToStaticMarkup(createElement(ContainmentBriefCard, { panel: legacyLabelPanel }));

    expect(markup).toContain("Value floor");
    expect(markup).not.toContain("Value at risk floor");
  });
});

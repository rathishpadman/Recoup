import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DavidDecisionFlow } from "../../cockpit/components/david/david-decision-flow.tsx";
import type { CreditRiskAccountModel } from "../../cockpit/app/cockpit-data.ts";

describe("David decision flow", () => {
  it("renders every workflow step without the old mobile-clipping min-width rail", () => {
    const account = {
      assessmentSteps: new Array(8).fill(undefined).map((_, index) => ({ key: `step-${index.toString()}` })),
      customer: "Crestline Grocery",
      packet: {
        approvalStatus: "awaiting"
      },
      routeLabel: "Contain",
      verdict: "HIGH",
      verdictTone: "high"
    } as CreditRiskAccountModel;

    const html = renderToStaticMarkup(React.createElement(DavidDecisionFlow, { account }));

    expect(html).toContain('data-layout="responsive-workflow"');
    expect(html).not.toContain("min-w-[760px]");
    expect(html.match(/data-testid="david-decision-flow-step"/gu)).toHaveLength(5);
    expect(html).toContain("Account");
    expect(html).toContain("Risk Mesh assesses");
    expect(html).toContain("Risk verdict");
    expect(html).toContain("Action packet");
    expect(html).toContain("Your approval");
  });
});

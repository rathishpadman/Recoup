import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("David D5 command centre route", () => {
  it("ships as a backend-wired App Router surface with scoped styling", () => {
    expect(existsSync("cockpit/app/credit/command/page.tsx")).toBe(true);
    expect(existsSync("cockpit/app/credit/command/command.module.css")).toBe(true);

    const page = readFileSync("cockpit/app/credit/command/page.tsx", "utf8");
    const styles = readFileSync("cockpit/app/credit/command/command.module.css", "utf8");

    expect(page).toContain("fetchCreditModel");
    expect(page).toContain('requireRouteAccess("/credit/command")');
    expect(page).toContain('from "../../cockpit-data.ts"');
    expect(page).toContain('from "./command.module.css"');
    expect(page).toContain("David D5 Command Centre");
    expect(page).toContain("Portfolio Monitoring Cockpit");
    expect(page).toContain("Tool status");
    expect(page).toContain("Exposure board");
    expect(page).toContain("Live bureau");
    expect(page).toContain("Behavioral signal rails");
    expect(page).toContain("Risk Mesh queue");
    expect(page).toContain("Audit status");
    expect(page).not.toContain("decimal.js");
    expect(page).not.toContain("src/core");
    expect(page).not.toContain("../../src/services");
    expect(styles).toContain(".commandShell");
    expect(styles).toContain("grid-template-columns");
    expect(styles).not.toContain("linear-gradient(");
    expect(styles).not.toContain("radial-gradient(");
    expect(styles).not.toContain("backdrop-filter");
  });
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeFiles = [
  "cockpit/app/login/page.tsx",
  "cockpit/app/forensics/page.tsx",
  "cockpit/app/run/page.tsx",
  "cockpit/app/credit/page.tsx",
  "cockpit/app/cfo/page.tsx",
  "cockpit/app/governance/page.tsx",
  "cockpit/app/governance/agents/page.tsx",
  "cockpit/app/governance/connectors/page.tsx",
  "cockpit/app/governance/memory/page.tsx",
  "cockpit/app/governance/trace/page.tsx"
];

describe("cockpit route architecture", () => {
  it("splits major cockpit surfaces into real App Router pages", () => {
    for (const routeFile of routeFiles) {
      expect(existsSync(routeFile), `${routeFile} should exist`).toBe(true);
    }
  });

  it("does not keep top-level product surfaces as hash anchors on one page", () => {
    const root = readFileSync("cockpit/app/page.tsx", "utf8");
    const shell = readFileSync("cockpit/app/cockpit-shell.tsx", "utf8");

    expect(root).toContain("requireDemoSession");
    expect(root).toContain("defaultRoute");
    expect(shell).toContain('href: "/forensics"');
    expect(shell).toContain('href: "/run"');
    expect(shell).toContain('href: "/credit"');
    expect(shell).toContain('href: "/cfo"');
    expect(shell).toContain('href: "/governance/agents"');
    expect(shell).toContain('href: "/governance/connectors"');
    expect(shell).toContain("href={item.href}");
    expect(shell).not.toContain('href="#credit"');
    expect(shell).not.toContain('href="#cfo"');
    expect(shell).not.toContain('href="#connectors"');
  });
});

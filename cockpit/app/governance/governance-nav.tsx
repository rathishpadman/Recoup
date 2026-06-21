"use client";

import { usePathname } from "next/navigation.js";

const governanceTabs = [
  { href: "/governance/agents", label: "Agent operations" },
  { href: "/governance/connectors", label: "Connector readiness" },
  { href: "/governance/memory", label: "Memory" },
  { href: "/governance/trace", label: "Trace" }
];

export function GovernanceNav() {
  const pathname = usePathname();

  return (
    <div className="governance-tabs" role="tablist" aria-label="Governance views">
      {governanceTabs.map((tab) => (
        <a aria-selected={pathname === tab.href} href={tab.href} key={tab.href} role="tab">
          {tab.label}
        </a>
      ))}
    </div>
  );
}

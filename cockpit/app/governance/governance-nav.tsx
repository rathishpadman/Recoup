"use client";

import { CircuitryIcon as Circuitry } from "@phosphor-icons/react/dist/csr/Circuitry";
import { DatabaseIcon as Database } from "@phosphor-icons/react/dist/csr/Database";
import { GitBranchIcon as GitBranch } from "@phosphor-icons/react/dist/csr/GitBranch";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/dist/csr/UsersThree";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation.js";

const governanceTabs = [
  { href: "/governance/agents", icon: <UsersThree size={15} />, label: "Agents", status: "bounded" },
  { href: "/governance/connectors", icon: <Circuitry size={15} />, label: "Connectors", status: "read-only" },
  { href: "/governance/memory", icon: <Database size={15} />, label: "Memory", status: "scoped" },
  { href: "/governance/trace", icon: <GitBranch size={15} />, label: "Trace", status: "cited" }
] satisfies Array<{ href: string; icon: ReactNode; label: string; status: string }>;

export function GovernanceNav() {
  const pathname = usePathname();

  return (
    <div className="governance-tabs" role="tablist" aria-label="Governance views">
      {governanceTabs.map((tab) => {
        const selected = pathname === tab.href;

        return (
          <a
            aria-current={selected ? "page" : undefined}
            aria-selected={selected}
            href={tab.href}
            key={tab.href}
            role="tab"
          >
            {tab.icon}
            <span>{tab.label}</span>
            <small>{tab.status}</small>
          </a>
        );
      })}
    </div>
  );
}

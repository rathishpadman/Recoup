"use client";

import * as React from "react";
import type { CreditRiskReviewModel, CreditRiskVerdict } from "../../app/cockpit-data.ts";
import { DavidAccountDossier } from "./david-account-dossier.tsx";
import { DavidAccountQueue } from "./david-account-queue.tsx";
import { DavidWalkthroughStrip } from "./david-walkthrough-strip.tsx";
import { DavidWorkspaceShell, type DavidSurfaceSection } from "./david-workspace-shell.tsx";

interface DavidRiskReviewSurfaceProps {
  displayName: string;
  model: CreditRiskReviewModel;
}

export function DavidRiskReviewSurface({ displayName, model }: Readonly<DavidRiskReviewSurfaceProps>) {
  const [activeSection, setActiveSection] = React.useState<DavidSurfaceSection>("risk-review");
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"ALL" | CreditRiskVerdict>("ALL");
  const [search, setSearch] = React.useState("");

  const filteredAccounts = React.useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return model.accounts.filter((account) => {
      if (filter !== "ALL" && account.verdict !== filter) {
        return false;
      }

      if (normalizedSearch.length === 0) {
        return true;
      }

      const searchHaystack = [account.accountId, account.customer, account.channel, account.segment, account.verdict, account.routeLabel]
        .join(" ")
        .toLowerCase();

      return searchHaystack.includes(normalizedSearch);
    });
  }, [filter, model.accounts, search]);

  React.useEffect(() => {
    if (selectedAccountId === null) {
      return;
    }

    if (!filteredAccounts.some((account) => account.accountId === selectedAccountId)) {
      setSelectedAccountId(null);
    }
  }, [filteredAccounts, selectedAccountId]);

  const selectedAccount = selectedAccountId === null ? undefined : model.accounts.find((account) => account.accountId === selectedAccountId);
  const greetingName = displayName.split(/\s+/u)[0] ?? displayName;
  const runSummary = `Weekly credit risk review . ${model.navCounts.riskReview.toString()} accounts flagged . ${model.portfolio.totalExposureLabel} exposure`;

  return (
    <DavidWorkspaceShell
      activeSection={activeSection}
      displayName={displayName}
      navCounts={model.navCounts}
      onSearchChange={setSearch}
      onSectionChange={setActiveSection}
      provenanceLabel={model.sourceLabel}
      runSummary={runSummary}
      searchValue={search}
      walkthroughStrip={
        <DavidWalkthroughStrip
          displayName={displayName}
          hasCommittedApproval={selectedAccount?.packet.approvalStatus === "committed"}
          hasSelectedAccount={selectedAccountId !== null}
        />
      }
    >
      <main className="grid gap-4" data-testid="david-risk-review-surface">
        <DavidAccountQueue
          accounts={filteredAccounts}
          filter={filter}
          greetingName={greetingName}
          onFilterChange={setFilter}
          onSelectAccount={setSelectedAccountId}
          queueStats={model.queueStats}
          selectedAccountId={selectedAccountId}
          sourceLabel={model.sourceLabel}
        />
        {selectedAccount === undefined ? null : (
          <DavidAccountDossier
            account={selectedAccount}
            accounts={model.accounts}
            onClearSelection={() => {
              setSelectedAccountId(null);
            }}
            onSelectAccount={setSelectedAccountId}
          />
        )}
      </main>
    </DavidWorkspaceShell>
  );
}

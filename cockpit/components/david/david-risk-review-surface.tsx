"use client";

import * as React from "react";
import type { CreditRiskReviewModel, CreditRiskVerdict } from "../../app/cockpit-data.ts";
import { DavidAccountDossier } from "./david-account-dossier.tsx";
import { DavidAccountQueue } from "./david-account-queue.tsx";
import { DavidActionPacketsOutbox } from "./david-action-packets-outbox.tsx";
import { DavidBehaviouralWatchlist } from "./david-behavioural-watchlist.tsx";
import { DavidCopilotDock } from "./david-copilot-dock.tsx";
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
  const [activeCopilotSuggestionId, setActiveCopilotSuggestionId] = React.useState<
    CreditRiskReviewModel["copilot"]["suggestions"][number]["suggestionId"] | null
  >(null);
  const [playedTimelineAccountIds, setPlayedTimelineAccountIds] = React.useState<string[]>([]);
  const [timelineVisibleCounts, setTimelineVisibleCounts] = React.useState<Record<string, number>>({});

  const handleTimelinePlaybackComplete = React.useCallback((accountId: string) => {
    setPlayedTimelineAccountIds((current) => (current.includes(accountId) ? current : [...current, accountId]));
  }, []);

  const handleTimelineVisibleCountChange = React.useCallback((accountId: string, visibleCount: number) => {
    setTimelineVisibleCounts((current) => {
      if (current[accountId] === visibleCount) {
        return current;
      }

      return { ...current, [accountId]: visibleCount };
    });
  }, []);

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

  React.useEffect(() => {
    if (activeCopilotSuggestionId === null) {
      return;
    }

    const activeSuggestion = model.copilot.suggestions.find((suggestion) => suggestion.suggestionId === activeCopilotSuggestionId);
    if (activeSuggestion?.targetAccountId === undefined) {
      return;
    }

    if (selectedAccountId !== null && selectedAccountId !== activeSuggestion.targetAccountId) {
      setActiveCopilotSuggestionId(null);
    }
  }, [activeCopilotSuggestionId, model.copilot.suggestions, selectedAccountId]);

  const selectedAccount = selectedAccountId === null ? undefined : model.accounts.find((account) => account.accountId === selectedAccountId);
  const shouldStreamTimeline = selectedAccount === undefined ? false : !playedTimelineAccountIds.includes(selectedAccount.accountId);
  const timelineVisibleCount = selectedAccount === undefined ? 0 : (timelineVisibleCounts[selectedAccount.accountId] ?? 0);
  const greetingName = displayName.split(/\s+/u)[0] ?? displayName;
  const runSummary = `Weekly credit risk review . ${model.navCounts.riskReview.toString()} accounts flagged . ${model.portfolio.totalExposureLabel} exposure`;
  const accountQueue = (
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
  );
  const accountDossier =
    selectedAccount === undefined ? null : (
      <DavidAccountDossier
        account={selectedAccount}
        accounts={model.accounts}
        onClearSelection={() => {
          setSelectedAccountId(null);
        }}
        onSelectAccount={setSelectedAccountId}
        onTimelinePlaybackComplete={handleTimelinePlaybackComplete}
        onTimelineVisibleCountChange={handleTimelineVisibleCountChange}
        shouldStreamTimeline={shouldStreamTimeline}
      />
    );

  return (
    <DavidWorkspaceShell
      activeSection={activeSection}
      displayName={displayName}
      navCounts={model.navCounts}
      onSearchChange={setSearch}
      onSectionChange={setActiveSection}
      readySections={["risk-review", "action-packets", "watchlist"]}
      runSummary={runSummary}
      searchValue={search}
      sources={model.sources}
      walkthroughStrip={
        <DavidWalkthroughStrip
          displayName={displayName}
          hasCommittedApproval={selectedAccount?.packet.approvalStatus === "committed"}
          hasSelectedAccount={selectedAccountId !== null}
        />
      }
    >
      {activeSection === "risk-review" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" data-testid="david-risk-review-surface">
          <main className="grid gap-4">
            {selectedAccount === undefined ? accountQueue : accountDossier}
            {selectedAccount === undefined ? null : accountQueue}
          </main>
          <DavidCopilotDock
            activeSuggestionId={activeCopilotSuggestionId}
            copilot={model.copilot}
            onActivateSuggestion={(suggestionId) => {
              setActiveCopilotSuggestionId(suggestionId);
              const suggestion = model.copilot.suggestions.find((entry) => entry.suggestionId === suggestionId);
              if (suggestion?.targetAccountId !== undefined) {
                setSelectedAccountId(suggestion.targetAccountId);
                return;
              }

              setSelectedAccountId((current) => current ?? model.accounts[0]?.accountId ?? null);
            }}
            selectedAccount={selectedAccount}
            timelineVisibleCount={timelineVisibleCount}
          />
        </div>
      ) : activeSection === "action-packets" ? (
        <DavidActionPacketsOutbox
          accounts={model.accounts}
          onOpenAccount={(accountId) => {
            setSelectedAccountId(accountId);
            setActiveSection("risk-review");
          }}
        />
      ) : (
        <DavidBehaviouralWatchlist
          accounts={model.accounts}
          onOpenAccount={(accountId) => {
            setSelectedAccountId(accountId);
            setActiveSection("risk-review");
          }}
        />
      )}
    </DavidWorkspaceShell>
  );
}

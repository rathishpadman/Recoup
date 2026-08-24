"use client";

import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * A panel that can be put away.
 *
 * The right-hand column stacks four of these and each one grows with its
 * content, so a run with a long event history pushed the ledger below the fold
 * with no way to bring it back. Closing the panels above it is that way.
 *
 * The Card lives here rather than in each panel, which keeps every panel
 * component at zero cards and the "no nested cards" design rule intact.
 *
 * Open state is per panel and deliberately not persisted: it is a reading
 * preference for the current glance, not a setting, and restoring a closed
 * panel on load would hide data the reader did not ask to hide.
 */

interface CollapsiblePanelProps {
  /** Also the prefix for the toggle's testid. */
  testId: string;
  title: string;
  /** Panels open by default; data is not hidden unless a person hides it. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsiblePanel({ testId, title, defaultOpen = true, children }: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card data-testid={testId}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger
            className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
            data-testid={`${testId}-toggle`}
          >
            <CardTitle>{title}</CardTitle>
            <ChevronDownIcon
              className={open ? "size-4 shrink-0" : "size-4 shrink-0 -rotate-90"}
              aria-hidden
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

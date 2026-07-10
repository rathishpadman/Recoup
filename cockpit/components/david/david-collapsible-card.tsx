"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DavidCollapsibleCardProps {
  badges?: React.ReactNode;
  children: React.ReactNode;
  className?: string | undefined;
  dataWorkflowState?: string | undefined;
  defaultOpen?: boolean;
  description?: React.ReactNode;
  testId: string;
  title: string;
}

export function DavidCollapsibleCard({
  badges,
  children,
  className,
  dataWorkflowState,
  defaultOpen = false,
  description,
  testId,
  title
}: Readonly<DavidCollapsibleCardProps>) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <Card
        className={cn("rounded-lg shadow-[var(--shadow-xs)]", className)}
        data-open={open}
        data-testid={testId}
        data-workflow-state={dataWorkflowState}
      >
        <CardHeader className="gap-0 p-0">
          <CollapsibleTrigger asChild>
            <button
              aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
              className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left"
              data-testid={`${testId}-trigger`}
              type="button"
            >
              <span className="grid min-w-0 gap-1">
                <CardTitle className="text-base">{title}</CardTitle>
                {description === undefined ? null : <span className="text-sm text-muted-foreground">{description}</span>}
              </span>
              <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {badges}
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn("size-4 text-muted-foreground transition-transform", open ? "rotate-180" : "rotate-0")}
                />
              </span>
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent data-testid={`${testId}-content`}>
          <CardContent className="grid gap-4 px-4 pb-4 pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

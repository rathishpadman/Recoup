import { LightbulbIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MayaWorklistItem } from "./types.ts";

interface RecommendedActionCellProps {
  item: MayaWorklistItem;
}

export function RecommendedActionCell({ item }: RecommendedActionCellProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex max-w-full min-w-0">
          <Badge
            className="h-6 max-w-full justify-start gap-1.5 truncate px-2 text-[11px] leading-none"
            data-testid="maya-recommended-action-badge"
            variant="secondary"
          >
            <LightbulbIcon aria-hidden="true" data-icon="inline-start" />
            <span className="min-w-0 truncate">{item.recommendedActionLabel}</span>
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="flex max-w-72 flex-col gap-1">
        <span>Forensics recommendation</span>
        <span>{item.evidenceLabel}</span>
        <span>{item.confidenceLabel}</span>
      </TooltipContent>
    </Tooltip>
  );
}

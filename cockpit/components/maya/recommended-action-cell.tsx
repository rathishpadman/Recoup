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
          <Badge className="h-8 max-w-full justify-start truncate px-1.5 text-[11px]" variant="secondary">
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

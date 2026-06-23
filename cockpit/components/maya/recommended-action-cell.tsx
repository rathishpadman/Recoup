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
        <span className="inline-flex max-w-full">
          <Badge className="max-w-full justify-start" variant="secondary">
            <LightbulbIcon data-icon="inline-start" />
            <span className="truncate">{item.recommendedActionLabel}</span>
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span>{item.evidenceLabel}</span>
        <span>{item.confidenceLabel}</span>
      </TooltipContent>
    </Tooltip>
  );
}

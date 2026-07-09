import type { CreditRiskVerdictTone } from "../../app/cockpit-data.ts";

export const davidBadgeVariantByTone: Record<CreditRiskVerdictTone, "destructive" | "info" | "review" | "valid"> = {
  clear: "valid",
  elevated: "review",
  high: "destructive",
  watch: "info"
};

export const davidBorderClassByTone: Record<CreditRiskVerdictTone, string> = {
  clear: "border-emerald-500/20",
  elevated: "border-amber-500/25",
  high: "border-destructive/25",
  watch: "border-sky-500/25"
};

export const davidMeterClassByTone: Record<CreditRiskVerdictTone, string> = {
  clear: "bg-emerald-500",
  elevated: "bg-amber-500",
  high: "bg-destructive",
  watch: "bg-sky-500"
};

export const davidMutedSurfaceClassByTone: Record<CreditRiskVerdictTone, string> = {
  clear: "bg-emerald-500/6",
  elevated: "bg-amber-500/8",
  high: "bg-destructive/6",
  watch: "bg-sky-500/8"
};

export const davidTextClassByTone: Record<CreditRiskVerdictTone, string> = {
  clear: "text-emerald-700 dark:text-emerald-300",
  elevated: "text-amber-700 dark:text-amber-300",
  high: "text-destructive",
  watch: "text-sky-700 dark:text-sky-300"
};

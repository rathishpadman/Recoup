export type VerdictBadgeVariant = "dispute" | "info" | "invalid" | "neutralStatus" | "review" | "valid";

const reviewStatuses = new Set(["awaiting", "partial", "pending", "review"]);
const disputeStatuses = new Set(["dispute", "recovery"]);
const infoStatuses = new Set(["billing", "info"]);

export function verdictBadgeVariant(value: string | undefined): VerdictBadgeVariant {
  const normalizedValue = value?.trim().toLowerCase() ?? "";

  if (normalizedValue === "valid") {
    return "valid";
  }
  if (normalizedValue === "invalid") {
    return "invalid";
  }
  if (reviewStatuses.has(normalizedValue)) {
    return "review";
  }
  if (disputeStatuses.has(normalizedValue)) {
    return "dispute";
  }
  if (infoStatuses.has(normalizedValue)) {
    return "info";
  }

  return "neutralStatus";
}

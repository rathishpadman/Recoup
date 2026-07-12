const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type PersonaFinopsPeriodDays = 7 | 30;

export function defaultPersonaFinopsPeriod(now = new Date(), days: PersonaFinopsPeriodDays = 30): { fromIso: string; toIso: string } {
  return {
    fromIso: new Date(now.getTime() - days * DAY_IN_MS).toISOString(),
    toIso: now.toISOString()
  };
}

export function parsePersonaFinopsPeriodDays(value: string | string[] | undefined): PersonaFinopsPeriodDays {
  return value === "7" ? 7 : 30;
}

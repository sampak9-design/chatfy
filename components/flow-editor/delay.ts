// Helpers to edit/display a delay step's duration in a human-friendly unit,
// while keeping `delaySeconds` (a plain number of seconds) as the source of truth.

export type DelayUnit = "seconds" | "minutes" | "hours" | "days";

const UNIT_SECONDS: Record<DelayUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
};

export const DELAY_UNIT_LABEL: Record<DelayUnit, string> = {
  seconds: "segundos",
  minutes: "minutos",
  hours: "horas",
  days: "dias",
};

/** Best-fit split of a seconds value into { value, unit } for editing. */
export function secondsToParts(totalSeconds: number): { value: number; unit: DelayUnit } {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  if (s === 0) return { value: 0, unit: "seconds" };
  for (const unit of ["days", "hours", "minutes"] as DelayUnit[]) {
    if (s % UNIT_SECONDS[unit] === 0) return { value: s / UNIT_SECONDS[unit], unit };
  }
  return { value: s, unit: "seconds" };
}

export function partsToSeconds(value: number, unit: DelayUnit): number {
  return Math.max(0, Math.floor(value || 0)) * UNIT_SECONDS[unit];
}

/** Compact label for the node preview, e.g. "24h", "2d", "30s". */
export function formatDelay(totalSeconds: number): string {
  const { value, unit } = secondsToParts(totalSeconds);
  const suffix = unit === "days" ? "d" : unit === "hours" ? "h" : unit === "minutes" ? "min" : "s";
  return `${value}${suffix}`;
}

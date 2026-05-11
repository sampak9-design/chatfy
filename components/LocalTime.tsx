"use client";

import { useEffect, useState } from "react";

interface Props {
  /** ISO 8601 string of the date (server-rendered with toISOString()) */
  iso: string;
  /** Format style. Default: short date + short time */
  variant?: "short" | "long" | "dateOnly" | "timeOnly";
}

/**
 * Renders a date/time in the user's browser locale + timezone.
 * Server-rendered as the raw ISO string (avoids hydration mismatch with `suppressHydrationWarning`),
 * then replaced on mount with the localized representation.
 */
export function LocalTime({ iso, variant = "short" }: Props) {
  const [formatted, setFormatted] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions =
      variant === "long"
        ? { dateStyle: "long", timeStyle: "short" }
        : variant === "dateOnly"
          ? { day: "2-digit", month: "2-digit", year: "2-digit" }
          : variant === "timeOnly"
            ? { hour: "2-digit", minute: "2-digit" }
            : { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" };
    setFormatted(new Intl.DateTimeFormat(undefined, opts).format(d));
  }, [iso, variant]);

  // Until JS runs we show a stable placeholder (the ISO date) and tell React
  // not to complain about the eventual replacement.
  return <span suppressHydrationWarning>{formatted ?? iso.slice(0, 16).replace("T", " ")}</span>;
}

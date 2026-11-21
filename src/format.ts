// Display formatting for durations (integer milliseconds in contract v1).

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `m:ss` under an hour, `h:mm:ss` from an hour up. Floors to whole seconds. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

const DATE_PARTS: Intl.DateTimeFormatOptions = {
  weekday: "short",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

function formatInstant(d: Date, opts: Intl.DateTimeFormatOptions): string {
  // ICU puts a narrow no-break space before AM/PM; use a plain one.
  return new Intl.DateTimeFormat("en-US", { ...DATE_PARTS, ...opts }).format(d).replace(/ /g, " ");
}

/** True if `tz` is an IANA time zone this runtime knows, e.g. "America/New_York". */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The date shown for a game, e.g. "Sat, Nov 21, 2026, 2:05 PM EST".
 *
 * The device's own `ended_at` wins when it sends one: local wall-clock time with no offset,
 * shown as written. Otherwise (the board always sends null today) the game is dated by when
 * the server first received it, `saved_at`, shown in `timeZone` with its abbreviation.
 */
export function formatGameDate(endedAt: string | null, savedAt: string, timeZone: string): string {
  if (endedAt !== null) {
    // Read the offset-less local time as UTC and print it in UTC, so it comes out unchanged.
    const d = new Date(`${endedAt}Z`);
    return Number.isNaN(d.getTime()) ? endedAt : formatInstant(d, { timeZone: "UTC" });
  }
  return formatInstant(new Date(savedAt), { timeZone, timeZoneName: "short" });
}

/** Average time per player in a game: global time divided by player count, in ms. */
export function averagePerPlayerMs(globalMs: number, playerCount: number): number {
  return playerCount > 0 ? Math.round(globalMs / playerCount) : 0;
}

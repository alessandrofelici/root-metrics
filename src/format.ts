// Display formatting: durations (integer milliseconds in contract v1) and dates.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
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

/** Totals in words, zero parts left out: "1 hr 20 min", "45 min", "2 hr", or "45 sec" under a
 *  minute. Floors to the unit shown. */
export function formatTotal(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} sec`;
  const min = Math.floor(s / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** A turn as a clock with no leading zero: "1:30", "12:04". Floors to whole seconds. */
export function formatTurn(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** An average turn: rounded to the nearest second, then shown like a turn. */
export function formatAvgTurn(ms: number): string {
  return formatTurn(Math.round(ms / 1000) * 1000);
}

/** A share as a whole percentage: 0.3127 → "31%". */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Wall-clock parts of when a game happened, in the display time zone. */
export interface LocalTime {
  /** "2026-11-21" */
  day: string;
  /** "2026-11" */
  month: string;
  hour: number;
  minute: number;
}

/**
 * When a game happened. The device's `ended_at` wins when sent (local time, no offset, used as
 * written). Otherwise the server's receive time `saved_at`, converted to `timeZone`.
 */
export function localTime(endedAt: string | null, savedAt: string, timeZone: string): LocalTime {
  let d = endedAt !== null ? new Date(`${endedAt}Z`) : new Date(Number.NaN);
  let tz = "UTC";
  if (Number.isNaN(d.getTime())) {
    d = new Date(savedAt);
    tz = timeZone;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const month = `${get("year")}-${get("month")}`;
  return { day: `${month}-${get("day")}`, month, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function ymd(day: string): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y!, m!, d!];
}

/** "2026-11-21" → "Sat 21 Nov 2026" */
export function dayLabel(day: string): string {
  const [y, m, d] = ymd(day);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-11-21" → "Sat 21 Nov" */
export function shortDayLabel(day: string): string {
  return dayLabel(day).replace(/ \d{4}$/, "");
}

/** 20, 14 → "8:14 PM" */
export function timeLabel(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad2(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

/** "2026-11" → "November 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m! - 1]} ${y}`;
}

/** "2026-11" → "Nov 2026" */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}

/** "2026-11", +1 → "2026-12" */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

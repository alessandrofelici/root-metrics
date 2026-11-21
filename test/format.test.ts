import { describe, expect, it } from "vitest";
import { averagePerPlayerMs, formatDuration, formatGameDate, isValidTimeZone } from "../src/format.js";

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [999, "0:00"],
    [1000, "0:01"],
    [62000, "1:02"],
    [62999, "1:02"],
    [120000, "2:00"],
    [3599999, "59:59"],
    [3600000, "1:00:00"],
    [3723000, "1:02:03"],
    [36000000, "10:00:00"],
  ])("%i ms → %s", (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });
});

describe("averagePerPlayerMs", () => {
  it("divides global time by player count", () => {
    expect(averagePerPlayerMs(666000, 3)).toBe(222000);
    expect(averagePerPlayerMs(460000, 4)).toBe(115000);
    expect(averagePerPlayerMs(1000, 3)).toBe(333);
  });
  it("returns 0 for zero players instead of NaN", () => {
    expect(averagePerPlayerMs(1000, 0)).toBe(0);
  });
});

describe("formatGameDate", () => {
  const SAVED = "2026-11-21T19:05:42.123Z";

  it("dates a game with no ended_at by when the server received it, in the given zone", () => {
    expect(formatGameDate(null, SAVED, "UTC")).toBe("Sat, Nov 21, 2026, 7:05 PM UTC");
    expect(formatGameDate(null, SAVED, "America/New_York")).toBe("Sat, Nov 21, 2026, 2:05 PM EST");
  });

  it("follows daylight saving time", () => {
    expect(formatGameDate(null, "2026-07-04T16:30:00.000Z", "America/New_York")).toBe(
      "Sat, Jul 4, 2026, 12:30 PM EDT",
    );
  });

  it("rolls over to the local day", () => {
    // 03:10 UTC on the 22nd is still the 21st in New York
    expect(formatGameDate(null, "2026-11-22T03:10:00.000Z", "America/New_York")).toBe(
      "Sat, Nov 21, 2026, 10:10 PM EST",
    );
  });

  it("prefers the device's ended_at, shown as written with no zone shift", () => {
    expect(formatGameDate("2026-11-21T20:14:05", SAVED, "America/New_York")).toBe("Sat, Nov 21, 2026, 8:14 PM");
  });

  it("shows an unparseable ended_at as-is", () => {
    expect(formatGameDate("sometime", SAVED, "UTC")).toBe("sometime");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

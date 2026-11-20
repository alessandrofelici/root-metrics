import { describe, expect, it } from "vitest";
import { averagePerPlayerMs, formatDuration } from "../src/format.js";

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

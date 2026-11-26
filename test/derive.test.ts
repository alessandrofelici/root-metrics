import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot, endedOnSeat, gameFacts, playerKey } from "../src/derive.js";
import { addMonths, dayLabel, formatAvgTurn, formatTotal, formatTurn, localTime, monthLabel, timeLabel } from "../src/format.js";
import { parseGameResult } from "../src/parse.js";
import { lengthBuckets, playerStats, records, rivals, streak, trend } from "../src/stats.js";
import type { GameResult, StoredResult } from "../src/types.js";

const load = (file: string): GameResult => {
  const out = parseGameResult(fs.readFileSync(path.resolve(import.meta.dirname, file), "utf8"));
  if (!out.ok) throw new Error(out.error);
  return out.result;
};
const A = load("../fixtures/fixture-a.json");
const B = load("../fixtures/fixture-b.json");
const stored = (result: GameResult, saved_at: string, warnings: string[] = []): StoredResult => ({ result, saved_at, warnings });

describe("formatTotal / formatTurn", () => {
  it.each([
    [0, "0 sec"], [45_000, "45 sec"], [60_000, "1 min"], [2_700_000, "45 min"], [3_600_000, "1 hr"],
    [4_840_000, "1 hr 20 min"], [7_200_000, "2 hr"], [7_259_999, "2 hr"],
  ])("total %i → %s", (ms, s) => expect(formatTotal(ms)).toBe(s));
  it.each([[0, "0:00"], [42_000, "0:42"], [90_000, "1:30"], [151_999, "2:31"], [4_500_000, "75:00"]])("turn %i → %s", (ms, s) => expect(formatTurn(ms)).toBe(s));
  it("averages round to the nearest second", () => {
    expect(formatAvgTurn(146_600)).toBe("2:27");
    expect(formatAvgTurn(146_400)).toBe("2:26");
  });
});

describe("dates", () => {
  it("ended_at wins and is used as written", () => {
    expect(localTime("2026-11-21T20:14:05", "2026-11-22T03:00:00Z", "America/New_York")).toEqual({ day: "2026-11-21", month: "2026-11", hour: 20, minute: 14 });
  });
  it("saved_at is converted to the display time zone, including across midnight", () => {
    expect(localTime(null, "2026-11-22T04:30:00Z", "America/New_York")).toEqual({ day: "2026-11-21", month: "2026-11", hour: 23, minute: 30 });
    expect(localTime(null, "2026-11-22T04:30:00Z", "UTC").day).toBe("2026-11-22");
  });
  it("follows daylight saving time; an unparseable ended_at falls back to saved_at", () => {
    expect(localTime(null, "2026-07-04T16:30:00Z", "America/New_York")).toMatchObject({ hour: 12, minute: 30 });
    expect(localTime("sometime", "2026-11-21T19:05:00Z", "UTC")).toMatchObject({ day: "2026-11-21", hour: 19 });
  });
  it("labels", () => {
    expect(dayLabel("2026-11-21")).toBe("Sat 21 Nov 2026");
    expect(timeLabel(20, 14)).toBe("8:14 PM");
    expect(timeLabel(0, 5)).toBe("12:05 AM");
    expect(monthLabel("2026-11")).toBe("November 2026");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("winner: the player whose turn the game ended on", () => {
  it("fixture A (3, 3, 2 turns) → seat 2; fixture B (2, 2, 2, 1) → seat 3", () => {
    expect(endedOnSeat(A)).toBe(2);
    expect(endedOnSeat(B)).toBe(3);
  });
  it("equal counts → the last seat; one player → that seat", () => {
    const eq = structuredClone(A);
    eq.players[2]!.turns_ms.push(1000);
    expect(endedOnSeat(eq)).toBe(3);
    expect(endedOnSeat({ ...A, players: [A.players[0]!] })).toBe(1);
  });
  it("any truncated player → null", () => {
    const t = structuredClone(A);
    t.players[0]!.turns_truncated = true;
    expect(endedOnSeat(t)).toBeNull();
  });
});

describe("facts and snapshot", () => {
  it("counts over-limit turns and groups days", () => {
    const g = gameFacts(stored(A, "2026-11-21T19:05:00Z"), "UTC");
    expect(g.players.map((p) => p.overLimit)).toEqual([0, 1, 0]);
    expect(g.players.map((p) => p.won)).toEqual([false, true, false]);
    const snap = buildSnapshot([stored(B, "2026-11-21T19:06:00Z"), stored(A, "2026-11-21T19:05:00Z")], "UTC");
    expect(snap.byDay.get("2026-11-21")!.map((x) => x.id)).toEqual([B.game_id, A.game_id]);
    expect(snap.latest!.id).toBe(B.game_id);
  });
  it("nicknames group case-insensitively", () => {
    expect(playerKey("  Alex ")).toBe(playerKey("alex"));
  });
});

describe("stats", () => {
  const snap = buildSnapshot([stored(B, "2026-11-21T19:06:00Z"), stored(A, "2026-11-21T19:05:00Z")], "UTC");
  it("records find the longest turn, game and most turns", () => {
    const r = records(snap.games)!;
    expect(r.longestTurn).toMatchObject({ ms: 134_000, nickname: "Alex" });
    expect(r.longestGame.game.id).toBe(A.game_id);
    expect(r.mostTurns.count).toBe(8);
  });
  it("players: wins, streaks, head to head", () => {
    const ps = playerStats(snap.games);
    const alex = ps.find((p) => p.key === "alex")!;
    const ahmed = ps.find((p) => p.key === "ahmed")!;
    expect([alex.wins, alex.decided, ahmed.wins]).toEqual([1, 2, 1]);
    expect(streak(ahmed.results)).toEqual({ kind: "win", count: 1 }); // won B, the newest
    expect(rivals(ps, alex).find((r) => r.key === "ahmed")).toMatchObject({ together: 2, myWins: 1, theirWins: 1 });
  });
  it("length buckets cover first to last game", () => {
    const b = lengthBuckets(snap.games);
    expect(b.reduce((n, x) => n + x.count, 0)).toBe(2);
  });
  it("trend compares the first and last third", () => {
    expect(trend([60_000, 60_000, 60_000, 90_000, 90_000, 90_000])).toBe("longer");
    expect(trend([90_000, 60_000])).toBe("steady");
  });
});

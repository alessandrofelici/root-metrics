// Turns stored results into the facts the pages need: when each game happened (in the display
// time zone), who won, and per-player turn numbers. Pure functions, no I/O, no formatting.
import { localTime } from "./format.js";
import type { GameResult, StoredResult } from "./types.js";

/**
 * The winner: the player whose turn the game ended on.
 *
 * Players take turns in seat order from seat 1, so the last turn belongs to the highest seat among
 * the players with the most turns. Returns null when any player passed 128 turns: their counts
 * are capped, so the last turn can't be worked out.
 */
export function endedOnSeat(r: GameResult): number | null {
  if (r.players.length === 0) return null;
  if (r.players.some((p) => p.turns_truncated)) return null;
  const max = Math.max(...r.players.map((p) => p.turns_ms.length));
  const last = r.players.filter((p) => p.turns_ms.length === max).at(-1)!;
  return last.seat;
}

/** Groups a nickname across games: trimmed and case-folded. Nicknames are free strings. */
export function playerKey(nickname: string): string {
  return nickname.trim().toLowerCase();
}

export interface PlayerFacts {
  seat: number;
  nickname: string;
  key: string;
  faction: string;
  totalMs: number;
  /** Every turn as sent. */
  turnsMs: number[];
  /** Turns used for per-turn stats: a truncated player's last turn sums several turns, so it is left out. */
  countedTurnsMs: number[];
  truncated: boolean;
  /** Counted turns over the turn limit (0 when there is no limit). */
  overLimit: number;
  /** null when the winner can't be worked out. */
  won: boolean | null;
}

export interface GameFacts {
  id: string;
  stored: StoredResult;
  /** "2026-11-21", in the display time zone */
  day: string;
  /** "2026-11" */
  month: string;
  hour: number;
  minute: number;
  globalMs: number;
  limitMs: number | null;
  turnCount: number;
  winnerSeat: number | null;
  players: PlayerFacts[];
  warnings: string[];
}

export function gameFacts(s: StoredResult, timeZone: string): GameFacts {
  const r = s.result;
  const t = localTime(r.ended_at, s.saved_at, timeZone);
  const winnerSeat = endedOnSeat(r);
  const limit = r.turn_limit_ms;
  const players = r.players.map((p): PlayerFacts => {
    const counted = p.turns_truncated ? p.turns_ms.slice(0, -1) : p.turns_ms;
    return {
      seat: p.seat,
      nickname: p.nickname,
      key: playerKey(p.nickname),
      faction: p.faction,
      totalMs: p.total_ms,
      turnsMs: p.turns_ms,
      countedTurnsMs: counted,
      truncated: p.turns_truncated,
      overLimit: limit === null ? 0 : counted.filter((ms) => ms > limit).length,
      won: winnerSeat === null ? null : p.seat === winnerSeat,
    };
  });
  return {
    id: r.game_id,
    stored: s,
    day: t.day,
    month: t.month,
    hour: t.hour,
    minute: t.minute,
    globalMs: r.global_ms,
    limitMs: limit,
    turnCount: r.players.reduce((n, p) => n + p.turns_ms.length, 0),
    winnerSeat,
    players,
    warnings: s.warnings,
  };
}

export interface Snapshot {
  /** Newest first, as the store lists them. */
  games: GameFacts[];
  byId: Map<string, GameFacts>;
  /** Games per day, newest first within the day. */
  byDay: Map<string, GameFacts[]>;
  latest: GameFacts | undefined;
}

export function buildSnapshot(results: StoredResult[], timeZone: string): Snapshot {
  const games = results.map((s) => gameFacts(s, timeZone));
  const byId = new Map(games.map((g) => [g.id, g]));
  const byDay = new Map<string, GameFacts[]>();
  for (const g of games) {
    const list = byDay.get(g.day) ?? [];
    list.push(g);
    byDay.set(g.day, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => b.hour * 60 + b.minute - (a.hour * 60 + a.minute));
  return { games, byId, byDay, latest: games[0] };
}

/** True when the game's day had 2 or more games, so its time of day is shown. */
export function sharesDay(snap: Snapshot, g: GameFacts): boolean {
  return (snap.byDay.get(g.day)?.length ?? 0) > 1;
}

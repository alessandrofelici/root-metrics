// Cross-game statistics from a Snapshot. Pure functions over milliseconds and counts; the pages
// format them. Catalogue IDs (C1…C15, W1…W9) are noted per function; they are never shown.
//
// Rules: 1-player games are left out of cross-game stats; a truncated player's last turn is left
// out of per-turn stats; limit stats count only games with a limit; win stats count only games
// whose winner is known.
import type { GameFacts, PlayerFacts, Snapshot } from "./derive.js";

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Spread of turn lengths (C4): fastest, quartiles, median, slowest. */
export interface Spread { min: number; q1: number; median: number; q3: number; max: number }

export function turnSpread(turnsMs: number[]): Spread | undefined {
  if (turnsMs.length === 0) return undefined;
  const s = [...turnsMs].sort((a, b) => a - b);
  return { min: s[0]!, q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s.at(-1)! };
}

/** Games that count toward cross-game stats. */
export function statGames(snap: Snapshot): GameFacts[] {
  return snap.games.filter((g) => g.players.length >= 2);
}

// ---------- Records (C13) ----------
export interface Records {
  longestTurn: { ms: number; nickname: string; game: GameFacts };
  longestGame: { ms: number; game: GameFacts };
  mostTurns: { count: number; game: GameFacts };
}

export function records(games: GameFacts[]): Records | undefined {
  if (games.length === 0) return undefined;
  let lt: Records["longestTurn"] | undefined;
  let lg: Records["longestGame"] | undefined;
  let mt: Records["mostTurns"] | undefined;
  for (const g of games) {
    for (const p of g.players) for (const ms of p.countedTurnsMs) if (!lt || ms > lt.ms) lt = { ms, nickname: p.nickname, game: g };
    if (!lg || g.globalMs > lg.ms) lg = { ms: g.globalMs, game: g };
    if (!mt || g.turnCount > mt.count) mt = { count: g.turnCount, game: g };
  }
  return lt && lg && mt ? { longestTurn: lt, longestGame: lg, mostTurns: mt } : undefined;
}

export function totals(games: GameFacts[]): { games: number; tableMs: number; turns: number } {
  return { games: games.length, tableMs: games.reduce((n, g) => n + g.globalMs, 0), turns: games.reduce((n, g) => n + g.turnCount, 0) };
}

// ---------- Game length (C1) ----------
export interface Bucket { fromMs: number; toMs: number; count: number }

/** Game lengths in 15-minute buckets (30 when the spread is wide), first to last non-empty. */
export function lengthBuckets(games: GameFacts[]): Bucket[] {
  if (games.length === 0) return [];
  const lens = games.map((g) => g.globalMs);
  const spread = Math.max(...lens) - Math.min(...lens);
  const size = (spread > 8 * 15 * 60_000 ? 30 : 15) * 60_000;
  const first = Math.floor(Math.min(...lens) / size);
  const last = Math.floor(Math.max(...lens) / size);
  const out: Bucket[] = [];
  for (let i = first; i <= last; i++) out.push({ fromMs: i * size, toMs: (i + 1) * size, count: lens.filter((l) => Math.floor(l / size) === i).length });
  return out;
}

// ---------- Seats (C8, W5) ----------
export interface SeatStats { seat: number; games: number; avgTurnMs: number; wins: number; decided: number }

export function seatStats(games: GameFacts[]): SeatStats[] {
  const out: SeatStats[] = [];
  for (let seat = 1; seat <= 4; seat++) {
    const ps = games.flatMap((g) => g.players.filter((p) => p.seat === seat).map((p) => p));
    if (ps.length === 0) continue;
    out.push({ seat, games: ps.length, avgTurnMs: mean(ps.flatMap((p) => p.countedTurnsMs)), wins: ps.filter((p) => p.won === true).length, decided: ps.filter((p) => p.won !== null).length });
  }
  return out;
}

// ---------- Pace (C5) ----------
/** Average turn length by round (the n-th turn of each player), across the given players. */
export function paceByRound(players: PlayerFacts[]): number[] {
  const out: number[] = [];
  for (let r = 0; ; r++) {
    const xs = players.map((p) => p.countedTurnsMs[r]).filter((x): x is number => x !== undefined);
    if (xs.length === 0) break;
    out.push(mean(xs));
  }
  return out;
}

export type Trend = "longer" | "shorter" | "steady";
/** Compares the first and last third of a pace series. */
export function trend(series: number[]): Trend {
  if (series.length < 3) return "steady";
  const third = Math.max(1, Math.floor(series.length / 3));
  const a = mean(series.slice(0, third));
  const b = mean(series.slice(-third));
  if (b > a * 1.1) return "longer";
  if (b < a * 0.9) return "shorter";
  return "steady";
}

// ---------- Players (C2, C4, C7, C9, C10, W1, W2, W4, W6, W7, W8) ----------
export interface Result { game: GameFacts; player: PlayerFacts }

export interface PlayerStats {
  key: string;
  /** Most recent spelling. */
  name: string;
  games: number;
  wins: number;
  decided: number;
  turnsMs: number[];
  avgTurnMs: number;
  totalMs: number;
  overLimit: number;
  limitedTurns: number;
  /** Newest first. */
  results: Result[];
}

export function playerStats(games: GameFacts[]): PlayerStats[] {
  const map = new Map<string, PlayerStats>();
  for (const g of games) for (const p of g.players) {
    let s = map.get(p.key);
    if (!s) { s = { key: p.key, name: p.nickname, games: 0, wins: 0, decided: 0, turnsMs: [], avgTurnMs: 0, totalMs: 0, overLimit: 0, limitedTurns: 0, results: [] }; map.set(p.key, s); }
    s.games++;
    if (p.won !== null) s.decided++;
    if (p.won === true) s.wins++;
    s.turnsMs.push(...p.countedTurnsMs);
    s.totalMs += p.totalMs;
    if (g.limitMs !== null) { s.overLimit += p.overLimit; s.limitedTurns += p.countedTurnsMs.length; }
    s.results.push({ game: g, player: p });
  }
  const out = [...map.values()];
  for (const s of out) s.avgTurnMs = mean(s.turnsMs);
  return out.sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
}

export function winRate(wins: number, decided: number): number | null {
  return decided > 0 ? wins / decided : null;
}

/** Current streak, newest first, skipping games whose winner is unknown. */
export function streak(results: Result[]): { kind: "win" | "loss"; count: number } | undefined {
  const known = results.filter((r) => r.player.won !== null);
  if (known.length === 0) return undefined;
  const won = known[0]!.player.won === true;
  let count = 0;
  for (const r of known) { if ((r.player.won === true) !== won) break; count++; }
  return { kind: won ? "win" : "loss", count };
}

export interface Rival { key: string; name: string; together: number; myWins: number; theirWins: number }

/** Head to head (W7): games both played with a known winner, and who won more of them. */
export function rivals(all: PlayerStats[], me: PlayerStats): Rival[] {
  const out: Rival[] = [];
  for (const other of all) {
    if (other.key === me.key) continue;
    let together = 0, myWins = 0, theirWins = 0;
    for (const { game, player } of me.results) {
      const op = game.players.find((p) => p.key === other.key);
      if (!op || player.won === null) continue;
      together++;
      if (player.won) myWins++;
      if (op.won) theirWins++;
    }
    if (together > 0) out.push({ key: other.key, name: other.name, together, myWins, theirWins });
  }
  return out.sort((a, b) => b.together - a.together);
}

/** Wins per month (W8), oldest first. */
export function winsByMonth(me: PlayerStats): { month: string; wins: number; games: number }[] {
  const map = new Map<string, { wins: number; games: number }>();
  for (const { game, player } of me.results) {
    const m = map.get(game.month) ?? { wins: 0, games: 0 };
    m.games++;
    if (player.won) m.wins++;
    map.set(game.month, m);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
}

// ---------- Factions (C3, C7, C9, C10, W3, W4) ----------
export interface FactionPlayer { key: string; name: string; games: number; wins: number; turnsMs: number[] }
export interface FactionStats {
  key: string;
  games: number;
  wins: number;
  decided: number;
  turnsMs: number[];
  avgTurnMs: number;
  overLimit: number;
  limitedTurns: number;
  players: FactionPlayer[];
}

export function factionStats(games: GameFacts[]): FactionStats[] {
  const map = new Map<string, FactionStats & { pmap: Map<string, FactionPlayer> }>();
  for (const g of games) for (const p of g.players) {
    let f = map.get(p.faction);
    if (!f) { f = { key: p.faction, games: 0, wins: 0, decided: 0, turnsMs: [], avgTurnMs: 0, overLimit: 0, limitedTurns: 0, players: [], pmap: new Map() }; map.set(p.faction, f); }
    f.games++;
    if (p.won !== null) f.decided++;
    if (p.won === true) f.wins++;
    f.turnsMs.push(...p.countedTurnsMs);
    if (g.limitMs !== null) { f.overLimit += p.overLimit; f.limitedTurns += p.countedTurnsMs.length; }
    let fp = f.pmap.get(p.key);
    if (!fp) { fp = { key: p.key, name: p.nickname, games: 0, wins: 0, turnsMs: [] }; f.pmap.set(p.key, fp); }
    fp.games++;
    if (p.won === true) fp.wins++;
    fp.turnsMs.push(...p.countedTurnsMs);
  }
  return [...map.values()].map(({ pmap, ...f }) => ({ ...f, avgTurnMs: mean(f.turnsMs), players: [...pmap.values()].sort((a, b) => b.games - a.games) }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games || a.key.localeCompare(b.key));
}

/** One player's games on each faction (C9, C10, W4 from the player's side). */
export function playerFactions(me: PlayerStats): { faction: string; games: number; wins: number; avgTurnMs: number }[] {
  const map = new Map<string, { games: number; wins: number; turns: number[] }>();
  for (const { player } of me.results) {
    const f = map.get(player.faction) ?? { games: 0, wins: 0, turns: [] };
    f.games++;
    if (player.won) f.wins++;
    f.turns.push(...player.countedTurnsMs);
    map.set(player.faction, f);
  }
  return [...map.entries()].map(([faction, f]) => ({ faction, games: f.games, wins: f.wins, avgTurnMs: mean(f.turns) }))
    .sort((a, b) => b.wins - a.wins || b.games - a.games);
}

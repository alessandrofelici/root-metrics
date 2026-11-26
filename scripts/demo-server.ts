// Local preview with sample data: the real app over an in-memory store that holds the
// bundled fixtures plus generated sample games. No database; nothing is written to disk.
//
//   npm run demo        → http://localhost:8080/demo/visuals   (PORT=… to change the port)
//
// The sample games are made up (deterministic, seeded) so the stats pages have something to
// show. They follow contract v1: seat order, the winner is whoever the game ended on, totals add up.
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "../src/app.js";
import { FIXTURES_DIR, PORT } from "../src/config.js";
import { FACTIONS } from "../src/factions.js";
import { parseGameResult } from "../src/parse.js";
import type { GameResult, ResultStore, StoredResult } from "../src/types.js";

class MemoryStore implements ResultStore {
  private rows = new Map<string, StoredResult>();
  async save(r: GameResult, warnings: string[] = [], savedAt = new Date().toISOString()): Promise<boolean> {
    if (this.rows.has(r.game_id)) return false;
    this.rows.set(r.game_id, { result: r, warnings, saved_at: savedAt });
    return true;
  }
  async list(): Promise<StoredResult[]> {
    return [...this.rows.values()].sort((a, b) => b.saved_at.localeCompare(a.saved_at));
  }
  async get(gameId: string): Promise<StoredResult | undefined> {
    return this.rows.get(gameId);
  }
  async close(): Promise<void> {}
}

// ---------- Sample games ----------
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261126);
const shuffle = <T>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
};
const weighted = <T>(items: [T, number][]): T => {
  let x = rand() * items.reduce((n, [, w]) => n + w, 0);
  for (const [v, w] of items) { if ((x -= w) <= 0) return v; }
  return items.at(-1)![0];
};
const pad2 = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:00`;

// Base seconds per turn and how often each player's seat ends the game (= wins).
const PEOPLE: Record<string, { pace: number; luck: number }> = {
  Jacob: { pace: 72, luck: 2 },
  Alex: { pace: 104, luck: 1.4 },
  Ahmed: { pace: 64, luck: 2.6 },
  Lorenzo: { pace: 88, luck: 1 },
};
const COMMON = new Set(["marquise", "eyrie", "woodland", "vagabond"]);

function sampleGame(ended: Date): GameResult {
  const names = shuffle(Object.keys(PEOPLE)).slice(0, rand() < 0.65 ? 4 : 3);
  const factions = shuffle(Object.keys(FACTIONS).flatMap((k) => (COMMON.has(k) ? [k, k, k] : [k])));
  const picked: string[] = [];
  for (const f of factions) if (!picked.includes(f) && picked.length < names.length) picked.push(f);
  const rounds = 6 + Math.floor(rand() * 6);
  const endSeat = weighted(names.map((n, i): [number, number] => [i + 1, PEOPLE[n]!.luck]));
  const limit = rand() < 0.6 ? weighted<number>([[90_000, 1], [120_000, 2], [150_000, 1]]) : null;
  const players = names.map((nickname, i) => {
    const seat = i + 1;
    const turns = seat <= endSeat ? rounds : rounds - 1;
    const turns_ms = Array.from({ length: turns }, (_, t) => {
      const arc = 0.7 + 0.6 * Math.sin((Math.PI * (t + 0.5)) / rounds); // longer mid-game
      const noise = Math.exp((rand() - 0.5) * 1.6);
      return Math.round(PEOPLE[nickname]!.pace * arc * noise) * 1000 + Math.floor(rand() * 1000);
    });
    const total_ms = turns_ms.reduce((a, b) => a + b, 0);
    return { seat, nickname, faction: picked[i]!, total_ms, turns_ms, turns_truncated: false };
  });
  const id = Array.from({ length: 16 }, () => Math.floor(rand() * 16).toString(16)).join("");
  return {
    schema: "rootclock.game_result",
    schema_version: 1,
    game_id: id,
    device: { app: "rootclock", app_version: "001" },
    ended_at: localIso(ended),
    turn_limit_ms: limit,
    global_ms: players.reduce((n, p) => n + p.total_ms, 0),
    players,
  };
}

const store = new MemoryStore();
const now = Date.now();
const DAY = 86_400_000;
let day = 2;
for (let i = 0; i < 30; i++) {
  day += rand() < 0.3 ? 0 : 1 + Math.floor(rand() * 4); // some evenings have two games
  const d = new Date(now - day * DAY);
  d.setUTCHours(18 + Math.floor(rand() * 4), Math.floor(rand() * 60), 0, 0);
  const r = sampleGame(d);
  await store.save(r, [], `${r.ended_at}Z`);
}
for (const f of fs.readdirSync(FIXTURES_DIR).filter((n) => n.endsWith(".json"))) {
  const out = parseGameResult(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf8"));
  if (out.ok) await store.save(out.result, out.warnings);
}

const total = (await store.list()).length;
serve({ fetch: createApp(store, { timeZone: "UTC" }).fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`demo: ${total} games in memory (sample + fixtures)`);
  console.log(`open http://localhost:${info.port}/demo/visuals`);
});

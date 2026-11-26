// Edge cases at the contract's real limits. These fixtures live in test/fixtures (not fixtures/)
// so the app never imports them into a real database.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseGameResult } from "../src/parse.js";
import { SqliteResultStore } from "../src/store.js";
import type { GameResult } from "../src/types.js";

const DIR = path.resolve(import.meta.dirname, "fixtures");
const raw = (name: string) => fs.readFileSync(path.join(DIR, name), "utf8");

function load(name: string): GameResult {
  const out = parseGameResult(raw(name));
  if (!out.ok) throw new Error(`${name}: ${out.error}`);
  expect(out.warnings, name).toEqual([]);
  return out.result;
}

let tmp: string;
let store: SqliteResultStore;
beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-edge-"));
  store = new SqliteResultStore(path.join(tmp, "t.db"));
});
afterEach(async () => {
  await store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const page = async (id: string) => (await createApp(store).request(`/games/${id}`)).text();
/** Full-size turn bars (the expandable rows); the wide table's mini bars carry no data-turn. */
const bars = (html: string) => html.match(/<rect class="bar [a-z]+" data-turn="\d+"/g) ?? [];

describe("edge-case fixtures", () => {
  it("every edge fixture parses with no warnings", async () => {
    for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) load(f);
  });

  it("4 players × 128 turns: under 5 KB, stores and renders all 512 turns", async () => {
    expect(Buffer.byteLength(raw("max-4x128.json").trim())).toBeLessThan(5 * 1024);
    const r = load("max-4x128.json");
    expect(r.players.map((p) => p.turns_ms.length)).toEqual([128, 128, 128, 128]);
    await store.save(r);
    expect((await store.get(r.game_id))!.result).toEqual(r);
    const html = await page(r.game_id);
    expect(bars(html)).toHaveLength(512);
    expect(html).not.toMatch(/NaN/);
  });

  it("turns_truncated: notes it, dashes the folded last turn, never flags it over, winner NULL", async () => {
    const r = load("truncated.json");
    expect(r.players[0]!.turns_truncated).toBe(true);
    await store.save({ ...r, turn_limit_ms: 1 }); // every normal turn is over a 1 ms limit
    const html = await page(r.game_id);
    expect(html).toContain("Jacob&#39;s last turn includes extra turns beyond 128.");
    const p1 = bars(html).slice(0, 128);
    expect(p1.slice(0, 127).every((b) => b.includes('"bar over"'))).toBe(true);
    expect(p1[127]).toContain('"bar folded"');
    expect(html).toContain("127 of 127"); // over-limit count leaves the folded turn out
    expect(html).toContain("NULL");
  });

  it("single-turn player: one bar; over-limit counts per player", async () => {
    const r = load("single-turn.json");
    await store.save(r);
    const html = await page(r.game_id);
    expect(html).toContain(">Ahmed<");
    expect(bars(html)).toHaveLength(3);
    expect(html).toContain("0 of 1"); // Ahmed 0:42 under 1:00
    expect(html).toContain("1 of 2"); // Lorenzo 1:01 over, 0:58 under
    expect(html).toContain("<title>Turn 1: 1:01 (over 1:00)</title>");
    expect(html).toContain("<title>Turn 2: 0:58</title>");
  });

  it("unknown faction and odd nickname are shown as-is, escaped, without an icon", async () => {
    const r = load("unknown-faction-nickname.json");
    await store.save(r);
    const html = await page(r.game_id);
    expect(html).toContain("Zoë 🦦");
    expect(html).toContain(">otters<");
    expect(html).not.toContain("/static/factions/otters.png");
    expect(html).toContain("&lt;b&gt;Robin&lt;/b&gt;");
    expect(html).not.toContain("<b>Robin</b>");
    expect(html).toContain("/static/factions/lilypad.png");
  });
});

describe("over-limit marking on the spec fixtures", () => {
  it("fixture A marks Alex's 2:14 turn over the 2:00 limit; fixture B has no limit", async () => {
    const root = path.resolve(import.meta.dirname, "../fixtures");
    for (const f of ["fixture-a.json", "fixture-b.json"]) {
      const out = parseGameResult(fs.readFileSync(path.join(root, f), "utf8"));
      if (out.ok) await store.save(out.result);
    }
    const a = await page("7f3a9c21e04b5d18");
    expect(bars(a).filter((b) => b.includes('"bar over"'))).toHaveLength(1);
    expect(a).toContain("<title>Turn 2: 2:00</title>"); // exactly at the limit is not over
    const b = await page("c09e5b7a31f2d846");
    expect(b).not.toContain('"bar over"');
    expect(b).not.toContain("(over ");
  });
});

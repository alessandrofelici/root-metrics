import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { parseGameResult } from "../src/parse.js";
import { SqliteResultStore } from "../src/store.js";
import type { GameResult } from "../src/types.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const ID_A = "7f3a9c21e04b5d18";
const ID_B = "c09e5b7a31f2d846";

function loadFixture(name: string): GameResult {
  const outcome = parseGameResult(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
  if (!outcome.ok) throw new Error(`fixture ${name} rejected: ${outcome.error}`);
  return outcome.result;
}

let tmpDir: string;
let store: SqliteResultStore;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-app-"));
  store = new SqliteResultStore(path.join(tmpDir, "test.db"));
});

afterEach(async () => {
  vi.useRealTimers();
  await store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function get(p: string, timeZone = "UTC"): Promise<{ status: number; body: string; location: string | null }> {
  const res = await createApp(store, { timeZone }).request(p);
  return { status: res.status, body: await res.text(), location: res.headers.get("location") };
}

/** Text a reader sees: tags and attributes removed. */
const visible = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

async function saveAt(iso: string, r: GameResult, warnings: string[] = []) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
  const inserted = await store.save(r, warnings);
  vi.useRealTimers();
  return inserted;
}

describe("with both fixtures stored", () => {
  beforeEach(async () => {
    // Fixture A has no ended_at: it is dated by when it was received. B carries its own ended_at.
    await saveAt("2026-11-21T19:05:00Z", loadFixture("fixture-a.json"));
    await saveAt("2026-11-21T19:06:00Z", loadFixture("fixture-b.json"));
  });

  it("Home shows the latest game, a link to the rest of that day, the calendar and View stats", async () => {
    const { status, body } = await get("/");
    expect(status).toBe(200);
    expect(body.toLowerCase()).toMatch(/^<!doctype html>/);
    expect(body).toContain('name="viewport"');
    expect(body).toContain('href="/static/app.css"');
    expect(body).toContain("Latest game");
    expect(body).toContain(`href="/games/${ID_B}"`); // B was saved last
    expect(body).toContain("Sat 21 Nov 2026");
    expect(body).toContain("8:14 PM"); // the day had 2 games, so the time shows
    expect(body).toContain("1 more game that day");
    expect(body).toContain('href="/days/2026-11-21"');
    expect(body).toContain("November 2026");
    expect(body).toContain('href="/stats"');
    expect(body).toContain("View stats");
    expect(visible(body)).not.toContain(ID_B);
  });

  it("the Day page lists both games with their times, newest first", async () => {
    const { status, body } = await get("/days/2026-11-21");
    expect(status).toBe(200);
    expect(body).toContain("2 games");
    expect(body).toContain("7:05 PM");
    expect(body).toContain("8:14 PM");
    expect(body.indexOf(ID_B)).toBeLessThan(body.indexOf(ID_A));
  });

  it("a day with no games is not found; a malformed day is not found", async () => {
    expect((await get("/days/2026-11-20")).status).toBe(404);
    expect((await get("/days/yesterday")).status).toBe(404);
  });

  it("Game A: date heading, winner marked once in the list, over-limit turns, no game ID", async () => {
    const { status, body } = await get(`/games/${ID_A}`);
    expect(status).toBe(200);
    for (const s of ["Marquise de Cat", "Eyrie Dynasties", "Woodland Alliance", "Jacob", "Alex", "Ahmed"]) expect(body).toContain(s);
    expect(body).toContain("<h1 class=\"display\">Sat 21 Nov 2026</h1>");
    expect(body).toContain("7:05 PM");
    expect(body).toContain("11 min"); // 666000 ms
    expect(body).toContain("2:00"); // turn limit
    expect(body).not.toContain("Avg per player");
    // Winner = whoever's turn the game ended on: turn counts 3, 3, 2 → seat 2, Alex.
    const winnerRows = body.match(/<span class="winner">/g) ?? [];
    expect(winnerRows).toHaveLength(2); // narrow row + wide table, both Alex
    expect(body.indexOf('<span class="winner">')).toBeGreaterThan(body.indexOf(">Alex<"));
    expect(body).toContain("1 of 3"); // Alex's 2:14 over 2:00
    expect(body).toContain("<title>Turn 3: 2:14 (over 2:00)</title>");
    expect(body).toContain("<title>Turn 2: 2:00</title>"); // exactly at the limit is not over
    expect(body).toContain('href="/days/2026-11-21"'); // back to the day: it had 2 games
    expect(visible(body.replace(/href="[^"]*"/g, ""))).not.toContain(ID_A);
    expect(body).not.toContain("Data notes");
  });

  it("Game B: no turn limit, full faction names, winner Ahmed", async () => {
    const { status, body } = await get(`/games/${ID_B}`);
    expect(status).toBe(200);
    expect(body).toContain("None");
    for (const s of ["Lizard Cult", "Underground Duchy", "Corvid Conspiracy", "Vagabond", "Lorenzo"]) expect(body).toContain(s);
    expect(body).not.toContain("(over ");
    // counts 2, 2, 2, 1 → seat 3
    const firstWinner = body.indexOf('<span class="winner">');
    expect(body.lastIndexOf(">Ahmed<", firstWinner)).toBeGreaterThan(body.lastIndexOf(">Alex<", firstWinner));
  });

  it("dates and days follow the configured time zone", async () => {
    const day = await get("/days/2026-11-21", "America/New_York");
    expect(day.body).toContain("2:05 PM"); // A received 19:05 UTC
    expect(day.body).toContain("8:14 PM"); // B's own ended_at is shown as written
  });

  it("a repeat upload keeps the first received time", async () => {
    expect(await saveAt("2026-11-22T09:00:00Z", loadFixture("fixture-a.json"))).toBe(false);
    const { body } = await get("/days/2026-11-21");
    expect(body).toContain("7:05 PM");
  });

  it("the calendar changes month from the URL and slides in the arrow's direction", async () => {
    const oct = await get("/?month=2026-10&slide=prev");
    expect(oct.body).toContain("October 2026");
    expect(oct.body).toContain('data-slide="prev"');
    expect(oct.body).toContain("No games this month");
    const bad = await get("/?month=2026-13&slide=sideways");
    expect(bad.body).toContain("November 2026");
    expect(bad.body).not.toContain("data-slide");
  });

  it("calendar fragment: one month's calendar for in-place month changes", async () => {
    const page = await get("/");
    expect(page.body).toContain('<script src="/static/app.js" defer=""></script>');
    expect(page.body).toContain('data-calendar="2026-11"');
    expect(page.body).toContain('data-month="2026-10" data-dir="prev"');
    const frag = await get("/fragments/calendar?month=2026-10");
    expect(frag.status).toBe(200);
    expect(frag.body.toLowerCase()).not.toContain("<!doctype");
    expect(frag.body).toMatch(/^<section class="card calendar"/);
    expect(frag.body).toContain('data-calendar="2026-10"');
    expect(frag.body).toContain("October 2026");
    const nov = await get("/fragments/calendar?month=2026-11");
    expect(nov.body).toContain('href="/days/2026-11-21"');
    expect((await get("/fragments/calendar?month=nope")).status).toBe(400);
    expect((await get("/fragments/calendar")).status).toBe(400);
  });

  it("stats pages render and never show catalogue IDs", async () => {
    for (const p of ["/stats", "/stats/games", "/stats/players", "/stats/players?view=wins", "/stats/factions", "/players/alex", "/factions/eyrie"]) {
      const { status, body } = await get(p);
      expect(status, p).toBe(200);
      expect(visible(body), p).not.toMatch(/\b[CW]\d{1,2}\b/);
      expect(body, p).not.toMatch(/NaN|undefined/);
    }
    const stats = await get("/stats");
    expect(stats.body).toContain("Records");
    expect(stats.body).toContain("2:14"); // longest turn: Alex in A
    expect(stats.body).toContain("Alex · Sat 21 Nov");
    expect(stats.body).toContain('data-chart="C13"');
  });

  it("who plays what: all three views on the page, switched by radios, not links", async () => {
    const { body } = await get("/stats/players");
    expect(body).not.toContain("?view=");
    for (const k of ["games", "speed", "wins"]) expect(body).toContain(`class="view-panel view-${k}`);
    expect(body).toMatch(/id="mv-games" value="games" checked/);
    expect(body).toContain('class="view-panel view-games default"');
    const wins = await get("/stats/players?view=wins");
    expect(wins.body).toMatch(/id="mv-wins" value="wins" checked/);
    expect(wins.body).toContain('class="view-panel view-wins default"');
    expect(wins.body).toMatch(/<details class="disclosure" data-chart="C9 C10 W4" open/);
  });

  it("player and faction pages: case-insensitive names, unknown ones are not found", async () => {
    expect((await get("/players/ALEX")).status).toBe(200);
    expect((await get("/players/nobody")).status).toBe(404);
    expect((await get("/factions/nope")).status).toBe(404);
    const alex = await get("/players/alex");
    expect(alex.body).toContain("<h1 class=\"display\">Alex</h1>");
    expect(alex.body).toContain("Recent games");
  });

  it("unknown game id → 404", async () => {
    const { status, body } = await get("/games/does-not-exist");
    expect(status).toBe(404);
    expect(body).toContain("Not found");
  });
});

describe("single games and edge cases", () => {
  const base = (): GameResult => loadFixture("fixture-a.json");

  it("serves the Marquise favicon and links it from every page", async () => {
    const { body } = await get("/");
    expect(body).toContain('<link rel="icon" href="/static/favicon.ico" sizes="32x32"/>');
    expect(body).toContain('<link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png"/>');
    const ico = await createApp(store, { publicDir: path.resolve(import.meta.dirname, "../public") }).request("/static/favicon.ico");
    expect(ico.status).toBe(200);
    expect(Buffer.from(await ico.arrayBuffer()).subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
    const root = await get("/favicon.ico");
    expect(root.status).toBe(301);
    expect(root.location).toBe("/static/favicon.ico");
  });

  it("empty store shows the empty state", async () => {
    const { status, body } = await get("/");
    expect(status).toBe(200);
    expect(body).toContain("No games yet");
  });

  it("a day with one game redirects to that game; no time is shown", async () => {
    await saveAt("2026-11-21T19:05:00Z", base());
    const day = await get("/days/2026-11-21");
    expect(day.status).toBe(302);
    expect(day.location).toBe(`/games/${ID_A}`);
    const game = await get(`/games/${ID_A}`);
    expect(game.body).not.toContain("7:05 PM");
    expect(game.body).toContain('href="/?month=2026-11"');
  });

  it("unknown faction key is shown as-is, without an icon", async () => {
    const r = base();
    r.players[0]!.faction = "otters";
    await store.save(r);
    const { body } = await get(`/games/${ID_A}`);
    expect(body).toContain("otters");
    expect(body).not.toContain("/static/factions/otters.png");
    expect(body).toContain('src="/static/factions/eyrie.png"');
  });

  it("escapes untrusted nicknames", async () => {
    const r = base();
    r.players[0]!.nickname = "<script>alert(1)</script>";
    await store.save(r);
    for (const p of [`/games/${ID_A}`, "/", "/stats/players"]) {
      const { body } = await get(p);
      expect(body, p).not.toContain("<script>");
    }
    expect((await get(`/games/${ID_A}`)).body).toContain("&lt;script&gt;");
  });

  it("data notes show warnings and truncation; a truncated game has a NULL winner", async () => {
    const r = base();
    r.players[1]!.turns_truncated = true;
    await store.save(r, ["sum of players total_ms differs from global_ms"]);
    const { body } = await get(`/games/${ID_A}`);
    expect(body).toContain("Data notes");
    expect(body).toContain("sum of players total_ms differs from global_ms");
    expect(body).toContain("Alex&#39;s last turn includes extra turns beyond 128.");
    expect(body).toContain("NULL");
    expect(body).not.toContain('<span class="winner">');
  });

  it("URL-encodes game ids in links and resolves them on the detail route", async () => {
    const r = base();
    r.game_id = "a b/c?d";
    await store.save(r);
    const list = await get("/");
    expect(list.body).toContain('href="/games/a%20b%2Fc%3Fd"');
    const detail = await get("/games/a%20b%2Fc%3Fd");
    expect(detail.status).toBe(200);
    expect(detail.body).toContain("Jacob");
  });

  it("1-player games are left out of stats", async () => {
    const solo = base();
    solo.game_id = "solo0001";
    solo.players = [{ ...solo.players[0]!, nickname: "Tester" }];
    solo.global_ms = solo.players[0]!.total_ms;
    await store.save(solo);
    await store.save(base());
    const { body } = await get("/stats/players");
    expect(body).not.toContain("Tester");
    expect(body).toContain("Alex");
    expect((await get("/players/tester")).status).toBe(404);
  });
});

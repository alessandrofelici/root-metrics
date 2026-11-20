import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-app-"));
  store = new SqliteResultStore(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function get(p: string): Promise<{ status: number; body: string }> {
  const res = await createApp(store).request(p);
  return { status: res.status, body: await res.text() };
}

describe("with both fixtures stored", () => {
  beforeEach(() => {
    store.save(loadFixture("fixture-a.json"));
    store.save(loadFixture("fixture-b.json"));
  });

  it("GET / lists both games with count, time and date", async () => {
    const { status, body } = await get("/");
    expect(status).toBe(200);
    expect(body.toLowerCase()).toMatch(/^<!doctype html>/);
    expect(body).toContain('name="viewport"');
    expect(body).toContain(`href="/games/${ID_A}"`);
    expect(body).toContain(`href="/games/${ID_B}"`);
    expect(body).toContain("3 players");
    expect(body).toContain("4 players");
    expect(body).toContain("date unknown");
    expect(body).toContain("2026-11-21T20:14:05");
    expect(body).toContain("11:06"); // A global 666000
    expect(body).toContain("7:40"); // B global 460000
    // newest first: B was saved last
    expect(body.indexOf(ID_B)).toBeLessThan(body.indexOf(ID_A));
  });

  it("GET /games/<A> shows the fixture A detail", async () => {
    const { status, body } = await get(`/games/${ID_A}`);
    expect(status).toBe(200);
    for (const s of ["Marquise de Cat", "Eyrie Dynasties", "Woodland Alliance", "Jacob", "Alex", "Ahmed"]) {
      expect(body).toContain(s);
    }
    expect(body).toContain("Turn limit: 2:00");
    expect(body).toContain("date unknown");
    expect(body).toContain("Seat 1");
    expect(body).toContain("Seat 3");
    expect(body).toContain("<li>1:02</li>");
    expect(body).toContain('<li class="over">2:14 (over limit)</li>');
    expect(body).toContain("3:48"); // Jacob total 228000
    expect(body).toContain("11:06");
    expect(body).toContain('href="/"');
    expect(body).not.toContain("extra turns beyond 128");
    expect(body).not.toContain("Warnings");
    // players in array order
    expect(body.indexOf("Jacob")).toBeLessThan(body.indexOf("Alex"));
    expect(body.indexOf("Alex")).toBeLessThan(body.indexOf("Ahmed"));
  });

  it("GET /games/<B> shows no turn limit and full faction names", async () => {
    const { status, body } = await get(`/games/${ID_B}`);
    expect(status).toBe(200);
    expect(body).toContain("no turn limit");
    expect(body).toContain("Lizard Cult");
    expect(body).toContain("Underground Duchy");
    expect(body).toContain("Corvid Conspiracy");
    expect(body).toContain("Lorenzo");
    expect(body).toContain("Seat 4");
    expect(body).toContain("2026-11-21T20:14:05");
  });

  it("unknown game id → 404", async () => {
    const { status, body } = await get("/games/does-not-exist");
    expect(status).toBe(404);
    expect(body).toContain("Not found");
  });
});

describe("edge cases", () => {
  const base = (): GameResult => loadFixture("fixture-a.json");

  it("empty store shows the empty state", async () => {
    const { status, body } = await get("/");
    expect(status).toBe(200);
    expect(body).toContain("No games yet.");
  });

  it("unknown faction key is shown as-is", async () => {
    const r = base();
    r.players[0]!.faction = "otters";
    store.save(r);
    const { body } = await get(`/games/${ID_A}`);
    expect(body).toContain("otters");
  });

  it("escapes untrusted nicknames", async () => {
    const r = base();
    r.players[0]!.nickname = "<script>alert(1)</script>";
    store.save(r);
    const { body } = await get(`/games/${ID_A}`);
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("renders stored warnings and the truncation note", async () => {
    const r = base();
    r.players[1]!.turns_truncated = true;
    store.save(r, ["sum of players total_ms differs from global_ms"]);
    const { body } = await get(`/games/${ID_A}`);
    expect(body).toContain("Warnings");
    expect(body).toContain("sum of players total_ms differs from global_ms");
    expect(body).toContain("last turn includes extra turns beyond 128");
  });

  it("URL-encodes game ids in links and resolves them on the detail route", async () => {
    const r = base();
    r.game_id = "a b/c?d";
    store.save(r);
    const list = await get("/");
    expect(list.body).toContain('href="/games/a%20b%2Fc%3Fd"');
    const detail = await get("/games/a%20b%2Fc%3Fd");
    expect(detail.status).toBe(200);
    expect(detail.body).toContain("Jacob");
  });
});

describe("faction icons and average per player", () => {
  beforeEach(() => {
    store.save(loadFixture("fixture-a.json"));
    store.save(loadFixture("fixture-b.json"));
  });

  it("list shows the average per player and faction icons", async () => {
    const { body } = await get("/");
    expect(body).toContain("avg 3:42 per player"); // A: 666000 / 3
    expect(body).toContain("avg 1:55 per player"); // B: 460000 / 4
    expect(body).toContain('src="/static/factions/cult.png"');
    expect(body).toContain('alt="Lizard Cult"');
  });

  it("detail shows the average and an icon per known faction", async () => {
    const { body } = await get(`/games/${ID_A}`);
    expect(body).toContain("Average per player: 3:42");
    for (const k of ["marquise", "eyrie", "woodland"]) {
      expect(body).toContain(`src="/static/factions/${k}.png"`);
    }
  });

  it("unknown faction gets no icon", async () => {
    const r = loadFixture("fixture-a.json");
    r.game_id = "otters01";
    r.players[0]!.faction = "otters";
    store.save(r);
    const { body } = await get("/games/otters01");
    expect(body).toContain("otters");
    expect(body).not.toContain("/static/factions/otters.png");
  });

  it("serves icon files as PNG and 404s missing or traversal paths", async () => {
    const app = createApp(store, { publicDir: path.resolve(import.meta.dirname, "../public") });
    const ok = await app.request("/static/factions/marquise.png");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect((await app.request("/static/factions/otters.png")).status).toBe(404);
    expect((await app.request("/static/..%2Fpackage.json")).status).toBe(404);
    expect((await app.request("/static/../package.json")).status).toBe(404);
  });
});

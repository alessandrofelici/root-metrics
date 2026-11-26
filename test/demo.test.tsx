// The visual-switches demo page (/demo/visuals): renders every switch from the stored games,
// keeps catalogue IDs and game IDs out of the visible text, and escapes nicknames.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { parseGameResult } from "../src/parse.js";
import { SqliteResultStore } from "../src/store.js";
import type { GameResult } from "../src/types.js";
import { SWITCH_IDS } from "../src/views/demo.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");

function loadFixture(name: string): GameResult {
  const outcome = parseGameResult(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
  if (!outcome.ok) throw new Error(`fixture ${name} rejected: ${outcome.error}`);
  return outcome.result;
}

let tmpDir: string;
let store: SqliteResultStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-demo-"));
  store = new SqliteResultStore(path.join(tmpDir, "test.db"));
});

afterEach(async () => {
  await store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function get(p: string) {
  const res = await createApp(store, { timeZone: "UTC" }).request(p);
  return { status: res.status, body: await res.text() };
}

const visible = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("/demo/visuals", () => {
  it("renders every switch, Now beside Proposed, with the demo stylesheet", async () => {
    await store.save(loadFixture("fixture-a.json"));
    await store.save(loadFixture("fixture-b.json"));
    const { status, body } = await get("/demo/visuals");
    expect(status).toBe(200);
    expect(body).toContain('href="/static/demo.css"');
    for (const id of SWITCH_IDS) expect(body).toContain(`id="${id}"`);
    expect(body.match(/class="switch-col now"/g)).toHaveLength(SWITCH_IDS.length);
    expect(body.match(/class="switch-col proposed"/g)).toHaveLength(SWITCH_IDS.length);
    // Rings carry the percentage as text and as an accessible name.
    expect(body).toMatch(/<svg class="ring tone-accent"[^>]*aria-label="Win rate: \d+%"/);
    const text = visible(body);
    expect(text).not.toMatch(/\b[CW]\d{1,2}\b/);
    expect(text).not.toContain("7f3a9c21e04b5d18");
  });

  it("other pages don't load the demo stylesheet", async () => {
    await store.save(loadFixture("fixture-a.json"));
    const { body } = await get("/");
    expect(body).not.toContain("demo.css");
  });

  it("escapes nicknames", async () => {
    const r = loadFixture("fixture-a.json");
    r.players[0]!.nickname = "<b>Jake</b>";
    await store.save(r);
    const { body } = await get("/demo/visuals");
    expect(body).not.toContain("<b>Jake</b>");
    expect(body).toContain("&lt;b&gt;Jake&lt;/b&gt;");
  });

  it("an empty store explains how to see the demo", async () => {
    const { status, body } = await get("/demo/visuals");
    expect(status).toBe(200);
    expect(visible(body)).toContain("npm run demo");
  });
});

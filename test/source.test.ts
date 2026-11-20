import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixtureResultSource, ingest } from "../src/source.js";
import { SqliteResultStore } from "../src/store.js";
import type { GameResult } from "../src/types.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const fixtureAText = fs.readFileSync(path.join(fixturesDir, "fixture-a.json"), "utf8");

let tmpDir: string;
const stores: SqliteResultStore[] = [];

function newStore(): SqliteResultStore {
  const s = new SqliteResultStore(path.join(tmpDir, "db", "test.db"));
  stores.push(s);
  return s;
}

function silentLogger() {
  return { warn: vi.fn() };
}

async function collect(source: FixtureResultSource) {
  const out: { result: GameResult; warnings: string[] }[] = [];
  for await (const item of source.results()) out.push(item);
  return out;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-source-"));
});

afterEach(() => {
  for (const s of stores.splice(0)) {
    try {
      s.close();
    } catch {
      // already closed
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("FixtureResultSource", () => {
  it("yields both bundled fixtures, sorted by filename, with no warnings", async () => {
    const logger = silentLogger();
    const items = await collect(new FixtureResultSource(fixturesDir, logger));
    expect(items.map((i) => i.result.game_id)).toEqual(["7f3a9c21e04b5d18", "c09e5b7a31f2d846"]);
    expect(items.every((i) => i.warnings.length === 0)).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("skips and logs invalid JSON and wrong schema_version, ignores non-.json files", async () => {
    const dir = path.join(tmpDir, "in");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "a-valid.json"), fixtureAText);
    fs.writeFileSync(path.join(dir, "b-broken.json"), "{ not json");
    const wrongVersion = { ...JSON.parse(fixtureAText), game_id: "deadbeef", schema_version: 2 };
    fs.writeFileSync(path.join(dir, "c-v2.json"), JSON.stringify(wrongVersion));
    fs.writeFileSync(path.join(dir, "d-notes.txt"), "not a result");

    const logger = silentLogger();
    const items = await collect(new FixtureResultSource(dir, logger));

    expect(items).toHaveLength(1);
    expect(items[0]!.result.game_id).toBe("7f3a9c21e04b5d18");
    expect(logger.warn).toHaveBeenCalledTimes(2);
    const messages = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("b-broken.json") && m.includes("invalid JSON"))).toBe(true);
    expect(messages.some((m) => m.includes("c-v2.json") && m.includes("schema_version"))).toBe(true);
    expect(messages.some((m) => m.includes("d-notes.txt"))).toBe(false);
  });

  it("yields a result with a broken invariant together with its warning, and logs it", async () => {
    const dir = path.join(tmpDir, "in");
    fs.mkdirSync(dir);
    const broken = JSON.parse(fixtureAText);
    broken.players[1].total_ms = 342001;
    broken.global_ms = 666001; // keep the global invariant intact
    fs.writeFileSync(path.join(dir, "broken-invariant.json"), JSON.stringify(broken));

    const logger = silentLogger();
    const items = await collect(new FixtureResultSource(dir, logger));

    expect(items).toHaveLength(1);
    expect(items[0]!.warnings).toHaveLength(1);
    expect(items[0]!.warnings[0]).toContain("seat 2");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]![0])).toContain("broken-invariant.json");
  });

  it("yields nothing and does not throw for a missing directory", async () => {
    const logger = silentLogger();
    const items = await collect(new FixtureResultSource(path.join(tmpDir, "nope"), logger));
    expect(items).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("ingest", () => {
  it("stores both fixtures once; re-ingest only counts duplicates", async () => {
    const store = newStore();
    const source = new FixtureResultSource(fixturesDir, silentLogger());

    expect(await ingest(source, store)).toEqual({ inserted: 2, duplicates: 0 });
    expect(store.list()).toHaveLength(2);

    expect(await ingest(source, store)).toEqual({ inserted: 0, duplicates: 2 });
    expect(store.list()).toHaveLength(2);
  });

  it("stores parser warnings with the result", async () => {
    const dir = path.join(tmpDir, "in");
    fs.mkdirSync(dir);
    const broken = JSON.parse(fixtureAText);
    broken.global_ms = 1;
    fs.writeFileSync(path.join(dir, "g.json"), JSON.stringify(broken));

    const store = newStore();
    expect(await ingest(new FixtureResultSource(dir, silentLogger()), store)).toEqual({
      inserted: 1,
      duplicates: 0,
    });
    const stored = store.get(broken.game_id);
    expect(stored?.warnings).toHaveLength(1);
    expect(stored?.warnings[0]).toContain("global_ms 1");
  });
});

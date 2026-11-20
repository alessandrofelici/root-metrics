import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteResultStore, openStore } from "../src/store.js";
import type { GameResult } from "../src/types.js";

// Fixture A from specs.md, inlined so this test does not depend on fixtures/.
const fixtureA: GameResult = {
  schema: "rootclock.game_result",
  schema_version: 1,
  game_id: "7f3a9c21e04b5d18",
  device: { app: "rootclock", app_version: "001" },
  ended_at: null,
  turn_limit_ms: 120000,
  global_ms: 666000,
  players: [
    { seat: 1, nickname: "Jacob", faction: "marquise", total_ms: 228000, turns_ms: [62000, 95000, 71000], turns_truncated: false },
    { seat: 2, nickname: "Alex", faction: "eyrie", total_ms: 342000, turns_ms: [88000, 120000, 134000], turns_truncated: false },
    { seat: 3, nickname: "Ahmed", faction: "woodland", total_ms: 96000, turns_ms: [45000, 51000], turns_truncated: false },
  ],
};

const otherGame: GameResult = { ...fixtureA, game_id: "c09e5b7a31f2d846", global_ms: 460000 };

let tmpDir: string;
const stores: SqliteResultStore[] = [];

function track(s: SqliteResultStore): SqliteResultStore {
  stores.push(s);
  return s;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-store-"));
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

describe("SqliteResultStore", () => {
  it("stores a duplicate game_id once; second save returns false and leaves the row unchanged", () => {
    const store = track(openStore(tmpDir));
    expect(store.save(fixtureA, ["first"])).toBe(true);
    const before = store.get(fixtureA.game_id);

    const changed: GameResult = { ...fixtureA, global_ms: 1 };
    expect(store.save(changed, ["second"])).toBe(false);

    expect(store.list()).toHaveLength(1);
    expect(store.get(fixtureA.game_id)).toEqual(before);
    expect(store.get(fixtureA.game_id)?.result.global_ms).toBe(666000);
  });

  it("get returns the stored result and warnings, undefined for an unknown id", () => {
    const store = track(openStore(tmpDir));
    store.save(fixtureA, ["turns_ms sum mismatch for seat 3"]);

    const got = store.get(fixtureA.game_id);
    expect(got).toBeDefined();
    expect(got!.result).toEqual(fixtureA);
    expect(got!.warnings).toEqual(["turns_ms sum mismatch for seat 3"]);
    expect(Number.isNaN(Date.parse(got!.saved_at))).toBe(false);

    expect(store.get("does-not-exist")).toBeUndefined();
  });

  it("defaults warnings to an empty array", () => {
    const store = track(openStore(tmpDir));
    store.save(fixtureA);
    expect(store.get(fixtureA.game_id)?.warnings).toEqual([]);
  });

  it("lists newest first", () => {
    const store = track(openStore(tmpDir));
    store.save(fixtureA);
    store.save(otherGame);
    expect(store.list().map((s) => s.result.game_id)).toEqual([otherGame.game_id, fixtureA.game_id]);
  });

  it("survives close and reopen of the same file", () => {
    const first = track(openStore(tmpDir));
    first.save(fixtureA, ["w"]);
    first.save(otherGame);
    first.close();

    const reopened = track(openStore(tmpDir));
    expect(reopened.list().map((s) => s.result.game_id)).toEqual([otherGame.game_id, fixtureA.game_id]);
    expect(reopened.get(fixtureA.game_id)?.result).toEqual(fixtureA);
    expect(reopened.get(fixtureA.game_id)?.warnings).toEqual(["w"]);
    expect(reopened.save(fixtureA)).toBe(false);
  });

  it("creates the parent directory if missing", () => {
    const dbPath = path.join(tmpDir, "nested", "deeper", "rootclock.db");
    const store = track(new SqliteResultStore(dbPath));
    expect(fs.existsSync(path.dirname(dbPath))).toBe(true);
    expect(store.save(fixtureA)).toBe(true);
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});

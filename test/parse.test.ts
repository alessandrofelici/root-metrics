import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGameResult } from "../src/parse.js";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const loadFixture = (name: string): string => readFileSync(`${fixturesDir}${name}`, "utf8");

const fixtureA = loadFixture("fixture-a.json");
const fixtureB = loadFixture("fixture-b.json");

/** Fixture A as a mutable object, for building variants. */
function mutableA(): any {
  return JSON.parse(fixtureA);
}

function expectError(json: string): string {
  const out = parseGameResult(json);
  expect(out.ok).toBe(false);
  if (out.ok) throw new Error("unreachable");
  return out.error;
}

describe("parseGameResult", () => {
  it("parses Fixture A with no warnings", () => {
    const out = parseGameResult(fixtureA);
    expect(out).toEqual({ ok: true, result: JSON.parse(fixtureA), warnings: [] });
  });

  it("parses Fixture B with no warnings", () => {
    const out = parseGameResult(fixtureB);
    expect(out).toEqual({ ok: true, result: JSON.parse(fixtureB), warnings: [] });
    if (!out.ok) throw new Error("unreachable");
    expect(out.result.ended_at).toBe("2026-11-21T20:14:05");
    expect(out.result.turn_limit_ms).toBeNull();
    expect(out.result.players).toHaveLength(4);
  });

  it("rejects an unsupported schema_version", () => {
    const doc = mutableA();
    doc.schema_version = 2;
    expect(expectError(JSON.stringify(doc))).toBe("unsupported schema_version 2 (expected 1)");
  });

  it("rejects a missing schema_version", () => {
    const doc = mutableA();
    delete doc.schema_version;
    expect(expectError(JSON.stringify(doc))).toMatch(/schema_version/);
  });

  it("rejects a wrong schema, naming the bad value", () => {
    const doc = mutableA();
    doc.schema = "otherclock.game_result";
    const err = expectError(JSON.stringify(doc));
    expect(err).toContain("otherclock.game_result");
    expect(err).toContain("schema");
  });

  it("rejects invalid JSON", () => {
    expect(expectError("{ not json")).toMatch(/invalid JSON/);
  });

  it("rejects a non-object top level", () => {
    expect(expectError("[]")).toMatch(/object/);
    expect(expectError("null")).toMatch(/object/);
  });

  it("rejects a missing required field with a readable path", () => {
    const doc = mutableA();
    delete doc.global_ms;
    expect(expectError(JSON.stringify(doc))).toMatch(/global_ms/);

    const doc2 = mutableA();
    delete doc2.players[1].turns_truncated;
    expect(expectError(JSON.stringify(doc2))).toMatch(/players\[1\]\.turns_truncated/);
  });

  it.each([
    ["non-integer duration", (d: any) => (d.players[0].turns_ms[0] = 1.5), /players\[0\]\.turns_ms\[0\]/],
    ["negative duration", (d: any) => (d.global_ms = -1), /global_ms/],
    ["seat out of range", (d: any) => (d.players[0].seat = 5), /players\[0\]\.seat/],
    ["empty players", (d: any) => (d.players = []), /players/],
    ["too many players", (d: any) => d.players.push(...d.players), /players/],
    ["empty turns_ms", (d: any) => (d.players[0].turns_ms = []), /turns_ms/],
    ["too many turns", (d: any) => (d.players[0].turns_ms = Array(129).fill(0)), /turns_ms/],
    ["bad app_version", (d: any) => (d.device.app_version = "1"), /device\.app_version/],
    ["wrong device.app", (d: any) => (d.device.app = "otherapp"), /device\.app/],
    ["turn_limit_ms of 0", (d: any) => (d.turn_limit_ms = 0), /turn_limit_ms/],
    ["empty nickname", (d: any) => (d.players[0].nickname = ""), /nickname/],
    ["empty game_id", (d: any) => (d.game_id = ""), /game_id/],
    ["numeric ended_at", (d: any) => (d.ended_at = 0), /ended_at/],
  ])("rejects %s", (_name, mutate, pattern) => {
    const doc = mutableA();
    mutate(doc);
    const err = expectError(JSON.stringify(doc));
    expect(err).toMatch(pattern);
    expect(err).toMatch(/^invalid game result: /);
  });

  it("warns, not rejects, on a broken per-player invariant", () => {
    const doc = mutableA();
    doc.players[1].turns_ms = [88000, 120000, 134001];
    const out = parseGameResult(JSON.stringify(doc));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain("seat 2");
    expect(out.warnings[0]).toContain("Alex");
    expect(out.warnings[0]).toContain("342000");
    expect(out.warnings[0]).toContain("342001");
  });

  it("warns, not rejects, on a broken global invariant", () => {
    const doc = mutableA();
    doc.global_ms = 1;
    const out = parseGameResult(JSON.stringify(doc));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toContain("global_ms 1");
    expect(out.warnings[0]).toContain("666000");
  });

  it("ignores and strips unknown fields at every level", () => {
    const doc = mutableA();
    doc.future_field = { anything: true };
    doc.device.serial = "X1";
    doc.players[0].color = "orange";
    const out = parseGameResult(JSON.stringify(doc));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.warnings).toEqual([]);
    expect(out.result).not.toHaveProperty("future_field");
    expect(out.result.device).not.toHaveProperty("serial");
    expect(out.result.players[0]).not.toHaveProperty("color");
    expect(out.result).toEqual(JSON.parse(fixtureA));
  });

  it("accepts unknown nickname and faction as-is", () => {
    const doc = mutableA();
    doc.players[0].nickname = "Zoë";
    doc.players[0].faction = "some_future_faction";
    const out = parseGameResult(JSON.stringify(doc));
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    expect(out.warnings).toEqual([]);
    expect(out.result.players[0].nickname).toBe("Zoë");
    expect(out.result.players[0].faction).toBe("some_future_faction");
  });
});

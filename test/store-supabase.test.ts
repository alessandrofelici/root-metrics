// Integration test for SupabaseResultStore against a real Supabase (local stack or a project)
// with supabase/migrations applied. Skipped unless SUPABASE_TEST_URL and SUPABASE_TEST_KEY
// (the secret / service_role key) are set, e.g. for the local stack:
//   supabase start -x gotrue,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,studio,postgres-meta,mailpit,supabase-pooler
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_KEY=<service_role key> npm test
// Uses fresh random game ids, so it never touches rows it did not write.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SupabaseResultStore } from "../src/store-supabase.js";
import type { GameResult } from "../src/types.js";

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_KEY;
const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");

function fixture(name: string, id: string): GameResult {
  const r = JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8")) as GameResult;
  return { ...r, game_id: id };
}
const freshId = () => randomBytes(8).toString("hex");

describe.skipIf(!URL || !KEY)("SupabaseResultStore (live)", () => {
  const store = () => new SupabaseResultStore(URL!, KEY!);

  it("saves once, then reports duplicates and keeps the first copy", async () => {
    const s = store();
    const id = freshId();
    expect(await s.save(fixture("fixture-a.json", id), ["first"])).toBe(true);
    const before = await s.get(id);
    expect(before?.result.game_id).toBe(id);
    expect(before?.warnings).toEqual(["first"]);
    expect(before?.saved_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const changed = { ...fixture("fixture-a.json", id), global_ms: 1 };
    expect(await s.save(changed, ["second"])).toBe(false);
    expect(await s.get(id)).toEqual(before);
  });

  it("round-trips the result exactly and lists newest first", async () => {
    const s = store();
    const a = fixture("fixture-a.json", freshId());
    const b = fixture("fixture-b.json", freshId());
    await s.save(a);
    await s.save(b);
    expect((await s.get(a.game_id))?.result).toEqual(a);
    const ids = (await s.list()).map((x) => x.result.game_id).filter((x) => x === a.game_id || x === b.game_id);
    expect(ids).toEqual([b.game_id, a.game_id]);
  });

  it("returns undefined for an unknown id", async () => {
    expect(await store().get(freshId())).toBeUndefined();
  });

  it("serves POST /api/results and the pages from Supabase", async () => {
    const s = store();
    const app = createApp(s, { ingestToken: "t" });
    const r = fixture("fixture-b.json", freshId());
    const post = () =>
      app.request("/api/results", {
        method: "POST",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify(r),
      });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200);
    expect(await (await app.request(`/games/${r.game_id}`)).text()).toContain("Seat 4");
  });
});

describe.skipIf(!URL)("Supabase anon access (live)", () => {
  it("cannot read or write results with the anon key (RLS, no policies)", async () => {
    const anon = process.env.SUPABASE_TEST_ANON_KEY;
    if (!anon) return;
    const s = new SupabaseResultStore(URL!, anon);
    await expect(s.save(fixture("fixture-a.json", freshId()))).rejects.toThrow();
    await expect(s.list()).rejects.toThrow();
  });
});

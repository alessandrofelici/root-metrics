import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_BODY_BYTES } from "../src/api.js";
import { createApp } from "../src/app.js";
import { SqliteResultStore } from "../src/store.js";

const FIXTURES = path.resolve(import.meta.dirname, "../fixtures");
const DEVICE_FIXTURE = path.resolve(import.meta.dirname, "fixtures/device-4p.json");
const TOKEN = "test-token-0123456789";

let tmpDir: string;
let store: SqliteResultStore;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "root-metrics-api-"));
  store = new SqliteResultStore(path.join(tmpDir, "test.db"));
});

afterEach(async () => {
  await store.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** token null: the server has no INGEST_TOKEN configured. */
function post(body: string, headers: Record<string, string> = {}, token: string | null = TOKEN) {
  return createApp(store, { ingestToken: token ?? undefined }).request("/api/results", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

const auth = { Authorization: `Bearer ${TOKEN}` };
const fixtureA = () => fs.readFileSync(path.join(FIXTURES, "fixture-a.json"), "utf8");

describe("POST /api/results", () => {
  it("stores a new result: 201 stored, then it shows on the pages", async () => {
    const res = await post(fixtureA(), auth);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "stored", game_id: "7f3a9c21e04b5d18", warnings: [] });
    expect((await store.list()).map((s) => s.result.game_id)).toEqual(["7f3a9c21e04b5d18"]);
    const page = await createApp(store).request("/");
    expect(await page.text()).toContain('href="/games/7f3a9c21e04b5d18"');
  });

  it("answers a repeat with 200 duplicate and keeps the first copy (at-least-once delivery)", async () => {
    expect((await post(fixtureA(), auth)).status).toBe(201);
    const again = await post(fixtureA(), auth);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "duplicate", game_id: "7f3a9c21e04b5d18" });
    expect(await store.list()).toHaveLength(1);
  });

  it("accepts the compact line a real board printed", async () => {
    const res = await post(fs.readFileSync(DEVICE_FIXTURE, "utf8").trim(), auth);
    expect(res.status).toBe(201);
  });

  it("stores a result whose sums disagree, with the warning (warn, not reject)", async () => {
    const r = JSON.parse(fixtureA());
    r.global_ms += 1;
    const res = await post(JSON.stringify(r), auth);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.warnings).toHaveLength(1);
    expect((await store.get(r.game_id))?.warnings).toEqual(body.warnings);
  });

  it("rejects an invalid result with 400 and the parser's message", async () => {
    const r = JSON.parse(fixtureA());
    r.schema_version = 2;
    const res = await post(JSON.stringify(r), auth);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("unsupported schema_version 2");
    expect((await post("{not json", auth)).status).toBe(400);
    expect(await store.list()).toHaveLength(0);
  });

  it("needs the token: 401 when missing or wrong, nothing stored", async () => {
    expect((await post(fixtureA(), {})).status).toBe(401);
    expect((await post(fixtureA(), { Authorization: "Bearer nope" })).status).toBe(401);
    expect((await post(fixtureA(), { Authorization: TOKEN })).status).toBe(401);
    expect(await store.list()).toHaveLength(0);
  });

  it("accepts the scheme in any case", async () => {
    expect((await post(fixtureA(), { Authorization: `bearer ${TOKEN}` })).status).toBe(201);
  });

  it("is off (503) when the server has no token configured", async () => {
    const res = await post(fixtureA(), auth, null);
    expect(res.status).toBe(503);
    expect(await store.list()).toHaveLength(0);
  });

  it("refuses bodies over the limit with 413", async () => {
    const res = await post(" ".repeat(MAX_BODY_BYTES + 1), auth);
    expect(res.status).toBe(413);
  });
});

describe("GET /api/health", () => {
  it("reports whether ingest is on", async () => {
    const on = await createApp(store, { ingestToken: TOKEN }).request("/api/health");
    expect(await on.json()).toEqual({ ok: true, ingest: true });
    const off = await createApp(store).request("/api/health");
    expect(await off.json()).toEqual({ ok: true, ingest: false });
  });
});

// JSON API for the device: POST /api/results stores one contract-v1 result. The rootclock
// firmware sends it from the Bottlenose ESP32-C6 (hardware-playground, documents/04 Hop 3).
//
//   POST /api/results   Authorization: Bearer <INGEST_TOKEN>, body = one result, compact JSON
//     201 {"status":"stored","game_id":...,"warnings":[...]}     new
//     200 {"status":"duplicate","game_id":...,"warnings":[...]}  already stored: also success
//     400 {"error":"<parser message>"}   invalid; the device does not retry
//     401 {"error":"..."}                missing or wrong token; the device does not retry
//     413 {"error":"..."}                body over MAX_BODY_BYTES
//     503 {"error":"..."}                INGEST_TOKEN not configured; ingest is off
//     5xx otherwise                      the device keeps it and retries
//   GET /api/health     {"ok":true,"ingest":<bool>}  no auth; for setup checks
import { createHash, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseGameResult } from "./parse.js";
import type { ResultStore } from "./types.js";

/** The worst-case v1 result (4 players x 128 turns) is about 4.7 KB; this leaves headroom. */
export const MAX_BODY_BYTES = 64 * 1024;

function sameSecret(given: string, expected: string): boolean {
  // Hash both so the comparison is constant-time whatever the lengths.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearer(header: string | undefined): string | undefined {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return m ? m[1]!.trim() : undefined;
}

export function mountApi(app: Hono, store: ResultStore, opts: { ingestToken?: string }): void {
  app.get("/api/health", (c) => c.json({ ok: true, ingest: Boolean(opts.ingestToken) }));

  app.post(
    "/api/results",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: `body over ${MAX_BODY_BYTES} bytes` }, 413),
    }),
    async (c) => {
      if (!opts.ingestToken) {
        return c.json({ error: "ingest is off: INGEST_TOKEN is not set on the server" }, 503);
      }
      const token = bearer(c.req.header("Authorization"));
      if (!token || !sameSecret(token, opts.ingestToken)) {
        return c.json({ error: "missing or wrong token (Authorization: Bearer <token>)" }, 401);
      }

      const outcome = parseGameResult(await c.req.text());
      if (!outcome.ok) return c.json({ error: outcome.error }, 400);

      const { result, warnings } = outcome;
      for (const w of warnings) console.warn(`api: ${result.game_id}: warning: ${w}`);
      const inserted = await store.save(result, warnings);
      return c.json(
        { status: inserted ? "stored" : "duplicate", game_id: result.game_id, warnings },
        inserted ? 201 : 200,
      );
    },
  );
}

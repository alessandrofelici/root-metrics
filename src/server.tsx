// Entrypoint for the Node server (local / Docker): open the store, import bundled fixtures when
// it is the local SQLite file (idempotent), serve the pages and the API.
// The Vercel deployment does not use this file: see api/index.ts.
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { FIXTURES_DIR, INGEST_TOKEN, PORT } from "./config.js";
import { FixtureResultSource, ingest } from "./source.js";
import { openStoreFromEnv } from "./store-env.js";

const { store, kind, where } = await openStoreFromEnv();

// Example games only go into a local database, never into a shared Supabase one, unless asked.
const importFixtures = (process.env.IMPORT_FIXTURES ?? (kind === "sqlite" ? "1" : "0")) === "1";
if (importFixtures) {
  const summary = await ingest(new FixtureResultSource(FIXTURES_DIR), store);
  console.log(
    `fixtures from ${FIXTURES_DIR}: ${summary.inserted} inserted, ${summary.duplicates} already present`,
  );
}
if (!INGEST_TOKEN) console.warn("INGEST_TOKEN is not set: POST /api/results answers 503");

const server = serve(
  { fetch: createApp(store, { ingestToken: INGEST_TOKEN }).fetch, port: PORT, hostname: "0.0.0.0" },
  (info) => console.log(`root-metrics listening on http://0.0.0.0:${info.port} (${kind}: ${where})`),
);

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void store.close().then(() => {
      console.log("shutdown complete");
      process.exit(0);
    });
  });
  // Don't hang on keep-alive connections.
  if ("closeAllConnections" in server) server.closeAllConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

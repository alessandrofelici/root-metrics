// Entrypoint: open the store, import bundled fixtures (idempotent), serve the pages.
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { DATA_DIR, FIXTURES_DIR, PORT } from "./config.js";
import { FixtureResultSource, ingest } from "./source.js";
import { openStore } from "./store.js";

const store = openStore(DATA_DIR);

const summary = await ingest(new FixtureResultSource(FIXTURES_DIR), store);
console.log(
  `fixtures from ${FIXTURES_DIR}: ${summary.inserted} inserted, ${summary.duplicates} already present`,
);

const server = serve(
  { fetch: createApp(store).fetch, port: PORT, hostname: "0.0.0.0" },
  (info) => console.log(`root-metrics listening on http://0.0.0.0:${info.port} (data: ${DATA_DIR})`),
);

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    store.close();
    console.log("shutdown complete");
    process.exit(0);
  });
  // Don't hang on keep-alive connections.
  if ("closeAllConnections" in server) server.closeAllConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

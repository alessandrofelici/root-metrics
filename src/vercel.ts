// The app as one Vercel Function (api/index.ts re-exports these). Results live in Supabase:
// SUPABASE_URL plus SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in the
// project's environment variables, and INGEST_TOKEN for the device. The bundled example games
// are not imported here.
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { createApp } from "./app.js";
import { INGEST_TOKEN } from "./config.js";
import { supabaseFromEnv } from "./store-env.js";

function buildApp(): Hono {
  const store = supabaseFromEnv();
  // Vercel serves public/ itself (vercel.json maps /static/* onto it).
  if (store) return createApp(store, { ingestToken: INGEST_TOKEN, serveStaticFiles: false });
  // Misconfigured: say so on every request instead of failing at import time.
  const app = new Hono();
  app.all("*", (c) =>
    c.text(
      "root-metrics is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY " +
        "(or SUPABASE_SERVICE_ROLE_KEY) in the Vercel project's environment variables.",
      500,
    ),
  );
  return app;
}

const app = buildApp();
const handler = handle(app);
export const GET = handler;
export const POST = handler;
export const HEAD = handler;

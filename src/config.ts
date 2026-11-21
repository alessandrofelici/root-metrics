import path from "node:path";

export const PORT = Number(process.env.PORT ?? 8080);
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
export const FIXTURES_DIR = path.resolve(process.env.FIXTURES_DIR ?? "./fixtures");
export const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR ?? "./public");

/** Shared secret for POST /api/results. Unset or empty: the endpoint answers 503. */
export const INGEST_TOKEN = process.env.INGEST_TOKEN || undefined;

/** Supabase: when both are set, results live in its Postgres instead of the SQLite file.
 *  The key is server-side only: the secret key (sb_secret_...) or the legacy service_role JWT. */
export const SUPABASE_URL = process.env.SUPABASE_URL || undefined;
export const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;

import path from "node:path";
import { isValidTimeZone } from "./format.js";

export const PORT = Number(process.env.PORT ?? 8080);
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
export const FIXTURES_DIR = path.resolve(process.env.FIXTURES_DIR ?? "./fixtures");
export const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR ?? "./public");

/** Shared secret for POST /api/results. Unset or empty: the endpoint answers 503. */
export const INGEST_TOKEN = process.env.INGEST_TOKEN || undefined;

/** IANA time zone for the dates on the pages. Unset: the server's own zone, which is UTC on
 *  Vercel and in the Docker image. An unknown name falls back to UTC with a warning. */
export const DISPLAY_TIME_ZONE = resolveTimeZone(process.env.DISPLAY_TIME_ZONE);

function resolveTimeZone(tz: string | undefined): string {
  if (!tz) return Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (isValidTimeZone(tz)) return tz;
  console.warn(`DISPLAY_TIME_ZONE "${tz}" is not a known time zone; using UTC`);
  return "UTC";
}

/** Supabase: when both are set, results live in its Postgres instead of the SQLite file.
 *  The key is server-side only: the secret key (sb_secret_...) or the legacy service_role JWT. */
export const SUPABASE_URL = process.env.SUPABASE_URL || undefined;
export const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;

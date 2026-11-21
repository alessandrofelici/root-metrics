// Supabase-backed ResultStore: the `results` table from supabase/migrations, reached through
// Supabase's REST API with a server-side key. Used when SUPABASE_URL and a key are set (the
// Vercel deployment); the local Docker setup keeps the SQLite file (store.ts).
//
// Same behaviour as SqliteResultStore: de-duplicates by game_id (the primary key; a second
// insert fails with 23505 and save() resolves false), saved_at is set by the database, and
// list() is newest first with the identity column `seq` as the tie-breaker.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GameResult, ResultStore, StoredResult } from "./types.js";

const TABLE = "results";
const UNIQUE_VIOLATION = "23505";

interface Row {
  saved_at: string;
  warnings: string[];
  result: GameResult;
}

function toStored(row: Row): StoredResult {
  return {
    result: row.result,
    warnings: row.warnings ?? [],
    // Postgres gives "2026-11-21 03:00:00.123456+00"; the interface promises ISO 8601 UTC.
    saved_at: new Date(row.saved_at).toISOString(),
  };
}

export class SupabaseResultStore implements ResultStore {
  private readonly db: SupabaseClient;

  constructor(url: string, key: string, client?: SupabaseClient) {
    this.db =
      client ??
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
  }

  async save(r: GameResult, warnings: string[] = []): Promise<boolean> {
    const { error } = await this.db.from(TABLE).insert({ game_id: r.game_id, warnings, result: r });
    if (!error) return true;
    if (error.code === UNIQUE_VIOLATION) return false;
    throw new Error(`supabase insert failed: ${error.message}`);
  }

  async list(): Promise<StoredResult[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select("saved_at, warnings, result")
      .order("saved_at", { ascending: false })
      .order("seq", { ascending: false });
    if (error) throw new Error(`supabase list failed: ${error.message}`);
    return (data as Row[]).map(toStored);
  }

  async get(gameId: string): Promise<StoredResult | undefined> {
    const { data, error } = await this.db
      .from(TABLE)
      .select("saved_at, warnings, result")
      .eq("game_id", gameId)
      .maybeSingle();
    if (error) throw new Error(`supabase get failed: ${error.message}`);
    return data ? toStored(data as Row) : undefined;
  }

  async close(): Promise<void> {
    // HTTP client: nothing to close.
  }
}

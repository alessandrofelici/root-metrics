import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { GameResult, ResultStore, StoredResult } from "./types.js";

interface Row {
  saved_at: string;
  warnings_json: string;
  result_json: string;
}

function toStored(row: Row): StoredResult {
  return {
    result: JSON.parse(row.result_json) as GameResult,
    warnings: JSON.parse(row.warnings_json) as string[],
    saved_at: row.saved_at,
  };
}

/** SQLite-backed ResultStore: one `results` table keyed by game_id, results stored as JSON. */
export class SqliteResultStore implements ResultStore {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement<[string, string, string, string]>;
  private readonly listStmt: Database.Statement<[], Row>;
  private readonly getStmt: Database.Statement<[string], Row>;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        game_id       TEXT PRIMARY KEY,
        saved_at      TEXT NOT NULL,
        seq           INTEGER NOT NULL,
        warnings_json TEXT NOT NULL,
        result_json   TEXT NOT NULL
      )
    `);
    // seq is a monotonic insert counter, used as a tiebreaker when saved_at collides.
    this.insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO results (game_id, saved_at, seq, warnings_json, result_json)
      SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ? FROM results
    `);
    this.listStmt = this.db.prepare(
      "SELECT saved_at, warnings_json, result_json FROM results ORDER BY saved_at DESC, seq DESC",
    );
    this.getStmt = this.db.prepare(
      "SELECT saved_at, warnings_json, result_json FROM results WHERE game_id = ?",
    );
  }

  async save(r: GameResult, warnings: string[] = []): Promise<boolean> {
    const info = this.insertStmt.run(
      r.game_id,
      new Date().toISOString(),
      JSON.stringify(warnings),
      JSON.stringify(r),
    );
    return info.changes > 0;
  }

  async list(): Promise<StoredResult[]> {
    return this.listStmt.all().map(toStored);
  }

  async get(gameId: string): Promise<StoredResult | undefined> {
    const row = this.getStmt.get(gameId);
    return row ? toStored(row) : undefined;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/** Opens (creating if needed) the store at `<dataDir>/rootclock.db`. */
export function openStore(dataDir: string): SqliteResultStore {
  return new SqliteResultStore(path.join(dataDir, "rootclock.db"));
}

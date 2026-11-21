// Shared contract-v1 types. Owned by the orchestrator: agents import these, do not redefine them.
// Mirrors specs.md → "Contract v1" exactly. No v2 fields.

export interface Device {
  app: "rootclock";
  app_version: string; // ^[0-9]{3}$
}

export interface Player {
  seat: number; // 1..4
  nickname: string; // open string
  faction: string; // open string; see factions table
  total_ms: number;
  turns_ms: number[]; // 1..128 items, oldest first
  turns_truncated: boolean;
}

export interface GameResult {
  schema: "rootclock.game_result";
  schema_version: 1;
  game_id: string;
  device: Device;
  ended_at: string | null; // ISO 8601 local, no offset
  turn_limit_ms: number | null;
  global_ms: number;
  players: Player[]; // 1..4
}

export type ParseOutcome =
  | { ok: true; result: GameResult; warnings: string[] }
  | { ok: false; error: string };

/** A result as held by the store: the parsed result plus the parser warnings and save time. */
export interface StoredResult {
  result: GameResult;
  warnings: string[];
  saved_at: string; // ISO 8601 UTC, set by the store
}

/** Async so a networked database (Supabase) and the local SQLite file share one interface. */
export interface ResultStore {
  /** Idempotent: de-duplicates by game_id. Resolves true if newly inserted. */
  save(r: GameResult, warnings?: string[]): Promise<boolean>;
  /** Newest first (by saved_at). */
  list(): Promise<StoredResult[]>;
  get(gameId: string): Promise<StoredResult | undefined>;
  close(): Promise<void>;
}

export interface ResultSource {
  /** Emits each parsed result a source receives. FixtureResultSource reads bundled files; the
   *  device's results arrive over HTTP instead (POST /api/results, see src/api.ts). */
  results(): AsyncIterable<{ result: GameResult; warnings: string[] }>;
}

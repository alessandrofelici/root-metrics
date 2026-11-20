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

export interface ResultStore {
  /** Idempotent: de-duplicates by game_id. Returns true if newly inserted. */
  save(r: GameResult, warnings?: string[]): boolean;
  /** Newest first (by saved_at). */
  list(): StoredResult[];
  get(gameId: string): StoredResult | undefined;
  close(): void;
}

export interface ResultSource {
  /** Emits each parsed result a source receives. Only FixtureResultSource exists in the MVP. */
  results(): AsyncIterable<{ result: GameResult; warnings: string[] }>;
}

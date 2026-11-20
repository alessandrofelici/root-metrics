// Contract v1 parser and validator. See specs.md → "Contract v1".
import { z } from "zod";
import type { GameResult, ParseOutcome } from "./types.js";

const EXPECTED_SCHEMA = "rootclock.game_result";
const EXPECTED_VERSION = 1;

// Mirrors the v1 JSON Schema. Default zod objects strip unknown keys.
const DeviceSchema = z.object({
  app: z.literal("rootclock"),
  app_version: z.string().regex(/^[0-9]{3}$/, "must be exactly 3 digits"),
});

const PlayerSchema = z.object({
  seat: z.int().min(1).max(4),
  nickname: z.string().min(1),
  faction: z.string().min(1),
  total_ms: z.int().min(0),
  turns_ms: z.array(z.int().min(0)).min(1).max(128),
  turns_truncated: z.boolean(),
});

const GameResultSchema = z.object({
  schema: z.literal(EXPECTED_SCHEMA),
  schema_version: z.literal(EXPECTED_VERSION),
  game_id: z.string().min(1).max(32),
  device: DeviceSchema,
  ended_at: z.string().nullable(),
  turn_limit_ms: z.int().min(1).nullable(),
  global_ms: z.int().min(0),
  players: z.array(PlayerSchema).min(1).max(4),
});

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const seg of path) {
    if (typeof seg === "number") out += `[${seg}]`;
    else out += out === "" ? String(seg) : `.${String(seg)}`;
  }
  return out === "" ? "(root)" : out;
}

function formatIssues(error: z.ZodError): string {
  const lines = error.issues.map((i) => `${formatPath(i.path)}: ${i.message}`);
  return `invalid game result: ${lines.join("; ")}`;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function checkInvariants(r: GameResult): string[] {
  const warnings: string[] = [];
  for (const p of r.players) {
    const turns = sum(p.turns_ms);
    if (p.total_ms !== turns) {
      warnings.push(
        `seat ${p.seat} (${p.nickname}): total_ms ${p.total_ms} does not equal sum of turns_ms ${turns}`,
      );
    }
  }
  const totals = sum(r.players.map((p) => p.total_ms));
  if (r.global_ms !== totals) {
    warnings.push(`global_ms ${r.global_ms} does not equal sum of players' total_ms ${totals}`);
  }
  return warnings;
}

/** Parse and validate a contract-v1 game result. Never throws. */
export function parseGameResult(json: string): ParseOutcome {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "invalid game result: expected a JSON object at the top level" };
  }

  // Identify the document before full validation so the error is specific.
  const obj = data as Record<string, unknown>;
  if (!("schema" in obj)) {
    return { ok: false, error: `missing "schema" (expected "${EXPECTED_SCHEMA}")` };
  }
  if (obj.schema !== EXPECTED_SCHEMA) {
    return {
      ok: false,
      error: `unsupported schema ${JSON.stringify(obj.schema)} (expected "${EXPECTED_SCHEMA}")`,
    };
  }
  if (!("schema_version" in obj)) {
    return { ok: false, error: `missing "schema_version" (expected ${EXPECTED_VERSION})` };
  }
  if (obj.schema_version !== EXPECTED_VERSION) {
    return {
      ok: false,
      error: `unsupported schema_version ${JSON.stringify(obj.schema_version)} (expected ${EXPECTED_VERSION})`,
    };
  }

  const parsed = GameResultSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: formatIssues(parsed.error) };

  const result: GameResult = parsed.data;
  return { ok: true, result, warnings: checkInvariants(result) };
}

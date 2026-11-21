// FixtureResultSource (bundled JSON files) plus the source → store pipe. Results from the
// device arrive over HTTP instead: POST /api/results in src/api.ts.
import fs from "node:fs/promises";
import path from "node:path";
import { parseGameResult } from "./parse.js";
import type { GameResult, ResultSource, ResultStore } from "./types.js";

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Reads every `*.json` file directly inside `dir` (non-recursive, sorted by filename),
 * runs it through `parseGameResult` and yields the accepted results with their warnings.
 * Rejected or unreadable files are logged and skipped; this never throws.
 */
export class FixtureResultSource implements ResultSource {
  constructor(
    private readonly dir: string,
    private readonly logger: Pick<Console, "warn"> = console,
  ) {}

  async *results(): AsyncIterable<{ result: GameResult; warnings: string[] }> {
    let names: string[];
    try {
      const entries = await fs.readdir(this.dir, { withFileTypes: true });
      names = entries
        .filter((e) => e.name.endsWith(".json") && (e.isFile() || e.isSymbolicLink()))
        .map((e) => e.name)
        .sort();
    } catch (e) {
      this.logger.warn(`fixture source: cannot read directory ${this.dir}: ${errorMessage(e)}`);
      return;
    }

    for (const name of names) {
      let text: string;
      try {
        text = await fs.readFile(path.join(this.dir, name), "utf8");
      } catch (e) {
        this.logger.warn(`fixture source: skipping ${name}: cannot read file: ${errorMessage(e)}`);
        continue;
      }

      const outcome = parseGameResult(text);
      if (!outcome.ok) {
        this.logger.warn(`fixture source: skipping ${name}: ${outcome.error}`);
        continue;
      }
      for (const w of outcome.warnings) {
        this.logger.warn(`fixture source: ${name}: warning: ${w}`);
      }
      yield { result: outcome.result, warnings: outcome.warnings };
    }
  }
}

export interface IngestSummary {
  inserted: number;
  duplicates: number;
}

/** Pipes every result from `source` into `store`. De-duplication makes re-ingest harmless. */
export async function ingest(source: ResultSource, store: ResultStore): Promise<IngestSummary> {
  const summary: IngestSummary = { inserted: 0, duplicates: 0 };
  for await (const { result, warnings } of source.results()) {
    if (await store.save(result, warnings)) summary.inserted++;
    else summary.duplicates++;
  }
  return summary;
}

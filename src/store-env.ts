// Picks the ResultStore from the environment: Supabase when SUPABASE_URL and a server key are
// set, otherwise the SQLite file in DATA_DIR. SQLite is imported lazily so a deployment that
// uses Supabase (Vercel) never loads the native better-sqlite3 module.
import { DATA_DIR, SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { SupabaseResultStore } from "./store-supabase.js";
import type { ResultStore } from "./types.js";

export interface OpenedStore {
  store: ResultStore;
  kind: "supabase" | "sqlite";
  where: string;
}

export function supabaseFromEnv(): SupabaseResultStore | undefined {
  if (SUPABASE_URL && SUPABASE_KEY) return new SupabaseResultStore(SUPABASE_URL, SUPABASE_KEY);
  return undefined;
}

export async function openStoreFromEnv(): Promise<OpenedStore> {
  const supabase = supabaseFromEnv();
  if (supabase) return { store: supabase, kind: "supabase", where: SUPABASE_URL! };
  const { openStore } = await import("./store.js");
  return { store: openStore(DATA_DIR), kind: "sqlite", where: DATA_DIR };
}

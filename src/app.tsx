// Server-rendered placeholder pages (game list + game detail) fed from a ResultStore.
// Placeholder UI only: faction icons and one average are the only extras; no charts or client JS. All data goes through JSX text
// interpolation, which Hono escapes; never render stored strings with raw().
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { html } from "hono/html";
import { serveStatic } from "@hono/node-server/serve-static";
import { PUBLIC_DIR } from "./config.js";
import { factionIconUrl, factionName } from "./factions.js";
import { mountApi } from "./api.js";
import { averagePerPlayerMs, formatDuration } from "./format.js";
import type { GameResult, Player, ResultStore, StoredResult } from "./types.js";

// Constant CSS rendered as escaped text: keep it free of quotes, `<`, `>` and `&`.
const STYLE = `
body { font-family: system-ui, -apple-system, Roboto, sans-serif; line-height: 1.4;
  max-width: 40rem; margin: 0 auto; padding: 0 1rem 2rem; }
ul.games { list-style: none; padding: 0; }
ul.games li { padding: 0.5rem 0; border-bottom: 1px solid #ccc; }
section.player { border-top: 1px solid #ccc; padding-top: 0.5rem; margin-top: 1rem; }
.warnings { border: 1px solid #c90; padding: 0.5rem 1rem; }
img.icon { height: 1.5rem; width: auto; vertical-align: middle; margin-right: 0.25rem; }
li.over { font-weight: bold; color: #b00; }
img.icon-lg { height: 3rem; width: auto; vertical-align: middle; margin-right: 0.5rem; }
`;

function page(title: string, body: Child) {
  return html`<!doctype html>${(
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style>{STYLE}</style>
      </head>
      <body>{body}</body>
    </html>
  )}`;
}

function endedAt(r: GameResult): string {
  return r.ended_at ?? "date unknown";
}

function average(r: GameResult): string {
  return formatDuration(averagePerPlayerMs(r.global_ms, r.players.length));
}

function FactionIcon({ faction, large = false }: { faction: string; large?: boolean }) {
  const src = factionIconUrl(faction);
  if (!src) return null;
  const name = factionName(faction);
  return <img class={large ? "icon-lg" : "icon"} src={src} alt={large ? "" : name} title={name} />;
}

function gameHref(gameId: string): string {
  return `/games/${encodeURIComponent(gameId)}`;
}

function GameList({ games }: { games: StoredResult[] }) {
  return (
    <>
      <h1>Games</h1>
      {games.length === 0 ? (
        <p>No games yet.</p>
      ) : (
        <ul class="games">
          {games.map(({ result: r }) => (
            <li>
              <a href={gameHref(r.game_id)}>
                {endedAt(r)} · {r.players.length} {r.players.length === 1 ? "player" : "players"} ·{" "}
                {formatDuration(r.global_ms)} · avg {average(r)} per player
              </a>
              <br />
              {r.players.map((p) => (
                <FactionIcon faction={p.faction} />
              ))}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Turns over the limit. The last turn of a truncated player sums several real turns, so it is
 *  never flagged. */
function isOverLimit(p: Player, i: number, limitMs: number | null): boolean {
  if (limitMs === null) return false;
  if (p.turns_truncated && i === p.turns_ms.length - 1) return false;
  return p.turns_ms[i]! > limitMs;
}

function PlayerBlock({ player: p, limitMs }: { player: Player; limitMs: number | null }) {
  const over = p.turns_ms.filter((_, i) => isOverLimit(p, i, limitMs)).length;
  return (
    <section class="player">
      <h2>
        Seat {p.seat}: {p.nickname}
      </h2>
      <p>
        <FactionIcon faction={p.faction} large />
        Faction: {factionName(p.faction)}
        <br />
        Total time: {formatDuration(p.total_ms)}
      </p>
      <p>
        Turn times
        {limitMs !== null ? ` (limit ${formatDuration(limitMs)}, ${over} over)` : ""}:
      </p>
      <ol>
        {p.turns_ms.map((t, i) =>
          isOverLimit(p, i, limitMs) ? (
            <li class="over">{formatDuration(t)} (over limit)</li>
          ) : (
            <li>{formatDuration(t)}</li>
          ),
        )}
      </ol>
      {p.turns_truncated ? <p>Note: last turn includes extra turns beyond 128.</p> : null}
    </section>
  );
}

function GameDetail({ stored }: { stored: StoredResult }) {
  const r = stored.result;
  return (
    <>
      <p>
        <a href="/">← All games</a>
      </p>
      <h1>Game {r.game_id}</h1>
      <p>
        Ended: {endedAt(r)}
        <br />
        Global time: {formatDuration(r.global_ms)}
        <br />
        Average per player: {average(r)}
        <br />
        Turn limit: {r.turn_limit_ms === null ? "no turn limit" : formatDuration(r.turn_limit_ms)}
      </p>
      {stored.warnings.length > 0 ? (
        <div class="warnings">
          <p>Warnings:</p>
          <ul>
            {stored.warnings.map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.players.map((p) => (
        <PlayerBlock player={p} limitMs={r.turn_limit_ms} />
      ))}
    </>
  );
}

function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p>
        <a href="/">← All games</a>
      </p>
    </>
  );
}

export interface AppOptions {
  publicDir?: string;
  /** Serve public/ under /static/ (default). Off on Vercel, whose CDN serves those files. */
  serveStaticFiles?: boolean;
  /** Shared secret the device sends as `Authorization: Bearer <token>`. Unset: ingest is off. */
  ingestToken?: string;
}

/** Builds the web app over `store`. No side effects; the caller serves it. */
export function createApp(store: ResultStore, opts: AppOptions = {}): Hono {
  const app = new Hono();

  // Bundled static assets (faction icons) from public/, served under /static/.
  if (opts.serveStaticFiles ?? true) {
    app.use(
      "/static/*",
      serveStatic({
        root: opts.publicDir ?? PUBLIC_DIR,
        rewriteRequestPath: (p) => p.replace(/^\/static/, ""),
        onFound: (_p, c) => c.header("Cache-Control", "public, max-age=86400"),
      }),
    );
  }

  mountApi(app, store, { ingestToken: opts.ingestToken });

  app.get("/", async (c) => c.html(page("Games", <GameList games={await store.list()} />)));

  app.get("/games/:gameId", async (c) => {
    const stored = await store.get(c.req.param("gameId"));
    if (!stored) return c.html(page("Game not found", <NotFound />), 404);
    return c.html(page(`Game ${stored.result.game_id}`, <GameDetail stored={stored} />));
  });

  app.notFound((c) => c.html(page("Not found", <NotFound />), 404));

  return app;
}

// The web app: server-rendered pages (see src/views) over a ResultStore, plus the device API.
// Every page loads the results once, derives a Snapshot (src/derive.ts) and renders it.
import { Hono, type Context } from "hono";
import type { Child } from "hono/jsx";
import { serveStatic } from "@hono/node-server/serve-static";
import { DISPLAY_TIME_ZONE, PUBLIC_DIR } from "./config.js";
import { mountApi } from "./api.js";
import { buildSnapshot, playerKey, type Snapshot } from "./derive.js";
import { factionName } from "./factions.js";
import { dayLabel, localTime } from "./format.js";
import { factionStats, playerStats, statGames } from "./stats.js";
import type { ResultStore } from "./types.js";
import {
  DayPage, FactionPage, FactionsPage, GamePage, GamesStatsPage, HomePage, NotFoundPage, PlayerPage, PlayersPage, StatsPage,
} from "./views/pages.js";
import { CalendarMonth, gameHref, page } from "./views/ui.js";
import { VisualSwitchesPage } from "./views/demo.js";

export interface AppOptions {
  publicDir?: string;
  /** Serve public/ under /static/ (default). Off on Vercel, whose CDN serves those files. */
  serveStaticFiles?: boolean;
  /** Shared secret the device sends as `Authorization: Bearer <token>`. Unset: ingest is off. */
  ingestToken?: string;
  /** IANA time zone for dates on the pages (default DISPLAY_TIME_ZONE). */
  timeZone?: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Builds the web app over `store`. No side effects; the caller serves it. */
export function createApp(store: ResultStore, opts: AppOptions = {}): Hono {
  const app = new Hono();
  const timeZone = opts.timeZone ?? DISPLAY_TIME_ZONE;

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

  // Browsers also ask for /favicon.ico directly. Vercel serves public/favicon.ico there itself.
  app.get("/favicon.ico", (c) => c.redirect("/static/favicon.ico", 301));

  mountApi(app, store, { ingestToken: opts.ingestToken });

  const snapshot = async (): Promise<Snapshot> => buildSnapshot(await store.list(), timeZone);
  const today = () => localTime(null, new Date().toISOString(), timeZone).day;
  const notFound = (c: Context) => c.html(page("Not found · Root Metrics", <NotFoundPage />), 404);
  const show = (c: Context, title: string, body: Child, slide?: "prev" | "next") => c.html(page(`${title} · Root Metrics`, body, { slide }));

  app.get("/", async (c) => {
    const snap = await snapshot();
    const q = c.req.query("month");
    const month = q && MONTH_RE.test(q) ? q : (snap.latest?.month ?? today().slice(0, 7));
    const s = c.req.query("slide");
    const slide = s === "prev" || s === "next" ? s : undefined;
    return show(c, "Games", <HomePage snap={snap} month={month} today={today()} />, slide);
  });

  // One month's calendar, for public/app.js to swap in without reloading the page.
  app.get("/fragments/calendar", async (c) => {
    const month = c.req.query("month");
    if (!month || !MONTH_RE.test(month)) return c.text("month must be YYYY-MM", 400);
    const snap = await snapshot();
    c.header("Cache-Control", "no-store");
    return c.html(<CalendarMonth month={month} snap={snap} today={today()} />);
  });

  app.get("/days/:day", async (c) => {
    const day = c.req.param("day");
    if (!DAY_RE.test(day)) return notFound(c);
    const snap = await snapshot();
    const games = snap.byDay.get(day) ?? [];
    if (games.length === 0) return notFound(c);
    if (games.length === 1) return c.redirect(gameHref(games[0]!.id), 302);
    return show(c, dayLabel(day), <DayPage day={day} games={games} />);
  });

  app.get("/games/:gameId", async (c) => {
    const snap = await snapshot();
    const g = snap.byId.get(c.req.param("gameId"));
    if (!g) return notFound(c);
    return show(c, dayLabel(g.day), <GamePage g={g} snap={snap} />);
  });

  app.get("/stats", async (c) => show(c, "Stats", <StatsPage snap={await snapshot()} />));
  app.get("/stats/games", async (c) => show(c, "Games", <GamesStatsPage snap={await snapshot()} />));
  app.get("/stats/players", async (c) => {
    const v = c.req.query("view");
    const view = v === "games" || v === "speed" || v === "wins" ? v : undefined;
    return show(c, "Players", <PlayersPage snap={await snapshot()} view={view} />);
  });
  app.get("/players/:name", async (c) => {
    const snap = await snapshot();
    const all = playerStats(statGames(snap));
    const me = all.find((p) => p.key === playerKey(c.req.param("name")));
    if (!me) return notFound(c);
    return show(c, me.name, <PlayerPage me={me} all={all} snap={snap} />);
  });
  app.get("/stats/factions", async (c) => show(c, "Factions", <FactionsPage snap={await snapshot()} />));
  app.get("/factions/:key", async (c) => {
    const f = factionStats(statGames(await snapshot())).find((x) => x.key === c.req.param("key"));
    if (!f) return notFound(c);
    return show(c, factionName(f.key), <FactionPage f={f} />);
  });

  // DEMO: the visual switches, before and after (docs/visual-switches.md). Linked from nowhere;
  // remove once the review is done.
  app.get("/demo/visuals", async (c) =>
    c.html(page("Visual switches (demo) · Root Metrics", <VisualSwitchesPage snap={await snapshot()} />, { styles: ["/static/demo.css"] })),
  );

  app.notFound((c) => notFound(c));
  return app;
}

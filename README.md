# root-metrics

Companion app for **rootclock**, a turn timer for the board game Root running on a FreeWili OG.

The full brief and data contract (v1) are in [`specs.md`](specs.md).

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (Node 22 LTS) |
| Server + pages | Hono, server-rendered JSX and SVG. One small script, `public/app.js`, changes calendar months in place; every page works without it |
| Styles | One stylesheet, `public/app.css`, with design tokens from Figma (light and dark); fonts Libron and IBM Plex Mono, self-hosted in `public/fonts/` (OFL) |
| Storage | SQLite (`better-sqlite3`), one file: `data/rootclock.db`; or Supabase Postgres when hosted (see [Hosting on Vercel + Supabase](#hosting-on-vercel--supabase)) |
| Validation | zod |
| Tests | Vitest |
| Packaging | Docker Compose, one container, `./data` bind-mounted to `/data`; or one Vercel Function |

It runs two ways, with the same pages and API:

- **Hosted:** Vercel serves the app, Supabase holds the results. The board uploads over HTTPS from anywhere it has Wi-Fi, and anyone with the link can view the games.
- **Local:** Docker on one computer, results in a SQLite file. Phones and laptops on the same network open `http://<host-ip>:8080`.

### Deviations from the brief

`specs.md` describes a native mobile app with no backend. This project deliberately differs:

- **Web app on a host instead of a mobile app.** The app runs in Docker on one computer so its data lives in one place and is easy to back up.
- **Hosted or local server.** There are no user accounts. The pages are public to anyone with the URL; writing needs the device's shared token (`INGEST_TOKEN`). Results live in Supabase when hosted, or in the SQLite file locally.
- **Faction icons.** The brief says "no faction artwork"; this project shows the bundled icons from `public/factions/` (see below).
- **Statistics and a winner.** The brief allows no statistics; this project adds the curated set decided in GitHub #18 and #25 (records, game length, seats, pace, per-player and per-faction speed, win stats). The **winner is the player whose turn the game ended on**, worked out from the turn counts (play goes in seat order from seat 1). If any player passed 128 turns the counts are capped and the winner shows as NULL. Win stats only count games with a known winner. 1-player games are left out of all statistics.
- **Games are dated by when the server received them.** The board sends `ended_at: null` (its clock isn't set), so a game is dated by when it first reached the server, in `DISPLAY_TIME_ZONE`, and belongs to that calendar day. A retried upload keeps the first time. If the board ever sends an `ended_at`, that is used instead, as written. The time of day is shown only on days with two or more games. The board can hold a game while offline, so the date can be later than when the game actually ended.
- **Over-limit turns are marked** when `turn_limit_ms` is set: solid bars are over the limit, outlined bars are within it, with a per-player count. A truncated player's last turn is drawn dashed and never counted, because it combines several real turns.

- **HTTP ingest.** The device posts each result to `POST /api/results` ([Device API](#device-api)). The bundled fixtures still go through `FixtureResultSource`, and only into a local database.

Everything else in the brief applies unchanged: contract v1, parser rules and the "Do not assume or build yet" list.

## Faction icons

`public/factions/<key>.png` holds one icon per faction, named by the faction key from the contract (`marquise.png`, `eyrie.png`, … all 13 keys in `specs.md`). The app serves them at `/static/factions/<key>.png` and shows them:

- on every game card, next to each player;
- on the game page, in the player rows;
- on the Factions and Faction stats pages.

Unknown faction keys get no icon, just the raw key as text. To add or replace an icon, drop a PNG named after the key into `public/factions/`, then rebuild (`docker compose up -d --build`). A test (`test/factions.test.ts`) fails if a known faction key has no icon file.

## Pages

The design lives in Figma (Screens page); decisions are tracked in GitHub #23 and its linked issues.

| Path | Page |
|---|---|
| `/` | Latest game, a calendar of one month (`?month=YYYY-MM`), View stats. Arrows and swipes change the month in place (no reload) and slide in the arrow's direction; without JavaScript they are plain links. |
| `/days/YYYY-MM-DD` | A day with 2+ games; a day with one game redirects to it |
| `/games/<game_id>` | Who used the time, players with turn-by-turn bars (expandable on phones, a table on wide screens), pace. The game ID is never shown. |
| `/stats` | Records, then Games, Players and Factions |
| `/stats/games`, `/stats/players`, `/players/<name>`, `/stats/factions`, `/factions/<key>` | The stats sections |

Raw rows of numbers are not shown in the app; browse them in the Supabase dashboard. Catalogue IDs (C1…C15, W1…W9) stay out of the visible page and appear only in `data-chart` attributes, matching the Figma layer names.

Out of scope for now: live updates and v2 fields. The HTTP ingest endpoint for the board's Wi-Fi upload exists (see below).

Work is tracked in GitHub Issues: the **MVP** milestone, and the redesign under the `frontend` label.

## Device API

The rootclock board uploads each finished game through its ESP32-C6 (hardware-playground, `documents/04`). Anything else that can make an HTTP request can use it too.

```
POST /api/results
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

<one contract-v1 result>
```

| Status | Body | Meaning |
|---|---|---|
| `201` | `{"status":"stored","game_id":"…","warnings":[…]}` | New game stored |
| `200` | `{"status":"duplicate","game_id":"…","warnings":[…]}` | Already stored. Also a success: the device retries until it hears back, so repeats are normal |
| `400` | `{"error":"…"}` | Not a valid contract-v1 result. The device does not retry |
| `401` | `{"error":"…"}` | Missing or wrong token. The device does not retry |
| `413` | `{"error":"…"}` | Body over 64 KB (a real result is at most about 5 KB) |
| `503` | `{"error":"…"}` | `INGEST_TOKEN` is not set on the server, so uploads are off |

`GET /api/health` answers `{"ok":true,"ingest":true|false}` without a token, which is handy for checking the URL from the board's setup.

The token is a shared secret between the server and the board's `secrets.h`. Make a long random one, for example `openssl rand -hex 24`. Sums that don't add up are stored with a warning, as the brief asks; the warnings come back in the response and show on the game page.

Test it from a computer:

```sh
curl -i -X POST "$URL/api/results" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  --data-binary @fixtures/fixture-a.json
```

## Hosting on Vercel + Supabase

The repo deploys as one Vercel Function (`api/index.js`, which re-exports the compiled `dist/vercel.js`). `vercel.json` sends every path to it except the faction icons, which Vercel serves from `public/` directly. Results go in a Supabase table; the function talks to it with the server-side secret key, so the key never reaches a browser.

One-time setup:

1. **Supabase.** Create a project (the free plan is enough). In **SQL Editor**, run [`supabase/migrations/20261121000000_create_results.sql`](supabase/migrations/20261121000000_create_results.sql). It creates the `results` table with row level security on and no policies, so the browser keys can't read or write it. (With the Supabase CLI linked to the project, `supabase db push` does the same.)
2. From **Project Settings → API keys**, note the project URL and a **secret** key (`sb_secret_…`), or the legacy `service_role` key.
3. **Vercel.** Import the GitHub repo as a new project. Leave the framework preset as **Other**; `vercel.json` sets the rest.
4. In the Vercel project's **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `SUPABASE_SECRET_KEY` | the secret key (or set `SUPABASE_SERVICE_ROLE_KEY` instead) |
   | `INGEST_TOKEN` | a long random string; the same value goes in the board's `secrets.h` |
   | `DISPLAY_TIME_ZONE` | your time zone, e.g. `America/New_York` (otherwise dates show in UTC) |

5. Deploy (or redeploy after adding the variables). Check `https://<app>.vercel.app/api/health`: it should say `"ingest":true`.
6. Put `https://<app>.vercel.app/api/results` and the token in the board's `secrets.h` (hardware-playground, `apps/bottlenose/c6/bottlenose_c6/`).

Notes:

- The example fixtures are **not** imported into Supabase. The game list starts empty and fills as the board uploads.
- Vercel's install also tries to build `better-sqlite3`, which only the local server uses. It is an optional dependency, so a failure there does not fail the deploy.
- Free Supabase projects pause after about a week without database activity. Opening the site counts. A paused project can be resumed from the Supabase dashboard; until then the pages and the upload return errors, and the board keeps its result and retries.

### Running against a local Supabase

With the Supabase CLI and Docker:

```sh
supabase start        # supabase/config.toml: only the database and REST API; applies supabase/migrations
supabase status       # API URL and keys
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=<secret key> INGEST_TOKEN=dev npm run dev
```

`npm test` also runs `test/store-supabase.test.ts` against it when `SUPABASE_TEST_URL`, `SUPABASE_TEST_KEY` (secret key) and, for the RLS check, `SUPABASE_TEST_ANON_KEY` (publishable key) are set. Without them those tests are skipped.

## Test fixtures

- `fixtures/`: the two example games from `specs.md`. The app imports these at startup.
- `test/fixtures/`: edge cases at the contract's limits, used only by tests: 4 players × 128 turns (about 4 KB compact), `turns_truncated: true`, a single-turn player, and an unknown faction with unusual nicknames.

## Running

### Local development

Requires Node 22.

```sh
npm install
npm run dev    # http://localhost:8080, restarts on file changes
npm test
```

The app reads these from the environment:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port (local server) |
| `DATA_DIR` | `./data` | Where the SQLite file lives |
| `FIXTURES_DIR` | `./fixtures` | Example games imported at startup |
| `INGEST_TOKEN` | unset | Shared secret for `POST /api/results`; unset turns uploads off |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | unset | When both are set, results live in Supabase instead of SQLite |
| `DISPLAY_TIME_ZONE` | the server's zone (UTC on Vercel and in Docker) | IANA time zone for game dates on the pages, e.g. `America/New_York` |
| `IMPORT_FIXTURES` | `1` with SQLite, `0` with Supabase | Import the example games at startup |

`.env.example` lists them. For local development, `INGEST_TOKEN=dev npm run dev` turns the upload endpoint on.

### Docker (the normal way to run it)

Requires Docker with the Compose plugin. From the repo root:

```sh
mkdir -p data                 # first time only, see "Data folder permissions" below
docker compose up -d --build  # build the image and start in the background
```

Then open `http://<host-ip>:8080` from any phone or laptop on the same network (or `http://localhost:8080` on the host itself).

To accept uploads from the board on the local network, put `INGEST_TOKEN=<token>` in the `.env` file next to `docker-compose.yml` and use `http://<host-ip>:8080/api/results` as the board's URL.

| Task | Command |
|---|---|
| Follow logs | `docker compose logs -f` |
| Status / health | `docker compose ps` |
| Stop | `docker compose stop` (or `docker compose down` to also remove the container) |
| Start again | `docker compose up -d` |
| Update to the latest code | `git pull && docker compose up -d --build` |

The container restarts automatically (`restart: unless-stopped`), including after a host reboot, until you stop it. The database lives on the host in `data/rootclock.db`, so it survives `down`/`up` and image rebuilds.

#### Data folder permissions

The container runs as a non-root user, uid/gid `1000:1000` by default, and needs to write to the bind-mounted `./data` folder. Two things make that work:

1. **Create `data/` yourself before the first `up`** (`mkdir -p data`). If it doesn't exist, Docker creates it owned by `root` and the app can't write the database. If that already happened: `sudo chown "$(id -u):$(id -g)" data`.
2. **The container runs as the same uid/gid as the owner of `data/`.** `docker-compose.yml` sets `user: "${UID:-1000}:${GID:-1000}"`. On most single-user Linux hosts your user is already `1000`, so nothing to do. If `id -u` prints something else, tell Compose your ids once with a `.env` file next to `docker-compose.yml`:

   ```sh
   printf 'UID=%s\nGID=%s\n' "$(id -u)" "$(id -g)" > .env
   ```

Docker Desktop on macOS/Windows maps bind-mount ownership for you; only step 1 matters there.

### Back up and restore

All data is one SQLite file, `data/rootclock.db`. SQLite may also keep `data/rootclock.db-wal` and `data/rootclock.db-shm` next to it while the app runs. Stopping the container closes the database cleanly and folds those into the main file, so **always stop the container before copying**. (If you ever copy while it is running, copy all three files together, but stopping is the safe way.)

Back up:

```sh
mkdir -p backups
docker compose stop
cp data/rootclock.db backups/rootclock-$(date +%F).db
docker compose start
```

Restore:

```sh
docker compose stop
cp backups/rootclock-YYYY-MM-DD.db data/rootclock.db
rm -f data/rootclock.db-wal data/rootclock.db-shm   # drop stale journal files from the old db, if any
docker compose start
```

`data/` and `backups/` are git-ignored.

# root-metrics

Companion app for **rootclock**, a turn timer for the board game Root running on a FreeWili OG.

The full brief and data contract (v1) are in [`specs.md`](specs.md).

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (Node 22 LTS) |
| Server + pages | Hono, server-rendered JSX |
| Storage | SQLite (`better-sqlite3`), one file: `data/rootclock.db` |
| Validation | zod |
| Tests | Vitest |
| Packaging | Docker Compose, one container, `./data` bind-mounted to `/data` |

It's a web app run on a single host computer. Phones and laptops on the same network open `http://<host-ip>:8080`.

### Deviations from the brief

`specs.md` describes a native mobile app with no backend. This project deliberately differs:

- **Web app on a host instead of a mobile app.** The app runs in Docker on one computer so its data lives in one place and is easy to back up.
- **Local server only.** There are still no accounts, auth, cloud sync or internet-facing services. The server is the brief's "local only" `ResultStore`.
- **Faction icons.** The brief says "no faction artwork"; this project shows the bundled icons from `public/factions/` (see below).
- **One extra metric: average time per player**, the game's `global_ms` divided by the number of players. It is shown on both pages. No other statistics.

Everything else in the brief applies unchanged: contract v1, parser rules, `ResultSource` with only `FixtureResultSource`, and the "Do not assume or build yet" list.

## Faction icons

`public/factions/<key>.png` holds one icon per faction, named by the faction key from the contract (`marquise.png`, `eyrie.png`, … all 13 keys in `specs.md`). The app serves them at `/static/factions/<key>.png` and shows them:

- on the game list, as a small row of icons per game (alt text and tooltip = faction name);
- on the game detail page, next to each player's faction name.

Unknown faction keys get no icon, just the raw key as text. To add or replace an icon, drop a PNG named after the key into `public/factions/`, then rebuild (`docker compose up -d --build`). A test (`test/factions.test.ts`) fails if a known faction key has no icon file.

## MVP scope

Import game results from bundled JSON fixtures, validate them against contract v1, store them in SQLite, and show them on two pages (game list and game detail).

Out of scope until the firmware is finished: BLE/Wi-Fi transport (including an HTTP ingest endpoint), live updates, faction art, stats/charts, and v2 fields.

Work is tracked in GitHub Issues under the **MVP** milestone.

## Running

### Local development

Requires Node 22.

```sh
npm install
npm run dev    # http://localhost:8080, restarts on file changes
npm test
```

The app reads `PORT` (default `8080`), `DATA_DIR` (default `./data`) and `FIXTURES_DIR` (default `./fixtures`) from the environment.

### Docker (the normal way to run it)

Requires Docker with the Compose plugin. From the repo root:

```sh
mkdir -p data                 # first time only, see "Data folder permissions" below
docker compose up -d --build  # build the image and start in the background
```

Then open `http://<host-ip>:8080` from any phone or laptop on the same network (or `http://localhost:8080` on the host itself).

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

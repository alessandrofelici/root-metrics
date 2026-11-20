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

Everything else in the brief applies unchanged: contract v1, parser rules, `ResultSource` with only `FixtureResultSource`, and the "Do not assume or build yet" list.

## MVP scope

Import game results from bundled JSON fixtures, validate them against contract v1, store them in SQLite, and show them on two pages (game list and game detail).

Out of scope until the firmware is finished: BLE/Wi-Fi transport (including an HTTP ingest endpoint), live updates, faction art, stats/charts, and v2 fields.

Work is tracked in GitHub Issues under the **MVP** milestone.

# 06 — Starter brief: rootclock companion mobile app

> **For a separate agent working in a separate repository.** This page is self-contained.
> Build the foundation described here and **stop there**. Everything else waits until the
> device firmware is finished. Changes to this contract will arrive as a new
> `schema_version`.

## What this is

**rootclock** is firmware for a FreeWili OG, a handheld dev board with an LCD and five
buttons. It is a chess-clock-style turn timer for 3–4 players of the board game Root.

After a game, the device will send one **game result** to a phone. The result carries each
player's nickname, faction, total time and the duration of every turn. The device sends it
through an attached ESP32-C6 radio.

The device firmware is being built now. The radio transport (BLE or Wi-Fi) has **not been
chosen**. The data contract below is fixed for v1.

## Your task, now

1. **Ask the user which platform/framework to use** (for example React Native/Expo, Flutter,
   native). Do not choose silently.
2. Scaffold the app and add a **data model** that matches contract v1 exactly.
3. Add **parsing and validation**:
   - reject a wrong `schema` or an unknown `schema_version` with a clear error;
   - check the sum invariants and show a *warning*, not a rejection, when they fail;
   - ignore unknown fields.
4. Add a **transport-agnostic source interface** and exactly one implementation, a fixture or
   file importer:

   ```ts
   // Language-neutral sketch; adapt to the chosen platform.
   interface ResultSource {
     /** Emits each GameResult a source receives. Transport-specific sources (BLE, HTTP)
      *  are added later, by a future brief. Only FixtureResultSource exists now. */
     results(): AsyncIterable<GameResult>;
   }
   class FixtureResultSource implements ResultSource { /* reads bundled/imported JSON */ }

   type ParseOutcome =
     | { ok: true; result: GameResult; warnings: string[] }
     | { ok: false; error: string };
   function parseGameResult(json: string): ParseOutcome;

   interface ResultStore {        // local only
     save(r: GameResult): void;   // idempotent: de-duplicate by game_id
     list(): GameResult[];        // newest first
     get(gameId: string): GameResult | undefined;
   }
   ```

5. Build **two placeholder screens** fed from the store:
   - **Game list:** one row per game, showing the player count and global time
     (`ended_at`, or "date unknown").
   - **Game detail:** one block per player, showing seat, nickname, faction, total time, and
     the per-turn times as a simple list.
6. Bundle the two example results below as fixtures, and add tests for the parser covering:
   - both fixtures;
   - a wrong `schema_version`;
   - a broken invariant (a warning);
   - an unknown extra field (ignored);
   - a duplicate `game_id` (stored once).

**Done means:** both fixtures import, display correctly and survive an app restart. The
parser tests pass. The source interface has exactly one implementation.

## Do not assume or build yet

- **Transport.** No BLE, Wi-Fi, HTTP server, sockets, pairing, discovery or permissions
  flows.
- No backend, cloud sync, accounts or auth.
- No live or in-game updates. The device sends one result after the game ends.
- No faction artwork. Show the faction name from the table below. Unknown keys are shown
  as-is.
- No fixed nickname list in the logic. Today's names are Jacob, Alex, Ahmed and Lorenzo, but
  treat nickname as a free string.
- No extra fields, statistics, leaderboards or charts beyond the placeholder screens.
- No guessed v2 fields, such as turn order, pauses or `started_at`.

If something seems to need one of these, stop and ask the user rather than inventing it.

---

## Contract v1

### Field rules

- All durations are **integer milliseconds**. Paused time is excluded everywhere.
- `players` lists only seats that took at least one turn, in seat order (1–4).
- `turns_ms` is ordered oldest first. If a player has more than 128 turns, the extra time is
  added into the last element and `turns_truncated` is `true`.
- The following hold by construction. A receiver should *warn*, not reject, if they fail:
  - `total_ms == sum(turns_ms)` for each player;
  - `global_ms == sum(players[].total_ms)`.
- `game_id` is an opaque, device-generated string (16 lowercase hex chars, random per game).
  Use it only for identity and de-duplication.
- `ended_at` is ISO 8601 local time without an offset (the OG's RTC has no time zone), or
  `null` when the clock is not known to be set. The MVP always sends `null`.
- `turn_limit_ms` is `null` when the limit is off.
- `nickname` is currently one of `Jacob`, `Alex`, `Ahmed`, `Lorenzo`. `faction` is a key from
  the table below. **Receivers must treat both as open strings:** show unknown values as-is
  and do not reject them.
- Receivers ignore unknown fields. Additive optional fields may appear within v1. Anything
  else is v2.

### Faction keys

| key | short name (device) | full name |
|---|---|---|
| `marquise` | Marquise | Marquise de Cat |
| `eyrie` | Eyrie | Eyrie Dynasties |
| `woodland` | Woodland | Woodland Alliance |
| `vagabond` | Vagabond | Vagabond |
| `riverfolk` | Riverfolk | Riverfolk Company |
| `cult` | Lizard Cult | Lizard Cult |
| `duchy` | Duchy | Underground Duchy |
| `corvid` | Corvids | Corvid Conspiracy |
| `hundreds` | Hundreds | Lord of the Hundreds |
| `keepers` | Keepers | Keepers in Iron |
| `twilight` | Twilight | Twilight Council |
| `knaves` | Knaves | Knaves of the Deepwood |
| `lilypad` | Lilypad | Lilypad Diaspora |

### JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "rootclock.game_result.v1",
  "title": "rootclock game result, v1",
  "type": "object",
  "required": ["schema", "schema_version", "game_id", "device", "ended_at",
               "turn_limit_ms", "global_ms", "players"],
  "properties": {
    "schema":         { "const": "rootclock.game_result" },
    "schema_version": { "const": 1 },
    "game_id":        { "type": "string", "minLength": 1, "maxLength": 32 },
    "device": {
      "type": "object",
      "required": ["app", "app_version"],
      "properties": {
        "app":         { "const": "rootclock" },
        "app_version": { "type": "string", "pattern": "^[0-9]{3}$" }
      }
    },
    "ended_at":       { "type": ["string", "null"] },
    "turn_limit_ms":  { "type": ["integer", "null"], "minimum": 1 },
    "global_ms":      { "type": "integer", "minimum": 0 },
    "players": {
      "type": "array",
      "minItems": 1,
      "maxItems": 4,
      "items": {
        "type": "object",
        "required": ["seat", "nickname", "faction", "total_ms", "turns_ms",
                     "turns_truncated"],
        "properties": {
          "seat":            { "type": "integer", "minimum": 1, "maximum": 4 },
          "nickname":        { "type": "string", "minLength": 1 },
          "faction":         { "type": "string", "minLength": 1 },
          "total_ms":        { "type": "integer", "minimum": 0 },
          "turns_ms": {
            "type": "array",
            "minItems": 1,
            "maxItems": 128,
            "items": { "type": "integer", "minimum": 0 }
          },
          "turns_truncated": { "type": "boolean" }
        }
      }
    }
  }
}
```

### Fixture A: a 3-player game with a 2:00 limit

```json
{
  "schema": "rootclock.game_result",
  "schema_version": 1,
  "game_id": "7f3a9c21e04b5d18",
  "device": { "app": "rootclock", "app_version": "001" },
  "ended_at": null,
  "turn_limit_ms": 120000,
  "global_ms": 666000,
  "players": [
    { "seat": 1, "nickname": "Jacob", "faction": "marquise",
      "total_ms": 228000, "turns_ms": [62000, 95000, 71000], "turns_truncated": false },
    { "seat": 2, "nickname": "Alex", "faction": "eyrie",
      "total_ms": 342000, "turns_ms": [88000, 120000, 134000], "turns_truncated": false },
    { "seat": 3, "nickname": "Ahmed", "faction": "woodland",
      "total_ms": 96000, "turns_ms": [45000, 51000], "turns_truncated": false }
  ]
}
```

### Fixture B: a 4-player game, no limit, clock set

```json
{
  "schema": "rootclock.game_result",
  "schema_version": 1,
  "game_id": "c09e5b7a31f2d846",
  "device": { "app": "rootclock", "app_version": "001" },
  "ended_at": "2026-11-21T20:14:05",
  "turn_limit_ms": null,
  "global_ms": 460000,
  "players": [
    { "seat": 1, "nickname": "Jacob", "faction": "cult",
      "total_ms": 135000, "turns_ms": [70000, 65000], "turns_truncated": false },
    { "seat": 2, "nickname": "Alex", "faction": "duchy",
      "total_ms": 170000, "turns_ms": [80000, 90000], "turns_truncated": false },
    { "seat": 3, "nickname": "Ahmed", "faction": "corvid",
      "total_ms": 115000, "turns_ms": [55000, 60000], "turns_truncated": false },
    { "seat": 4, "nickname": "Lorenzo", "faction": "vagabond",
      "total_ms": 40000, "turns_ms": [40000], "turns_truncated": false }
  ]
}
```

## How this brief will change

The source of truth is `documents/04-future-esp32-integration.md` in the firmware repository
(hardware-playground). When the firmware MVP is finished and a transport is chosen, a second
brief will add a transport-specific `ResultSource` and any v2 fields. Until then, contract v1
is **provisional but stable**. Build against it, and nothing beyond it.

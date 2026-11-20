# root-metrics

Companion mobile app for **rootclock**, a turn timer for the board game Root running on a FreeWili OG.

The full brief and data contract (v1) are in [`specs.md`](specs.md).

## MVP scope

Import game results from bundled JSON fixtures, validate them against contract v1, store them locally, and show them on two placeholder screens (game list and game detail).

Out of scope until the firmware is finished: BLE/Wi-Fi transport, backend/sync, live updates, faction art, stats/charts, and v2 fields. See `specs.md` → "Do not assume or build yet".

Work is tracked in GitHub Issues under the **MVP** milestone.

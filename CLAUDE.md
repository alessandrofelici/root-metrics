# Notes for coding agents

- **Stack:** Hono with server-rendered JSX (`src/views/`), one stylesheet (`public/app.css`), and one small progressive-enhancement script (`public/app.js`, calendar only). Every page must still work without it. Figma design-to-code emits React and Tailwind; translate it to this stack and to the CSS tokens. Don't copy it in.
- **Design source:** Figma file `nwYwpKEd9S0qhmlbVoztWp`. The Screens page holds the screens; the Components page holds the components and variables. CSS tokens in `public/app.css` mirror the Figma variables (`Color`, `Color dark`, `Size`).
- **Data layers:** `src/derive.ts` (per-game facts, winner, days) → `src/stats.ts` (aggregates, in ms) → `src/views/` (the only place that formats). Pages never compute stats inline.
- **Escaping:** never render stored strings (nicknames, faction keys, warnings) with `raw()` or `dangerouslySetInnerHTML`. JSX interpolation escapes them.
- **Contract v1 only:** no winners, scores or other fields beyond what the board sends. The winner is derived (`endedOnSeat`).
- **Formats:** totals use `formatTotal` (`1 hr 20 min`). Turns use `formatTurn` (`1:30`). Averages use `formatAvgTurn` (rounded to the second).
- **Hidden IDs:** never show catalogue IDs (C1…W9) or game IDs on a page. Chart IDs go in `data-chart` attributes; game IDs only in URLs.
- **Figma sample numbers** are style references. Draw charts from real data; never copy coordinates or numbers from Figma.
- **Git:** commit locally; the owner pushes.

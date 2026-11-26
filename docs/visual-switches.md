# Visual switches: proposals

Ways to show the numbers the app already has, mostly percentages and "x of y" counts, as small
charts instead of text. Every proposal keeps the number as text next to the chart, and works
without JavaScript. Nothing new is computed beyond what `src/stats.ts` already has.

**Demo:** `/demo/visuals` puts each switch next to the component it would replace, both drawn
from the same games. Locally, with sample games and no database:

```sh
npm run demo          # → http://localhost:8080/demo/visuals   (PORT=… to change the port)
```

On a deployment, `/demo/visuals` uses the real games. It is linked from nowhere.

Code: `src/views/demo.tsx` (proposed components and the page), `public/demo.css` (their styles,
built only from the existing tokens), `scripts/demo-server.ts` (local preview, in-memory sample
games), `test/demo.test.tsx`.

## The switches

| # | Now | Proposed | Where | Verdict |
|---|---|---|---|---|
| 1 | Win rate tile: `32%` | **Ring** with the % inside, "9 of 28" under it | Player and Faction page tiles | Adopt |
| 2 | "19 of 134 turns went over the limit" | Same sentence plus a **ring** in the over-limit colour | Player and Faction page → Turn limit | Adopt |
| 3 | Players list row: "9 wins · 32% · avg turn 1:17" | **Small ring** in the row's icon slot, % removed from the summary | Stats → Players | Try |
| 4 | Who used the time: stacked bar | **Donut** in seat order, game time in the middle, legend with name, % and time | Game page | Optional |
| 5 | Game card: players and game time | **Thin share bar** under the players; each player row gets its seat dot and % | Home, Day, Player → recent games | Adopt |
| 6 | Games and Wins as two number columns | One column of **pips** (a dot per game, filled = won); past 12 a **meter bar** | Player → Factions; Stats → Games → Seats | Adopt |
| 7 | Wins over time: bars of wins, "2 of 3" | **Wins inside games played**: light bar = games, dark part = wins | Player → Wins over time; Faction → Wins by player | Adopt |
| 8 | Who plays what: a grid of numbers | **Heatmap**: same grid, cells shaded in one hue, numbers kept | Stats → Players → Who plays what | Adopt |
| 9 | Speed: average-turn bars plus a "middle half" sentence | **Turn spread** per player on one axis: whisker fastest–slowest, box middle half, tick median; you in the accent | Player → Speed | Try |
| 10 | Rivals table | **Head-to-head bars**: your wins grow left from the middle, theirs right | Player → Rivals | Try |

Verdicts: **Adopt** = clearer at no cost; **Try** = likely better, worth a look on a phone with
real data; **Optional** = a matter of taste, see the note.

## Why circles where they are

Rings work for **one percentage against 100%** (win rate, share of turns over the limit). That is
a meter bent into a circle: one value, its track a lighter step of the same colour, the number
in the middle. Rings also fit where a square glyph fits better than a bar: tiles and the
icon slot of a list row.

For **a whole split into 3–4 players** (switch 4), the existing stacked bar is easier to read:
lengths on one line compare more exactly than angles, and the bar fits a phone's width. The
donut is in the demo because it was asked for and looks at home in the wide layout, where the
space beside the tiles is square. It keeps a full legend (name, %, time), because the seat
colours alone aren't enough (next section).

## Seat colours: measured, not changed

The seat colours come from the Figma tokens, so the demo uses them as they are. A colour-blind
check (OKLab ΔE under simulated colour blindness, the dataviz skill's `validate_palette.js`)
says they need labels next to them:

- **Light** (`#2F5D46 #B4593A #C29A33 #4D6F8C` on `#FFFDF8`): seat 1 and seat 2 are ΔE 6.8 apart
  for protanopes (8 is the target; 6–8 is allowed only with labels); seat 3 yellow is 2.6:1
  against the surface; seats 1 and 4 have low chroma and read close to grey.
- **Dark** (`#6FA587 #E0896A #E2C26A #8AAAC6` on `#1A211D`): seat 1 and seat 2 are ΔE **4.2**
  apart for protanopes, and seats 2 and 3 are ΔE 14.5 apart even with full colour vision
  (below the floor of 15).

Today's pages and every proposal here put the player's name next to the colour, so nothing
depends on colour alone. A chart that drops those labels would. Worth a pass in Figma if seat
colours are ever used on their own.

## Not in the demo (ideas for later)

- **Calendar heat:** shade each day by time played instead of a dot or count. Same component,
  one CSS variable per day.
- **Records with context:** "Longest turn 6:12" plus how many times the player's average turn
  it was.
- **Pace with the limit:** draw the turn limit as a reference line on the pace chart when the
  game had one.
- **Form strip:** already a visual (won/lost blocks); no change proposed.
- **Turn bars:** already show over/within per turn; pips for "Over 2:00: 1 of 9" on the game
  page would repeat them, so no change proposed there.

## Adopting one

1. Move the component from `src/views/demo.tsx` to `src/views/ui.tsx`, and its rules from
   `public/demo.css` to `public/app.css`.
2. Swap it into the page in `src/views/pages.tsx`, giving it the page's `data-chart` ID.
3. If it needs a number that a view computes inline (the turn spread's quartiles), move that
   into `src/stats.ts`.
4. When nothing is left to compare, remove `/demo/visuals`, `demo.tsx`, `demo.css`,
   `scripts/demo-server.ts` and the `demo` npm script.

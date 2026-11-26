// DEMO: the visual switches, before and after. Each section shows a component as it was before
// they were adopted ("Before": a copy of the old component or markup, kept in this file) next to
// what the app shows today ("Now in the app": the real component from ui.tsx, so the two can't
// drift). Served at /demo/visuals and linked from nowhere. `npm run demo` runs it locally over
// sample games. The write-up with the original reasoning is docs/visual-switches.md.
//
// Same rules as the rest of src/views: real data only, stored strings through JSX interpolation
// (escaped), catalogue IDs only in data-chart attributes. Styles: public/demo.css.
import type { Child } from "hono/jsx";
import type { GameFacts, PlayerFacts, Snapshot } from "../derive.js";
import { factionName } from "../factions.js";
import { dayLabel, formatAvgTurn, formatPercent, formatTotal, formatTurn, shortMonthLabel, timeLabel } from "../format.js";
import {
  factionStats, playerFactions, playerStats, quantile, rivals, statGames, turnSpread, winRate, winsByMonth,
} from "../stats.js";
import {
  BarList, FactionIcon, GameCard, HeadToHead, HeatMatrix, LinkRow, PartBarList, Ring, StatTile, Takeaway, Tally, Tiles,
  TimeShare, TurnBars, TurnRanges, WinnerMarker, gameHref, playerHref, type RangeRow,
} from "./ui.js";

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rateText = (wins: number, decided: number) => { const r = winRate(wins, decided); return r === null ? "–" : formatPercent(r); };

// =====================================================================================
// "Before": the components as they were before the switches (seat colours, old turn bars)
// =====================================================================================

function OldGameCard({ g, showTime }: { g: GameFacts; showTime: boolean }) {
  return (
    <a class="card game-card" href={gameHref(g.id)}>
      <span class="game-card-date">
        <span class="title">{dayLabel(g.day)}</span>
        {showTime ? <span class="muted">{timeLabel(g.hour, g.minute)}</span> : null}
      </span>
      <span class="rule" />
      <ul class="chips">
        {g.players.map((p) => (
          <li class="chip">
            <FactionIcon faction={p.faction} />
            <span>{p.nickname}</span>
            {p.won ? <WinnerMarker /> : null}
          </li>
        ))}
      </ul>
      <span class="card-foot">
        <span class="label">Game time</span>
        <span class="num">{formatTotal(g.globalMs)}</span>
      </span>
    </a>
  );
}

function OldTimeShare({ g }: { g: GameFacts }) {
  const sum = g.players.reduce((n, p) => n + p.totalMs, 0) || 1;
  const top = [...g.players].sort((a, b) => b.totalMs - a.totalMs)[0]!;
  return (
    <section class="share" data-chart="C6">
      <Takeaway chart="C6">{`${top.nickname} used the most time: ${Math.round((top.totalMs / sum) * 100)}% of the game.`}</Takeaway>
      <div class="share-bar" role="img" aria-label={g.players.map((p) => `${p.nickname} ${Math.round((p.totalMs / sum) * 100)}%`).join(", ")}>
        {g.players.map((p) => (
          <span class={`seg seat-${p.seat}`} style={`flex-grow:${p.totalMs}`} />
        ))}
      </div>
      <ul class="share-labels">
        {g.players.map((p) => (
          <li style={`flex-grow:${Math.max(p.totalMs, sum * 0.12)}`}>
            <span class="share-name">
              <span class={`dot seat-${p.seat}`} />
              {p.nickname}
            </span>
            <span class="label">{formatTotal(p.totalMs)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OldTurnBars({ p, limitMs, mini = false }: { p: PlayerFacts; limitMs: number | null; mini?: boolean }) {
  const W = mini ? 280 : 320;
  const H = mini ? 36 : 128;
  const left = mini ? 0 : 34;
  const top = mini ? 2 : 8;
  const bottom = mini ? 0 : 18;
  const turns = p.turnsMs;
  const yMax = Math.ceil(Math.max(...turns, limitMs ?? 0, 60_000) / 60_000) * 60_000;
  const plotH = H - top - bottom;
  const step = (W - left) / Math.max(1, turns.length);
  const bw = Math.max(1, step * 0.72);
  const y = (ms: number) => top + plotH - (ms / yMax) * plotH;
  const labelEvery = turns.length <= 16 ? 1 : Math.ceil(turns.length / 8);
  return (
    <svg class={mini ? "chart turn-bars mini" : "chart turn-bars"} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${p.nickname}: ${turns.length} turns, longest ${formatTurn(Math.max(...turns))}`} data-chart="C14">
      {mini ? null : (
        <>
          <line class="axis-line" x1={left} x2={W} y1={y(0)} y2={y(0)} />
          <text class="axis" x="0" y={r2(y(yMax) + 4)}>{formatTurn(yMax)}</text>
          <text class="axis" x="0" y={r2(y(0) + 4)}>0</text>
        </>
      )}
      {turns.map((ms, i) => {
        const folded = p.truncated && i === turns.length - 1;
        const over = !folded && limitMs !== null && ms > limitMs;
        return (
          <rect class={folded ? "bar folded" : over ? "bar over" : "bar within"} x={r2(left + i * step + (step - bw) / 2)} y={r2(y(ms))} width={r2(bw)} height={r2(Math.max(0.5, y(0) - y(ms)))} rx="1.5">
            <title>{`Turn ${i + 1}: ${formatTurn(ms)}`}</title>
          </rect>
        );
      })}
      {limitMs !== null ? (
        <>
          <line class="limit" x1={left} x2={W} y1={r2(y(limitMs))} y2={r2(y(limitMs))} />
          {mini ? null : <text class="axis limit-label" x="0" y={r2(y(limitMs) + 4)}>{formatTurn(limitMs)}</text>}
        </>
      ) : null}
      {mini ? null : turns.map((_, i) => (i % labelEvery === 0 || i === turns.length - 1 ? <text class="axis" x={r2(left + i * step + step / 2)} y={H - 4} text-anchor="middle">{String(i + 1)}</text> : null))}
    </svg>
  );
}

/** Switch 1 was not adopted, so its tile lives only here. */
function RingTile({ label, fraction, caption }: { label: string; fraction: number | null; caption?: string }) {
  return (
    <div class="tile ring-tile">
      <span class="label">{label}</span>
      <Ring fraction={fraction} label={label} />
      {caption ? <span class="small muted">{caption}</span> : null}
    </div>
  );
}

// =====================================================================================
// The demo page
// =====================================================================================

type Status = "In the app" | "Not adopted";

function Switch({ id, n, title, where, status, now, proposed, why }: {
  id: string; n: number; title: string; where: string; status: Status; now: Child; proposed: Child; why: string;
}) {
  return (
    <section class="switch card" id={id} aria-labelledby={`${id}-title`}>
      <header class="switch-head">
        <span class="switch-meta">
          <span class="label">{`Switch ${n}`}</span>
          <span class={status === "In the app" ? "verdict verdict-adopt" : "verdict"}>{status}</span>
        </span>
        <h2 class="title" id={`${id}-title`}>{title}</h2>
        <p class="small muted">{where}</p>
      </header>
      <div class="switch-cols">
        <div class="switch-col now">
          <span class="label">Before</span>
          {now}
        </div>
        <div class="switch-col proposed">
          <span class="label">{status === "In the app" ? "Now in the app" : "Proposed"}</span>
          {proposed}
        </div>
      </div>
      <p class="small switch-why">{why}</p>
    </section>
  );
}

export function VisualSwitchesPage({ snap }: { snap: Snapshot }) {
  const games = statGames(snap);
  if (games.length === 0) {
    return (
      <div class="stack">
        <h1 class="display">Visual switches</h1>
        <p class="muted">The demo needs at least one game with two or more players. Run <code>npm run demo</code> for a local copy with sample games.</p>
      </div>
    );
  }
  const players = playerStats(games);
  const factions = factionStats(games);
  const me = players[0]!;
  // The richest game for the game-level switches: a turn limit and the most players.
  const g = [...games].sort((a, b) => Number(b.limitMs !== null) - Number(a.limitMs !== null) || b.players.length - a.players.length)[0]!;
  // For the turn bars: a player who stayed within a turn limit, in the game with the fewest turns.
  const within = games.flatMap((x) => x.players.filter((p) => x.limitMs !== null && p.overLimit === 0).map((p) => ({ g: x, p })))
    .sort((a, b) => a.p.turnsMs.length - b.p.turnsMs.length)[0];
  const tb = within ?? { g, p: [...g.players].sort((a, b) => a.turnsMs.length - b.turnsMs.length)[0]! };
  const overRate = me.limitedTurns > 0 ? me.overLimit / me.limitedTurns : null;
  const facs = playerFactions(me);
  const months = winsByMonth(me);
  const rv = rivals(players, me);
  const sorted = [...me.turnsMs].sort((a, b) => a - b);
  const bySpeed = [...players].sort((a, b) => b.avgTurnMs - a.avgTurnMs);
  const ranges = bySpeed.flatMap((p): RangeRow[] => {
    const spread = turnSpread(p.turnsMs);
    return spread ? [{ key: p.key, label: p.name, spread, highlight: p.key === me.key }] : [];
  });
  const gamesOf = (key: string) => factions.map((f) => f.players.find((x) => x.key === key)?.games ?? null);

  const switches: { id: string; title: string; el: (n: number, id: string, title: string) => Child }[] = [
    {
      id: "win-rate", title: "Win rate tile → ring",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Player page and Faction page: the tiles at the top" status="Not adopted"
          now={<Tiles><StatTile label="Wins" value={String(me.wins)} /><StatTile label="Win rate" value={rateText(me.wins, me.decided)} /><StatTile label="Avg turn" value={formatAvgTurn(me.avgTurnMs)} /></Tiles>}
          proposed={<Tiles><StatTile label="Wins" value={String(me.wins)} /><RingTile label="Win rate" fraction={winRate(me.wins, me.decided)} caption={`${me.wins} of ${me.decided}`} /><StatTile label="Avg turn" value={formatAvgTurn(me.avgTurnMs)} /></Tiles>}
          why="Left out at review: the tiles stay as numbers." />
      ),
    },
    {
      id: "over-limit", title: "Over-the-limit rate → ring",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Player page and Faction page: Turn limit (inside the row)" status="In the app"
          now={<p class="small">{overRate === null ? "Play with a turn limit to see this." : `${me.overLimit} of ${me.limitedTurns} turns went over the limit, across games that had one.`}</p>}
          proposed={overRate === null ? <p class="small">Play with a turn limit to see this.</p> : (
            <div class="ring-line">
              <Ring fraction={overRate} label="Turns over the limit" tone="over" />
              <p class="small">{`${me.overLimit} of ${me.limitedTurns} turns went over the limit, across games that had one.`}</p>
            </div>
          )}
          why="The same sentence, with a ring in the over-limit colour that turn bars already use." />
      ),
    },
    {
      id: "players-list", title: "Players list → win-rate ring in each row",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Stats → Players: the list of players" status="In the app"
          now={<div class="group">{players.slice(0, 4).map((p) => <LinkRow href={playerHref(p.key)} title={p.name} summary={`${plural(p.wins, "win")} · ${rateText(p.wins, p.decided)} · avg turn ${formatAvgTurn(p.avgTurnMs)}`} />)}</div>}
          proposed={<div class="group">{players.slice(0, 4).map((p) => <LinkRow href={playerHref(p.key)} title={p.name} summary={`${plural(p.wins, "win")} · avg turn ${formatAvgTurn(p.avgTurnMs)}`} icon={<Ring fraction={winRate(p.wins, p.decided)} label={`${p.name} win rate`} size={44} />} />)}</div>}
          why="A ring in the row's icon slot; the % comes out of the summary because the ring shows it." />
      ),
    },
    {
      id: "time-share", title: "Who used the time → donut, in faction colours",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Game page: next to the Game time and Turn limit tiles" status="In the app"
          now={<OldTimeShare g={g} />}
          proposed={<TimeShare g={g} />}
          why="Before: a stacked bar in seat colours. Now: a donut where each player has the colour of the faction they played, with name, % and time in the legend." />
      ),
    },
    {
      id: "game-card", title: "Game card → thin share bar, in faction colours",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Home (latest game), Day page, Player page (recent games)" status="In the app"
          now={<OldGameCard g={g} showTime={false} />}
          proposed={<GameCard g={g} showTime={false} />}
          why="Who used the time shows before opening the game. Each player row carries a dot in their faction's colour and their %." />
      ),
    },
    {
      id: "faction-wins", title: "\"2 of 5\" → pips",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Factions table (also Stats → Games → Seats, where counts pass 12 and it becomes a meter). Shown for ${me.name}.`} status="In the app"
          now={<table class="data-table"><thead><tr><th scope="col">Faction</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Avg turn</th></tr></thead><tbody>{facs.map((f) => <tr><th scope="row"><span class="inline-faction"><FactionIcon faction={f.faction} size={20} />{factionName(f.faction)}</span></th><td class="num">{String(f.games)}</td><td class="num">{String(f.wins)}</td><td class="num">{formatAvgTurn(f.avgTurnMs)}</td></tr>)}</tbody></table>}
          proposed={<table class="data-table"><thead><tr><th scope="col">Faction</th><th scope="col">Wins of games</th><th scope="col">Avg turn</th></tr></thead><tbody>{facs.map((f) => <tr><th scope="row"><span class="inline-faction"><FactionIcon faction={f.faction} size={20} />{factionName(f.faction)}</span></th><td><Tally hits={f.wins} total={f.games} label={`Wins on ${factionName(f.faction)}`} /></td><td class="num">{formatAvgTurn(f.avgTurnMs)}</td></tr>)}</tbody></table>}
          why="Two count columns become one: a dot per game, filled when won. Past 12 the dots become a meter bar." />
      ),
    },
    {
      id: "wins-over-time", title: "Wins over time → wins inside games played",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Wins over time (also Faction page → Wins by player). Shown for ${me.name}.`} status="In the app"
          now={<BarList chart="W8" items={months.map((m) => ({ label: shortMonthLabel(m.month), value: m.wins, display: `${m.wins} of ${m.games}` }))} />}
          proposed={<PartBarList chart="W8" items={months.map((m) => ({ label: shortMonthLabel(m.month), part: m.wins, whole: m.games }))} />}
          why="Games as the light bar, wins as the dark part, no legend." />
      ),
    },
    {
      id: "matrix", title: "Who plays what → heatmap",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Stats → Players → Who plays what (Games view; Speed and Wins work the same)" status="In the app"
          now={<div class="table-scroll"><table class="data-table matrix"><thead><tr><th scope="col">Player</th>{factions.map((f) => <th scope="col" title={factionName(f.key)}><FactionIcon faction={f.key} size={22} /></th>)}</tr></thead><tbody>{players.map((p) => <tr><th scope="row">{p.name}</th>{gamesOf(p.key).map((v) => v === null ? <td class="num muted">·</td> : <td class="num">{String(v)}</td>)}</tr>)}</tbody></table></div>}
          proposed={<HeatMatrix columns={factions.map((f) => ({ key: f.key, head: <FactionIcon faction={f.key} size={22} />, title: factionName(f.key) }))} rows={players.map((p) => ({ key: p.key, label: p.name, cells: gamesOf(p.key) }))} show={String} lo="fewer games" hi="more games" />}
          why="One-hue shading shows each player's comfort factions at a glance; the numbers stay in the cells." />
      ),
    },
    {
      id: "speed", title: "Speed → turn spread per player",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Speed. Shown for ${me.name}.`} status="In the app"
          now={<div class="group"><BarList chart="C2" items={bySpeed.map((p) => ({ label: p.name, value: p.avgTurnMs, display: formatAvgTurn(p.avgTurnMs), highlight: p.key === me.key }))} />{sorted.length > 0 ? <p class="small muted" data-chart="C4">{`Middle half of ${me.name}'s turns: ${formatTurn(quantile(sorted, 0.25))} to ${formatTurn(quantile(sorted, 0.75))}. Fastest ${formatTurn(sorted[0]!)}, slowest ${formatTurn(sorted.at(-1)!)}.`}</p> : null}</div>}
          proposed={<TurnRanges rows={ranges} />}
          why="One box per player on one axis replaces the average bars and the middle-half sentence. Hover a row for the numbers." />
      ),
    },
    {
      id: "rivals", title: "Rivals table → head-to-head bars",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Rivals. Shown for ${me.name}.`} status="In the app"
          now={<table class="data-table"><thead><tr><th scope="col">Against</th><th scope="col">Games</th><th scope="col">{`${me.name} won`}</th><th scope="col">They won</th></tr></thead><tbody>{rv.map((r) => <tr><th scope="row"><a href={playerHref(r.key)}>{r.name}</a></th><td class="num">{String(r.together)}</td><td class="num">{String(r.myWins)}</td><td class="num">{String(r.theirWins)}</td></tr>)}</tbody></table>}
          proposed={rv.length > 0 ? <HeadToHead me={me.name} rows={rv} /> : <p class="small muted">No shared games yet.</p>}
          why="Bars that grow away from a shared middle show who leads before you read a number." />
      ),
    },
    {
      id: "turn-bars", title: "Turn bars → no limit line when never over, at least 6 turns wide",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Game page → each player's turns (rows on phones, the table on wide screens). Shown for ${tb.p.nickname} on ${dayLabel(tb.g.day)}.`} status="In the app"
          now={<div class="group"><OldTurnBars p={tb.p} limitMs={tb.g.limitMs} /><OldTurnBars p={tb.p} limitMs={tb.g.limitMs} mini /></div>}
          proposed={<div class="group"><TurnBars p={tb.p} limitMs={tb.g.limitMs} /><TurnBars p={tb.p} limitMs={tb.g.limitMs} mini /></div>}
          why="A player who never went over the limit gets no limit line, so the y-axis fits their turns. A game with few turns no longer stretches each bar across the chart. Full-size chart, then the table's mini version." />
      ),
    },
  ];

  return (
    <article class="stack demo">
      <div class="heading">
        <p class="label">Demo · not linked from the app</p>
        <h1 class="display">Visual switches</h1>
        <p class="muted">
          {`Each section puts a component as it was before the switches next to what the app shows now, drawn from the same data (${plural(games.length, "game")} here). The original reasoning is in docs/visual-switches.md.`}
        </p>
      </div>
      <nav class="card demo-toc" aria-label="Switches">
        <ol>
          {switches.map((s) => (
            <li><a href={`#${s.id}`}>{s.title}</a></li>
          ))}
        </ol>
      </nav>
      {switches.map((s, i) => s.el(i + 1, s.id, s.title))}
      <p class="small muted">{`Player-level switches show ${me.name} (most wins). Game-level switches show the game from ${dayLabel(g.day)}.`}</p>
      <p class="small"><a href={gameHref(g.id)}>Open that game</a> · <a href={playerHref(me.key)}>{`Open ${me.name}'s page`}</a></p>
    </article>
  );
}

/** Used by the tests: the switches the page renders, in order. */
export const SWITCH_IDS = ["win-rate", "over-limit", "players-list", "time-share", "game-card", "faction-wins", "wins-over-time", "matrix", "speed", "rivals", "turn-bars"] as const;

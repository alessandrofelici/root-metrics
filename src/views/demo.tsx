// DEMO: proposed visual switches. Each section shows a component as it is on main ("Now",
// rendered with the real component from ui.tsx, or the same markup copied from pages.tsx) next
// to a proposed replacement ("Proposed") drawn from the same data. Served at /demo/visuals and
// linked from nowhere. `npm run demo` runs it locally over sample games. The write-up with the
// reasoning is docs/visual-switches.md.
//
// Same rules as the rest of src/views: real data only, stored strings through JSX interpolation
// (escaped), catalogue IDs only in data-chart attributes. Styles: public/demo.css. A component
// that gets adopted moves to ui.tsx and its CSS to app.css.
import type { Child } from "hono/jsx";
import type { GameFacts, Snapshot } from "../derive.js";
import { factionName } from "../factions.js";
import { dayLabel, formatAvgTurn, formatPercent, formatTotal, formatTurn, shortMonthLabel, timeLabel } from "../format.js";
import {
  factionStats, playerFactions, playerStats, quantile, rivals, statGames, winRate, winsByMonth,
  type FactionStats, type PlayerStats,
} from "../stats.js";
import {
  BarList, FactionIcon, GameCard, LinkRow, StatTile, Takeaway, Tiles, TimeShare, WinnerMarker, gameHref, playerHref,
} from "./ui.js";

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rateText = (wins: number, decided: number) => { const r = winRate(wins, decided); return r === null ? "–" : formatPercent(r); };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// =====================================================================================
// Proposed components
// =====================================================================================

/** A percentage as a ring (circular meter): the arc is the share, the number sits inside.
 *  The track is a lighter step of the fill's colour, so the whole ring reads as one scale. */
export function Ring({ fraction, label, size = 64, tone = "accent", showText = true }: {
  fraction: number | null; label: string; size?: number; tone?: "accent" | "over"; showText?: boolean;
}) {
  const sw = Math.max(3, Math.round(size * 0.11));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  const f = fraction === null ? 0 : clamp01(fraction);
  const text = fraction === null ? "–" : formatPercent(f);
  return (
    <svg class={`ring tone-${tone}`} viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${text}`}>
      <title>{`${label}: ${text}`}</title>
      <circle class="ring-track" cx={mid} cy={mid} r={r2(r)} stroke-width={sw} />
      {f >= 0.9995 ? (
        <circle class="ring-fill" cx={mid} cy={mid} r={r2(r)} stroke-width={sw} />
      ) : f > 0 ? (
        <circle class="ring-fill" cx={mid} cy={mid} r={r2(r)} stroke-width={sw} stroke-dasharray={`${r2(f * c)} ${r2(c)}`} transform={`rotate(-90 ${mid} ${mid})`} />
      ) : null}
      {showText ? (
        <text class="ring-text" x={mid} y={mid} text-anchor="middle" dominant-baseline="central" font-size={r2(size * 0.25)}>{text}</text>
      ) : null}
    </svg>
  );
}

/** StatTile whose value is a Ring. */
export function RingTile({ label, fraction, caption, tone }: { label: string; fraction: number | null; caption?: string; tone?: "accent" | "over" }) {
  return (
    <div class="tile ring-tile">
      <span class="label">{label}</span>
      <Ring fraction={fraction} label={label} tone={tone} />
      {caption ? <span class="small muted">{caption}</span> : null}
    </div>
  );
}

/** Who used the time, as a donut in seat order from 12 o'clock, 2px surface gaps between
 *  seats, game time in the middle. The legend carries every name, share and time, so identity
 *  never rests on colour alone. */
export function ShareDonut({ g }: { g: GameFacts }) {
  const sum = g.players.reduce((n, p) => n + p.totalMs, 0) || 1;
  const top = [...g.players].sort((a, b) => b.totalMs - a.totalMs)[0]!;
  const size = 156, sw = 22, r = (size - sw) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const gap = g.players.length > 1 ? 2 : 0;
  let start = 0;
  const segs = g.players.map((p) => {
    const frac = p.totalMs / sum;
    const seg = { p, frac, len: Math.max(0.5, frac * c - gap), offset: -(start * c + gap / 2) };
    start += frac;
    return seg;
  });
  return (
    <section class="share share-donut" data-chart="C6">
      <Takeaway chart="C6">{`${top.nickname} used the most time: ${formatPercent(top.totalMs / sum)} of the game.`}</Takeaway>
      <div class="donut-wrap">
        <svg class="donut" viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={g.players.map((p) => `${p.nickname} ${formatPercent(p.totalMs / sum)}`).join(", ")}>
          {segs.map((s) => (
            <circle class={`donut-seg seat-${s.p.seat}`} cx={mid} cy={mid} r={r2(r)} stroke-width={sw} stroke-dasharray={`${r2(s.len)} ${r2(c - s.len)}`} stroke-dashoffset={r2(s.offset)} transform={`rotate(-90 ${mid} ${mid})`}>
              <title>{`${s.p.nickname}: ${formatPercent(s.frac)} · ${formatTotal(s.p.totalMs)}`}</title>
            </circle>
          ))}
          <text class="donut-label" x={mid} y={mid - 9} text-anchor="middle">GAME TIME</text>
          <text class="donut-value" x={mid} y={mid + 9} text-anchor="middle">{formatTotal(g.globalMs)}</text>
        </svg>
        <ul class="donut-legend">
          {g.players.map((p) => (
            <li>
              <span class={`dot seat-${p.seat}`} />
              <span class="donut-name">{p.nickname}</span>
              <span class="num">{formatPercent(p.totalMs / sum)}</span>
              <span class="donut-time small muted">{formatTotal(p.totalMs)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Game card with a thin, text-free share bar under the players. Each player row gets its seat
 *  swatch and share, which stand in for a legend. */
export function GameCardShare({ g, showTime }: { g: GameFacts; showTime: boolean }) {
  const sum = g.players.reduce((n, p) => n + p.totalMs, 0) || 1;
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
            <span class="chip-share">
              <span class={`dot seat-${p.seat}`} />
              <span class="num">{formatPercent(p.totalMs / sum)}</span>
            </span>
          </li>
        ))}
      </ul>
      <span class="thin-share" role="img" aria-label={`Share of game time: ${g.players.map((p) => `${p.nickname} ${formatPercent(p.totalMs / sum)}`).join(", ")}`}>
        {g.players.map((p) => (
          <span class={`seg seat-${p.seat}`} style={`flex-grow:${p.totalMs}`} />
        ))}
      </span>
      <span class="card-foot">
        <span class="label">Game time</span>
        <span class="num">{formatTotal(g.globalMs)}</span>
      </span>
    </a>
  );
}

/** "2 of 5" as pips (one per game, filled = won). Past 12 the pips get too small, so it falls
 *  back to a meter bar. The text stays beside it. */
export function Tally({ hits, total, label }: { hits: number; total: number; label: string }) {
  const text = `${hits} of ${total}`;
  return (
    <span class="tally" role="img" aria-label={`${label}: ${text}`}>
      {total <= 12 ? (
        <span class="pips" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => <span class={i < hits ? "pip on" : "pip"} />)}
        </span>
      ) : (
        <span class="tally-meter" aria-hidden="true">
          <span class="tally-meter-fill" style={`width:${r2(clamp01(total ? hits / total : 0) * 100)}%`} />
        </span>
      )}
      <span class="num tally-text" aria-hidden="true">{text}</span>
    </span>
  );
}

export interface PartItem { label: Child; part: number; whole: number; highlight?: boolean }

/** "Wins of games" bars: the light bar is games played (one shared scale), the dark part is
 *  wins. Shows both how often and how well, where BarList shows only wins. */
export function PartBarList({ items, chart, partName, wholeName }: { items: PartItem[]; chart?: string; partName: string; wholeName: string }) {
  const max = Math.max(1, ...items.map((i) => i.whole));
  return (
    <div class="group">
      <ul class="bar-list part-bars" data-chart={chart}>
        {items.map((i) => (
          <li class={i.highlight ? "highlight" : undefined}>
            <span class="bar-label">{i.label}</span>
            <span class="part-slot">
              <span class="part-track" style={`width:${r2((i.whole / max) * 100)}%`}>
                <span class="part-fill" style={`width:${i.whole ? r2((i.part / i.whole) * 100) : 0}%`} />
              </span>
            </span>
            <span class="num bar-value">{`${i.part} of ${i.whole}`}</span>
          </li>
        ))}
      </ul>
      <p class="keys small muted">
        <span class="key key-fill" /> {partName} <span class="key key-track" /> {wholeName}
      </p>
    </div>
  );
}

/** The "Who plays what" table with each cell shaded by its value (one hue, darker = more).
 *  The number stays in the cell. */
export function HeatMatrix({ players, factions, value, show, legend }: {
  players: PlayerStats[]; factions: FactionStats[]; value: (f: FactionStats, playerKey: string) => number | null;
  show: (v: number) => string; legend: string;
}) {
  const vals = players.flatMap((p) => factions.map((f) => value(f, p.key))).filter((v): v is number => v !== null);
  const max = Math.max(1, ...vals);
  return (
    <div class="group">
      <div class="table-scroll">
        <table class="data-table matrix heat-matrix">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {factions.map((f) => (
                <th scope="col" title={factionName(f.key)}><FactionIcon faction={f.key} size={22} /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr>
                <th scope="row">{p.name}</th>
                {factions.map((f) => {
                  const v = value(f, p.key);
                  if (v === null) return <td class="num muted">·</td>;
                  const heat = Math.round(12 + 68 * (v / max));
                  return <td class={heat > 50 ? "num heat strong" : "num heat"} style={`--heat:${heat}%`} title={`${p.name} · ${factionName(f.key)}: ${show(v)}`}>{show(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="keys small muted">
        <span class="key heat-key-lo" /> {`fewer`} <span class="key heat-key-hi" /> {legend}
      </p>
    </div>
  );
}

export interface RangeRow { key: string; label: string; turnsMs: number[]; highlight?: boolean }

/** Turn length spread per player on one shared axis: whisker fastest–slowest, box the middle
 *  half, tick the median. The highlighted player is in the accent, the rest grey. */
export function TurnRanges({ rows, chart = "C2 C4" }: { rows: RangeRow[]; chart?: string }) {
  const stats = rows.filter((r) => r.turnsMs.length > 0).map((r) => {
    const s = [...r.turnsMs].sort((a, b) => a - b);
    return { ...r, min: s[0]!, q1: quantile(s, 0.25), med: quantile(s, 0.5), q3: quantile(s, 0.75), max: s.at(-1)! };
  });
  if (stats.length === 0) return <p class="small muted">No turns yet.</p>;
  const hiMs = Math.max(...stats.map((s) => s.max));
  const stepMs = hiMs > 6 * 60_000 ? 120_000 : 60_000;
  const axisMax = Math.ceil(hiMs / stepMs) * stepMs;
  const x = (ms: number) => `${r2((ms / axisMax) * 100)}%`;
  const ticks = Array.from({ length: axisMax / stepMs + 1 }, (_, i) => i * stepMs);
  return (
    <ul class="ranges" data-chart={chart}>
      {stats.map((s) => (
        <li class={s.highlight ? "highlight" : undefined}>
          <span class="bar-label">{s.label}</span>
          <span class="range-track" role="img" aria-label={`${s.label}: middle half ${formatTurn(s.q1)} to ${formatTurn(s.q3)}, median ${formatTurn(s.med)}, fastest ${formatTurn(s.min)}, slowest ${formatTurn(s.max)}`} title={`Middle half ${formatTurn(s.q1)}–${formatTurn(s.q3)} · median ${formatTurn(s.med)} · fastest ${formatTurn(s.min)} · slowest ${formatTurn(s.max)}`}>
            <span class="range-whisker" style={`left:${x(s.min)};width:${x(s.max - s.min)}`} />
            <span class="range-box" style={`left:${x(s.q1)};width:${x(Math.max(s.q3 - s.q1, axisMax * 0.006))}`} />
            <span class="range-median" style={`left:${x(s.med)}`} />
          </span>
        </li>
      ))}
      <li class="range-axis-row" aria-hidden="true">
        <span />
        <span class="range-axis">
          {ticks.map((t) => (
            <span style={`left:${x(t)}`}>{t === 0 ? "0" : formatTurn(t)}</span>
          ))}
        </span>
      </li>
    </ul>
  );
}

/** Head to head: my wins grow left from the middle, theirs grow right, on one shared scale. */
export function HeadToHead({ me, rows }: { me: string; rows: { key: string; name: string; together: number; myWins: number; theirWins: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.myWins, r.theirWins)));
  return (
    <div class="group">
      <ul class="h2h" data-chart="W7">
        {rows.map((r) => (
          <li>
            <a class="bar-label" href={playerHref(r.key)}>{r.name}</a>
            <span class="num h2h-n">{String(r.myWins)}</span>
            <span class="h2h-bars" role="img" aria-label={`${me} ${r.myWins}, ${r.name} ${r.theirWins}, in ${plural(r.together, "game")} together`}>
              <span class="h2h-side me"><span class="h2h-fill" style={`width:${r2((r.myWins / max) * 100)}%`} /></span>
              <span class="h2h-side them"><span class="h2h-fill" style={`width:${r2((r.theirWins / max) * 100)}%`} /></span>
            </span>
            <span class="num h2h-n">{String(r.theirWins)}</span>
            <span class="small muted h2h-games">{plural(r.together, "game")}</span>
          </li>
        ))}
      </ul>
      <p class="keys small muted">
        <span class="key key-fill" /> {`${me} won`} <span class="key key-them" /> they won
      </p>
    </div>
  );
}

// =====================================================================================
// The demo page
// =====================================================================================

type Verdict = "Adopt" | "Try" | "Optional";

function Switch({ id, n, title, where, verdict, now, proposed, why }: {
  id: string; n: number; title: string; where: string; verdict: Verdict; now: Child; proposed: Child; why: string;
}) {
  return (
    <section class="switch card" id={id} aria-labelledby={`${id}-title`}>
      <header class="switch-head">
        <span class="switch-meta">
          <span class="label">{`Switch ${n}`}</span>
          <span class={`verdict verdict-${verdict.toLowerCase()}`}>{verdict}</span>
        </span>
        <h2 class="title" id={`${id}-title`}>{title}</h2>
        <p class="small muted">{where}</p>
      </header>
      <div class="switch-cols">
        <div class="switch-col now">
          <span class="label">Now</span>
          {now}
        </div>
        <div class="switch-col proposed">
          <span class="label">Proposed</span>
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
  const overRate = me.limitedTurns > 0 ? me.overLimit / me.limitedTurns : null;
  const facs = playerFactions(me);
  const months = winsByMonth(me);
  const rv = rivals(players, me);
  const sorted = [...me.turnsMs].sort((a, b) => a - b);
  const bySpeed = [...players].sort((a, b) => b.avgTurnMs - a.avgTurnMs);
  const gamesOf = (f: FactionStats, key: string) => f.players.find((x) => x.key === key)?.games ?? null;

  const switches: { id: string; title: string; el: (n: number, id: string, title: string) => Child }[] = [
    {
      id: "win-rate", title: "Win rate tile → ring",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Player page and Faction page: the tiles at the top" verdict="Adopt"
          now={<Tiles><StatTile label="Wins" value={String(me.wins)} /><StatTile label="Win rate" value={rateText(me.wins, me.decided)} /><StatTile label="Avg turn" value={formatAvgTurn(me.avgTurnMs)} /></Tiles>}
          proposed={<Tiles><StatTile label="Wins" value={String(me.wins)} /><RingTile label="Win rate" fraction={winRate(me.wins, me.decided)} caption={`${me.wins} of ${me.decided}`} /><StatTile label="Avg turn" value={formatAvgTurn(me.avgTurnMs)} /></Tiles>}
          why="A win rate is one share of a whole, so a ring shows it with the number still inside. It also separates the rate from the two time tiles next to it." />
      ),
    },
    {
      id: "over-limit", title: "Over-the-limit rate → ring",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Player page and Faction page: Turn limit (inside the row)" verdict="Adopt"
          now={<p class="small">{overRate === null ? "Play with a turn limit to see this." : `${me.overLimit} of ${me.limitedTurns} turns went over the limit, across games that had one.`}</p>}
          proposed={overRate === null ? <p class="small">Play with a turn limit to see this.</p> : (
            <div class="ring-line">
              <Ring fraction={overRate} label="Turns over the limit" tone="over" />
              <p class="small">{`${me.overLimit} of ${me.limitedTurns} turns went over the limit, across games that had one.`}</p>
            </div>
          )}
          why="The same sentence, with a ring in the over-limit colour that turn bars already use, so it reads as the same idea." />
      ),
    },
    {
      id: "players-list", title: "Players list → win-rate ring in each row",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Stats → Players: the list of players" verdict="Try"
          now={<div class="group">{players.slice(0, 4).map((p) => <LinkRow href={playerHref(p.key)} title={p.name} summary={`${plural(p.wins, "win")} · ${rateText(p.wins, p.decided)} · avg turn ${formatAvgTurn(p.avgTurnMs)}`} />)}</div>}
          proposed={<div class="group">{players.slice(0, 4).map((p) => <LinkRow href={playerHref(p.key)} title={p.name} summary={`${plural(p.wins, "win")} · avg turn ${formatAvgTurn(p.avgTurnMs)}`} icon={<Ring fraction={winRate(p.wins, p.decided)} label={`${p.name} win rate`} size={44} />} />)}</div>}
          why="LinkRow already has an icon slot, so this is a one-prop change. Rings down a column make it easy to compare players. The % comes out of the summary because the ring shows it." />
      ),
    },
    {
      id: "time-share", title: "Who used the time → donut",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Game page: next to the Game time and Turn limit tiles" verdict="Optional"
          now={<TimeShare g={g} />}
          proposed={<ShareDonut g={g} />}
          why="The circle version of the stacked bar. On a phone the bar compares close shares better and fits the width. The donut suits the wide layout, where the space beside the tiles is square. Names and % stay in the legend, because the seat colours alone are hard to tell apart (see docs)." />
      ),
    },
    {
      id: "game-card", title: "Game card → thin share bar",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Home (latest game), Day page, Player page (recent games)" verdict="Adopt"
          now={<GameCard g={g} showTime={false} />}
          proposed={<GameCardShare g={g} showTime={false} />}
          why="Who used the time becomes visible before opening the game. The bar has no text: each player row carries its own seat swatch and %." />
      ),
    },
    {
      id: "faction-wins", title: "\"2 of 5\" → pips",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Factions table (also Stats → Games → Seats, where counts pass 12 and it becomes a meter). Shown for ${me.name}.`} verdict="Adopt"
          now={<table class="data-table"><thead><tr><th scope="col">Faction</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Avg turn</th></tr></thead><tbody>{facs.map((f) => <tr><th scope="row"><span class="inline-faction"><FactionIcon faction={f.faction} size={20} />{factionName(f.faction)}</span></th><td class="num">{String(f.games)}</td><td class="num">{String(f.wins)}</td><td class="num">{formatAvgTurn(f.avgTurnMs)}</td></tr>)}</tbody></table>}
          proposed={<table class="data-table"><thead><tr><th scope="col">Faction</th><th scope="col">Wins of games</th><th scope="col">Avg turn</th></tr></thead><tbody>{facs.map((f) => <tr><th scope="row"><span class="inline-faction"><FactionIcon faction={f.faction} size={20} />{factionName(f.faction)}</span></th><td><Tally hits={f.wins} total={f.games} label={`Wins on ${factionName(f.faction)}`} /></td><td class="num">{formatAvgTurn(f.avgTurnMs)}</td></tr>)}</tbody></table>}
          why="Two count columns become one: a dot per game, filled when won. Small counts read faster as dots than as two numbers to divide. Past 12 the dots become a meter bar, and the number always stays next to them." />
      ),
    },
    {
      id: "wins-over-time", title: "Wins over time → wins inside games played",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Wins over time (also Faction page → Wins by player). Shown for ${me.name}.`} verdict="Adopt"
          now={<BarList chart="W8" items={months.map((m) => ({ label: shortMonthLabel(m.month), value: m.wins, display: `${m.wins} of ${m.games}` }))} />}
          proposed={<PartBarList chart="W8" partName="wins" wholeName="games played" items={months.map((m) => ({ label: shortMonthLabel(m.month), part: m.wins, whole: m.games }))} />}
          why="Today the bar shows wins only, so 2 wins out of 2 games and 2 out of 9 look the same. With games as the light bar and wins as the dark part, both the volume and the rate show." />
      ),
    },
    {
      id: "matrix", title: "Who plays what → heatmap",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where="Stats → Players → Who plays what (Games view; Speed and Wins work the same)" verdict="Adopt"
          now={<div class="table-scroll"><table class="data-table matrix"><thead><tr><th scope="col">Player</th>{factions.map((f) => <th scope="col" title={factionName(f.key)}><FactionIcon faction={f.key} size={22} /></th>)}</tr></thead><tbody>{players.map((p) => <tr><th scope="row">{p.name}</th>{factions.map((f) => { const v = gamesOf(f, p.key); return v === null ? <td class="num muted">·</td> : <td class="num">{String(v)}</td>; })}</tr>)}</tbody></table></div>}
          proposed={<HeatMatrix players={players} factions={factions} value={gamesOf} show={String} legend="more games" />}
          why="A grid of numbers is hard to scan. One-hue shading shows each player's comfort factions at a glance, and the numbers stay in the cells." />
      ),
    },
    {
      id: "speed", title: "Speed → turn spread per player",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Speed. Shown for ${me.name}.`} verdict="Try"
          now={<div class="group"><BarList chart="C2" items={bySpeed.map((p) => ({ label: p.name, value: p.avgTurnMs, display: formatAvgTurn(p.avgTurnMs), highlight: p.key === me.key }))} />{sorted.length > 0 ? <p class="small muted" data-chart="C4">{`Middle half of ${me.name}'s turns: ${formatTurn(quantile(sorted, 0.25))} to ${formatTurn(quantile(sorted, 0.75))}. Fastest ${formatTurn(sorted[0]!)}, slowest ${formatTurn(sorted.at(-1)!)}.`}</p> : null}</div>}
          proposed={<TurnRanges rows={bySpeed.map((p) => ({ key: p.key, label: p.name, turnsMs: p.turnsMs, highlight: p.key === me.key }))} />}
          why="Averages hide whether someone is steady or has a few very long turns. One box per player, on one axis, combines the average bars and the middle-half sentence. Hover a row for the numbers." />
      ),
    },
    {
      id: "rivals", title: "Rivals table → head-to-head bars",
      el: (n, id, title) => (
        <Switch id={id} n={n} title={title} where={`Player page → Rivals. Shown for ${me.name}.`} verdict="Try"
          now={<table class="data-table"><thead><tr><th scope="col">Against</th><th scope="col">Games</th><th scope="col">{`${me.name} won`}</th><th scope="col">They won</th></tr></thead><tbody>{rv.map((r) => <tr><th scope="row"><a href={playerHref(r.key)}>{r.name}</a></th><td class="num">{String(r.together)}</td><td class="num">{String(r.myWins)}</td><td class="num">{String(r.theirWins)}</td></tr>)}</tbody></table>}
          proposed={rv.length > 0 ? <HeadToHead me={me.name} rows={rv} /> : <p class="small muted">No shared games yet.</p>}
          why="Who leads is the point of the table. Bars that grow away from a shared middle show it before you read a number." />
      ),
    },
  ];

  return (
    <article class="stack demo">
      <div class="heading">
        <p class="label">Demo · not linked from the app</p>
        <h1 class="display">Visual switches</h1>
        <p class="muted">
          {`Each section puts a component as it is today next to a proposed replacement, drawn from the same data (${plural(games.length, "game")} here). Every change keeps the numbers as text and works without JavaScript. The reasoning is in docs/visual-switches.md.`}
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
export const SWITCH_IDS = ["win-rate", "over-limit", "players-list", "time-share", "game-card", "faction-wins", "wins-over-time", "matrix", "speed", "rivals"] as const;

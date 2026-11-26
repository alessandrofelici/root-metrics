// Shared building blocks, one per Figma component (Components page): Header, Game card,
// Calendar month/day, Stat tile, Row (link / disclosure), Player row, Divider, Back link,
// Winner marker, Chart header, plus the charts. Server-rendered; the only client JS is
// public/app.js, which changes calendar months in place (everything works without it). All text goes
// through JSX interpolation, which escapes it: never use raw() for stored strings.
// Catalogue IDs (C1…W9) go in data-chart attributes only; they are never shown.
import type { Child } from "hono/jsx";
import { html } from "hono/html";
import { factionIconUrl, factionName } from "../factions.js";
import { addMonths, dayLabel, formatAvgTurn, formatTotal, formatTurn, monthLabel, timeLabel } from "../format.js";
import type { GameFacts, PlayerFacts, Snapshot } from "../derive.js";
import { mean } from "../stats.js";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function gameHref(id: string): string {
  return `/games/${encodeURIComponent(id)}`;
}
export function playerHref(key: string): string {
  return `/players/${encodeURIComponent(key)}`;
}
export function factionHref(key: string): string {
  return `/factions/${encodeURIComponent(key)}`;
}

// ---------- Icons (static, trusted markup) ----------
const Svg = ({ children, size = 18 }: { children: Child; size?: number }) => (
  <svg class="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
    {children}
  </svg>
);
export const ChevronRight = () => <Svg size={16}><path d="m9 18 6-6-6-6" /></Svg>;
export const ChevronLeft = () => <Svg size={16}><path d="m15 18-6-6 6-6" /></Svg>;
export const ChevronDown = () => <Svg size={18}><path d="m6 9 6 6 6-6" /></Svg>;
export const HomeIcon = () => <Svg size={18}><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /></Svg>;
const CrownIcon = () => <Svg size={13}><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" /></Svg>;

// ---------- Page shell ----------
export function page(title: string, body: Child, opts: { slide?: "prev" | "next"; styles?: string[] } = {}) {
  return html`<!doctype html>${(
    <html lang="en" data-slide={opts.slide}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <link rel="stylesheet" href="/static/app.css" />
        {(opts.styles ?? []).map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
        <script src="/static/app.js" defer></script>
      </head>
      <body>
        <Header />
        <main class="content">{body}</main>
      </body>
    </html>
  )}`;
}

export function Header() {
  return (
    <header class="site-header">
      <a class="home-link" href="/">
        <HomeIcon />
        <span>Root Metrics</span>
      </a>
      <a class="stats-link" href="/stats">
        <span>Stats</span>
        <ChevronRight />
      </a>
    </header>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a class="back-link" href={href}>
      <ChevronLeft />
      <span>{label}</span>
    </a>
  );
}

export const Divider = () => <hr class="divider" />;

export function WinnerMarker() {
  return (
    <span class="winner">
      <CrownIcon />
      Winner
    </span>
  );
}

export function FactionIcon({ faction, size = 28 }: { faction: string; size?: number }) {
  const src = factionIconUrl(faction);
  if (!src) return <span class="faction-icon unknown" style={`width:${size}px;height:${size}px`} aria-hidden="true"></span>;
  return <img class="faction-icon" src={src} alt="" title={factionName(faction)} width={size} height={size} />;
}

export function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div class="tile">
      <span class="label">{label}</span>
      <span class="num-l">{value}</span>
      {caption ? <span class="small muted">{caption}</span> : null}
    </div>
  );
}

export function Tiles({ children }: { children: Child }) {
  return <div class="tiles">{children}</div>;
}

/** One plain sentence that states a chart's point. The catalogue ID stays in data-chart. */
export function Takeaway({ chart, children }: { chart: string; children: Child }) {
  return (
    <p class="takeaway" data-chart={chart}>
      {children}
    </p>
  );
}

export function LinkRow({ href, title, summary, icon }: { href: string; title: string; summary?: string; icon?: Child }) {
  return (
    <a class="row" href={href}>
      {icon ?? null}
      <span class="row-text">
        <span class="row-title">{title}</span>
        {summary ? <span class="row-summary">{summary}</span> : null}
      </span>
      <ChevronRight />
    </a>
  );
}

export function Disclosure({ title, summary, chart, open, children }: { title: string; summary?: string; chart?: string; open?: boolean; children: Child }) {
  return (
    <details class="disclosure" data-chart={chart} open={open || undefined}>
      <summary class="row">
        <span class="row-text">
          <span class="row-title">{title}</span>
          {summary ? <span class="row-summary">{summary}</span> : null}
        </span>
        <ChevronDown />
      </summary>
      <div class="disclosure-body">{children}</div>
    </details>
  );
}

// ---------- Game card ----------
export function GameCard({ g, showTime }: { g: GameFacts; showTime: boolean }) {
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

// ---------- Calendar ----------
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function CalendarMonth({ month, snap, today }: { month: string; snap: Snapshot; today: string }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const canNext = next <= today.slice(0, 7);
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const anyGames = [...snap.byDay.keys()].some((d) => d.startsWith(month));
  return (
    <section class="card calendar" aria-label={`${monthLabel(month)} calendar`} data-calendar={month}>
      <div class="cal-head">
        <a class="cal-nav" href={`/?month=${prev}&slide=prev`} aria-label="Previous month" data-month={prev} data-dir="prev">
          <ChevronLeft />
        </a>
        <h2 class="cal-title" aria-live="polite">{monthLabel(month)}</h2>
        {canNext ? (
          <a class="cal-nav" href={`/?month=${next}&slide=next`} aria-label="Next month" data-month={next} data-dir="next">
            <ChevronRight />
          </a>
        ) : (
          <span class="cal-nav disabled" aria-hidden="true">
            <ChevronRight />
          </span>
        )}
      </div>
      <div class="cal-grid">
        {WEEKDAY_LETTERS.map((w) => (
          <span class="wd" aria-hidden="true">{w}</span>
        ))}
        {cells.map((d) => {
          if (d === null) return <span class="day blank" />;
          const day = `${month}-${String(d).padStart(2, "0")}`;
          const games = snap.byDay.get(day) ?? [];
          const isToday = day === today;
          const cls = (k: string) => `day ${k}${isToday ? " today" : ""}`;
          if (games.length === 0) return <span class={cls("none")} aria-current={isToday ? "date" : undefined}>{d}</span>;
          if (games.length === 1)
            return (
              <a class={cls("one")} href={gameHref(games[0]!.id)} aria-label={`${dayLabel(day)}, 1 game`} aria-current={isToday ? "date" : undefined}>
                <span>{d}</span>
                <span class="dot" />
              </a>
            );
          return (
            <a class={cls("several")} href={`/days/${day}`} aria-label={`${dayLabel(day)}, ${games.length} games`} aria-current={isToday ? "date" : undefined}>
              <span>{d}</span>
              <span class="count">{games.length}</span>
            </a>
          );
        })}
      </div>
      {anyGames ? null : <p class="small muted cal-empty">No games this month</p>}
    </section>
  );
}

// ---------- Charts ----------
/** Turn-by-turn bars. Over the limit: solid. Within: outlined. A truncated player's last turn
 *  (several turns summed) is dashed and never counted as over. */
export function TurnBars({ p, limitMs, mini = false }: { p: PlayerFacts; limitMs: number | null; mini?: boolean }) {
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
        const note = folded ? " (includes extra turns beyond 128)" : over ? ` (over ${formatTurn(limitMs!)})` : "";
        return (
          <rect class={folded ? "bar folded" : over ? "bar over" : "bar within"} data-turn={mini ? undefined : String(i + 1)} x={r2(left + i * step + (step - bw) / 2)} y={r2(y(ms))} width={r2(bw)} height={r2(Math.max(0.5, y(0) - y(ms)))} rx="1.5">
            <title>{`Turn ${i + 1}: ${formatTurn(ms)}${note}`}</title>
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

/** Who used the time (C6): one stacked bar in seat order, in the four seat colours. */
export function TimeShare({ g }: { g: GameFacts }) {
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

export interface BarItem { label: Child; value: number; display: string; highlight?: boolean }

/** Horizontal bars: label, bar, value. */
export function BarList({ items, chart }: { items: BarItem[]; chart?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul class="bar-list" data-chart={chart}>
      {items.map((i) => (
        <li class={i.highlight ? "highlight" : undefined}>
          <span class="bar-label">{i.label}</span>
          <span class="bar-track">
            <span class="bar-fill" style={`width:${r2((i.value / max) * 100)}%`} />
          </span>
          <span class="num bar-value">{i.display}</span>
        </li>
      ))}
    </ul>
  );
}

/** Average turn length by round (C5). */
export function PaceLine({ series, chart = "C5" }: { series: number[]; chart?: string }) {
  if (series.length < 2) return <p class="small muted">Not enough turns to show a pace.</p>;
  const W = 320, H = 128, left = 34, top = 8, bottom = 18;
  const yMax = Math.ceil(Math.max(...series, 60_000) / 60_000) * 60_000;
  const x = (i: number) => left + (i / (series.length - 1)) * (W - left - 6);
  const y = (ms: number) => top + (H - top - bottom) - (ms / yMax) * (H - top - bottom);
  const pts = series.map((ms, i) => `${r2(x(i))},${r2(y(ms))}`).join(" ");
  return (
    <svg class="chart pace" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Average turn by round, from ${formatAvgTurn(series[0]!)} to ${formatAvgTurn(series.at(-1)!)}`} data-chart={chart}>
      <line class="axis-line" x1={left} x2={W} y1={y(0)} y2={y(0)} />
      <text class="axis" x="0" y={r2(y(yMax) + 4)}>{formatTurn(yMax)}</text>
      <text class="axis" x="0" y={r2(y(0) + 4)}>0</text>
      <polyline class="pace-line" points={pts} />
      {series.map((ms, i) => (
        <circle class="pace-dot" cx={r2(x(i))} cy={r2(y(ms))} r="2.5">
          <title>{`Round ${i + 1}: ${formatAvgTurn(ms)}`}</title>
        </circle>
      ))}
      <text class="axis" x={left} y={H - 4}>Round 1</text>
      <text class="axis" x={W} y={H - 4} text-anchor="end">{`Round ${series.length}`}</text>
    </svg>
  );
}

/** Win rate against average turn (W9). */
export function Scatter({ points, chart = "W9" }: { points: { label: string; avgMs: number; rate: number }[]; chart?: string }) {
  if (points.length === 0) return <p class="small muted">No games with a known winner yet.</p>;
  const W = 320, H = 200, left = 34, right = 12, top = 10, bottom = 30;
  const xs = points.map((p) => p.avgMs);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const span = Math.max(hi - lo, 30_000);
  const x0 = lo - span * 0.15, x1 = hi + span * 0.15;
  const x = (ms: number) => left + ((ms - x0) / (x1 - x0)) * (W - left - right);
  const y = (rate: number) => top + (1 - rate) * (H - top - bottom);
  return (
    <svg class="chart scatter" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Win rate against average turn" data-chart={chart}>
      <line class="axis-line" x1={left} x2={W - right} y1={y(0)} y2={y(0)} />
      <line class="axis-line" x1={left} x2={left} y1={top} y2={y(0)} />
      <text class="axis" x="0" y={r2(y(1) + 4)}>100%</text>
      <text class="axis" x="0" y={r2(y(0) + 4)}>0%</text>
      <text class="axis" x={left} y={H - 6}>{`faster · ${formatAvgTurn(lo)}`}</text>
      <text class="axis" x={W - right} y={H - 6} text-anchor="end">{`${formatAvgTurn(hi)} · slower`}</text>
      {points.map((p) => (
        <g>
          <circle class="scatter-dot" cx={r2(x(p.avgMs))} cy={r2(y(p.rate))} r="4">
            <title>{`${p.label}: ${Math.round(p.rate * 100)}% wins, ${formatAvgTurn(p.avgMs)} per turn`}</title>
          </circle>
          <text class="scatter-label" x={r2(x(p.avgMs) + 6)} y={r2(y(p.rate) - 6)}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ---------- Players on the game page ----------
export function playerAvgTurnMs(p: PlayerFacts): number {
  return mean(p.countedTurnsMs);
}

function PlayerStatsLine({ p, limitMs }: { p: PlayerFacts; limitMs: number | null }) {
  return (
    <span class="player-stats">
      <span class="mini-stat">
        <span class="label">Total</span>
        <span class="num">{formatTotal(p.totalMs)}</span>
      </span>
      <span class="mini-stat">
        <span class="label">Avg turn</span>
        <span class="num">{formatAvgTurn(playerAvgTurnMs(p))}</span>
      </span>
      {limitMs !== null ? (
        <span class="mini-stat">
          <span class="label">{`Over ${formatTurn(limitMs)}`}</span>
          <span class="num">{`${p.overLimit} of ${p.countedTurnsMs.length}`}</span>
        </span>
      ) : null}
    </span>
  );
}

/** Narrow screens: one expandable row per player. */
export function PlayerRow({ p, limitMs, open = false }: { p: PlayerFacts; limitMs: number | null; open?: boolean }) {
  return (
    <details class="card player-row" open={open || undefined}>
      <summary>
        <span class="player-head">
          <FactionIcon faction={p.faction} />
          <span class="player-names">
            <a class="player-name" href={playerHref(p.key)}>{p.nickname}</a>
            <span class="small muted">{factionName(p.faction)}</span>
          </span>
          {p.won ? <WinnerMarker /> : null}
          <ChevronDown />
        </span>
        <PlayerStatsLine p={p} limitMs={limitMs} />
      </summary>
      <TurnBars p={p} limitMs={limitMs} />
    </details>
  );
}

/** Wide screens: every player is one table row with inline turn bars (Prototype B). */
export function PlayersTable({ g }: { g: GameFacts }) {
  return (
    <table class="players-table card">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Total</th>
          <th scope="col">Avg turn</th>
          {g.limitMs !== null ? <th scope="col">{`Over ${formatTurn(g.limitMs)}`}</th> : null}
          <th scope="col">Turns</th>
        </tr>
      </thead>
      <tbody>
        {g.players.map((p) => (
          <tr>
            <th scope="row">
              <span class="player-cell">
                <span class={`dot seat-${p.seat}`} />
                <FactionIcon faction={p.faction} />
                <a class="player-name" href={playerHref(p.key)}>{p.nickname}</a>
                {p.won ? <WinnerMarker /> : null}
              </span>
            </th>
            <td class="num">{formatTotal(p.totalMs)}</td>
            <td class="num">{formatAvgTurn(playerAvgTurnMs(p))}</td>
            {g.limitMs !== null ? <td class="num">{`${p.overLimit} of ${p.countedTurnsMs.length}`}</td> : null}
            <td>
              <TurnBars p={p} limitMs={g.limitMs} mini />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

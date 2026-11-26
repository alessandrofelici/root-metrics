// One component per screen on the Figma "Screens" page. Each shows a few numbers first and
// keeps the rest in collapsed rows (Apple-style progressive disclosure, no client JS).
import { factionName } from "../factions.js";
import { dayLabel, formatAvgTurn, formatPercent, formatTotal, formatTurn, shortDayLabel, shortMonthLabel, timeLabel } from "../format.js";
import { sharesDay, type GameFacts, type Snapshot } from "../derive.js";
import {
  factionStats, lengthBuckets, mean, paceByRound, playerFactions, playerStats, quantile, records, rivals, seatStats,
  statGames, streak, totals, trend, winRate, winsByMonth, type FactionStats, type PlayerStats, type Trend,
} from "../stats.js";
import {
  BackLink, BarList, CalendarMonth, Disclosure, Divider, FactionIcon, GameCard, LinkRow, PaceLine, PlayerRow,
  PlayersTable, Scatter, StatTile, Takeaway, Tiles, TimeShare, factionHref, gameHref, playerHref,
} from "./ui.js";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rateText = (wins: number, decided: number) => { const r = winRate(wins, decided); return r === null ? "–" : formatPercent(r); };
const trendSentence = (t: Trend, what: string) =>
  t === "longer" ? `Turns got longer as ${what} went on` : t === "shorter" ? `Turns got shorter as ${what} went on` : `Turns stayed about the same through ${what}`;

// ---------- Home ----------
export function HomePage({ snap, month, today }: { snap: Snapshot; month: string; today: string }) {
  const latest = snap.latest;
  if (!latest) {
    return (
      <div class="empty">
        <h1 class="title">No games yet</h1>
        <p class="muted">Finish a game on the rootclock board and it appears here.</p>
      </div>
    );
  }
  const sameDay = snap.byDay.get(latest.day) ?? [latest];
  const more = sameDay.length - 1;
  return (
    <div class="home">
      <h1 class="visually-hidden">Root Metrics</h1>
      <section class="home-latest">
        <h2 class="label">Latest game</h2>
        <GameCard g={latest} showTime={sameDay.length > 1} />
        {more > 0 ? <a class="more-link" href={`/days/${latest.day}`}>{`${plural(more, "more game", "more games")} that day`}</a> : null}
      </section>
      <section class="home-calendar">
        <CalendarMonth month={month} snap={snap} today={today} />
      </section>
      <div class="home-actions">
        <a class="button" href="/stats">View stats</a>
      </div>
    </div>
  );
}

// ---------- Day ----------
export function DayPage({ day, games }: { day: string; games: GameFacts[] }) {
  return (
    <div class="stack">
      <div class="heading">
        <BackLink href={`/?month=${day.slice(0, 7)}`} label="Calendar" />
        <h1 class="display">{dayLabel(day)}</h1>
        <p class="small muted">{plural(games.length, "game")}</p>
      </div>
      <div class="card-list">
        {games.map((g) => (
          <GameCard g={g} showTime />
        ))}
      </div>
    </div>
  );
}

// ---------- Game ----------
export function GamePage({ g, snap }: { g: GameFacts; snap: Snapshot }) {
  const multi = sharesDay(snap, g);
  const back = multi ? { href: `/days/${g.day}`, label: shortDayLabel(g.day) } : { href: `/?month=${g.month}`, label: "Calendar" };
  const notes = [...g.warnings, ...g.players.filter((p) => p.truncated).map((p) => `${p.nickname}'s last turn includes extra turns beyond 128.`)];
  const pace = paceByRound(g.players);
  return (
    <article class="stack game">
      <div class="heading">
        <BackLink href={back.href} label={back.label} />
        <h1 class="display">{dayLabel(g.day)}</h1>
        {multi ? <p class="small muted">{timeLabel(g.hour, g.minute)}</p> : null}
        {g.winnerSeat === null ? (
          <p class="winner-null">
            <span class="label">Winner</span> <span class="num">NULL</span>
            <span class="small muted">A player passed 128 turns, so the winner can't be worked out.</span>
          </p>
        ) : null}
      </div>
      <div class="game-summary">
        <Tiles>
          <StatTile label="Game time" value={formatTotal(g.globalMs)} />
          <StatTile label="Turn limit" value={g.limitMs === null ? "None" : formatTurn(g.limitMs)} />
        </Tiles>
        <TimeShare g={g} />
      </div>
      <section class="players">
        <h2 class="label">Players · seat order</h2>
        <div class="player-list narrow-only">
          {g.players.map((p) => (
            <PlayerRow p={p} limitMs={g.limitMs} open={p.won === true} />
          ))}
        </div>
        <div class="wide-only">
          <PlayersTable g={g} />
        </div>
      </section>
      <div class="group">
        <Disclosure title="Pace through the game" summary={trendSentence(trend(pace), "the game")} chart="C5">
          <PaceLine series={pace} />
        </Disclosure>
        {notes.length > 0 ? (
          <Disclosure title="Data notes" summary={plural(notes.length, "note")}>
            <ul class="notes">
              {notes.map((n) => (
                <li>{n}</li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
      </div>
    </article>
  );
}

// ---------- Stats hub ----------
export function StatsPage({ snap }: { snap: Snapshot }) {
  const games = statGames(snap);
  const rec = records(games);
  const t = totals(games);
  const players = playerStats(games);
  const factions = factionStats(games);
  if (!rec) {
    return (
      <div class="stack">
        <h1 class="display">Stats</h1>
        <p class="muted">Stats appear after the first game with two or more players.</p>
      </div>
    );
  }
  const first = games.at(-1)!;
  const leader = players[0];
  const topFaction = factions[0];
  return (
    <div class="stack">
      <div class="heading">
        <h1 class="display">Stats</h1>
        <p class="small muted">{`${plural(t.games, "game")} since ${dayLabel(first.day)}`}</p>
      </div>
      <section class="group" data-chart="C13">
        <h2 class="label">Records</h2>
        <div class="records">
          <a class="card record" href={gameHref(rec.longestTurn.game.id)}>
            <StatTile label="Longest turn" value={formatTurn(rec.longestTurn.ms)} caption={`${rec.longestTurn.nickname} · ${shortDayLabel(rec.longestTurn.game.day)} →`} />
          </a>
          <a class="card record" href={gameHref(rec.longestGame.game.id)}>
            <StatTile label="Longest game" value={formatTotal(rec.longestGame.ms)} caption={`${shortDayLabel(rec.longestGame.game.day)} →`} />
          </a>
          <a class="card record" href={gameHref(rec.mostTurns.game.id)}>
            <StatTile label="Most turns" value={String(rec.mostTurns.count)} caption={`${shortDayLabel(rec.mostTurns.game.day)} →`} />
          </a>
        </div>
      </section>
      <Divider />
      <section class="group">
        <h2 class="label">Explore</h2>
        <div class="explore">
          <LinkRow href="/stats/games" title="Games" summary={`${plural(t.games, "game")} · ${formatTotal(t.tableMs)} at the table`} />
          <LinkRow href="/stats/players" title="Players" summary={`${plural(players.length, "player")}${leader && leader.wins > 0 ? ` · ${leader.name} leads with ${plural(leader.wins, "win")}` : ""}`} />
          <LinkRow href="/stats/factions" title="Factions" summary={`${plural(factions.length, "faction")} played${topFaction && topFaction.wins > 0 ? ` · ${factionName(topFaction.key)} wins most` : ""}`} />
        </div>
      </section>
    </div>
  );
}

// ---------- Games stats ----------
export function GamesStatsPage({ snap }: { snap: Snapshot }) {
  const games = statGames(snap);
  const buckets = lengthBuckets(games);
  const top = [...buckets].sort((a, b) => b.count - a.count)[0];
  const seats = seatStats(games);
  const bestSeat = [...seats].sort((a, b) => b.wins - a.wins)[0];
  const pace = paceByRound(games.flatMap((g) => g.players));
  const avgTurns = mean(games.map((g) => g.turnCount));
  return (
    <div class="stack">
      <div class="heading">
        <BackLink href="/stats" label="Stats" />
        <h1 class="display">Games</h1>
      </div>
      <Tiles>
        <StatTile label="Games" value={String(games.length)} />
      </Tiles>
      {top ? (
        <section class="group" data-chart="C1">
          <Takeaway chart="C1">{`Most games run ${formatTotal(top.fromMs)} to ${formatTotal(top.toMs)}.`}</Takeaway>
          <BarList chart="C1" items={buckets.map((b) => ({ label: `${formatTotal(b.fromMs)}–${formatTotal(b.toMs)}`, value: b.count, display: String(b.count) }))} />
        </section>
      ) : null}
      <Divider />
      <div class="group">
        <Disclosure title="Turns per game" summary={`${Math.round(avgTurns)} on average`} chart="C15">
          <BarList chart="C15" items={games.slice(0, 10).map((g) => ({ label: shortDayLabel(g.day), value: g.turnCount, display: String(g.turnCount) }))} />
        </Disclosure>
        <Disclosure title="Seats" summary={bestSeat && bestSeat.wins > 0 ? `Seat ${bestSeat.seat} has won ${bestSeat.wins} of ${bestSeat.decided}` : "Time and wins by seat"} chart="C8 W5">
          <table class="data-table">
            <thead><tr><th scope="col">Seat</th><th scope="col">Avg turn</th><th scope="col">Wins</th></tr></thead>
            <tbody>
              {seats.map((s) => (
                <tr><th scope="row">{String(s.seat)}</th><td class="num">{formatAvgTurn(s.avgTurnMs)}</td><td class="num">{`${s.wins} of ${s.decided}`}</td></tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
        <Disclosure title="Pace through a game" summary={trendSentence(trend(pace), "a game")} chart="C5">
          <PaceLine series={pace} />
        </Disclosure>
      </div>
    </div>
  );
}

// ---------- Players ----------
type MatrixView = "games" | "speed" | "wins";

export function PlayersPage({ snap, view }: { snap: Snapshot; view: MatrixView | undefined }) {
  const games = statGames(snap);
  const players = playerStats(games);
  const factions = factionStats(games);
  const points = players.filter((p) => p.decided > 0).map((p) => ({ label: p.name, avgMs: p.avgTurnMs, rate: p.wins / p.decided }));
  const v: MatrixView = view ?? "games";
  return (
    <div class="stack">
      <div class="heading">
        <BackLink href="/stats" label="Stats" />
        <h1 class="display">Players</h1>
        <p class="small muted">Most wins first</p>
      </div>
      <div class="group">
        {players.map((p) => (
          <LinkRow href={playerHref(p.key)} title={p.name} summary={`${plural(p.wins, "win")} · ${rateText(p.wins, p.decided)} · avg turn ${formatAvgTurn(p.avgTurnMs)}`} />
        ))}
      </div>
      <Divider />
      <div class="group">
        <Disclosure title="Win rate against speed" summary={speedSummary(points)} chart="W9">
          <Scatter points={points} />
        </Disclosure>
        <Disclosure title="Who plays what" summary="Games, speed and wins for each player and faction" chart="C9 C10 W4" open={view !== undefined}>
          <nav class="segmented" aria-label="Show">
            {(["games", "speed", "wins"] as const).map((k) => (
              <a href={`/stats/players?view=${k}`} aria-current={k === v ? "true" : undefined}>{k === "games" ? "Games" : k === "speed" ? "Speed" : "Wins"}</a>
            ))}
          </nav>
          <div class="table-scroll">
            <table class="data-table matrix">
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
                      const fp = f.players.find((x) => x.key === p.key);
                      if (!fp) return <td class="num muted">·</td>;
                      return <td class="num">{v === "games" ? String(fp.games) : v === "wins" ? String(fp.wins) : formatAvgTurn(mean(fp.turnsMs))}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

function speedSummary(points: { avgMs: number; rate: number }[]): string {
  if (points.length < 2) return "Needs two players with finished games";
  const byRate = [...points].sort((a, b) => b.rate - a.rate);
  const fastest = Math.min(...points.map((p) => p.avgMs));
  return byRate[0]!.avgMs === fastest ? "The fastest player wins most" : "Faster players haven't won more yet";
}

// ---------- Player ----------
export function PlayerPage({ me, all, snap }: { me: PlayerStats; all: PlayerStats[]; snap: Snapshot }) {
  const last5 = me.results.filter((r) => r.player.won !== null).slice(0, 5);
  const won5 = last5.filter((r) => r.player.won).length;
  const st = streak(me.results);
  const sorted = [...me.turnsMs].sort((a, b) => a - b);
  const speedRank = [...all].sort((a, b) => b.avgTurnMs - a.avgTurnMs).findIndex((p) => p.key === me.key);
  const facs = playerFactions(me);
  const best = facs.find((f) => f.wins > 0);
  const rv = rivals(all, me);
  const months = winsByMonth(me);
  const overRate = me.limitedTurns > 0 ? me.overLimit / me.limitedTurns : null;
  return (
    <div class="stack">
      <div class="heading">
        <BackLink href="/stats/players" label="Players" />
        <h1 class="display">{me.name}</h1>
      </div>
      <Tiles>
        <StatTile label="Wins" value={String(me.wins)} />
        <StatTile label="Win rate" value={rateText(me.wins, me.decided)} />
        <StatTile label="Avg turn" value={formatAvgTurn(me.avgTurnMs)} />
      </Tiles>
      {last5.length > 0 ? (
        <section class="group" data-chart="W6">
          <Takeaway chart="W6">{`${me.name} won ${won5} of the last ${plural(last5.length, "game")}.`}</Takeaway>
          <ol class="form-strip" aria-label="Last results, newest first">
            {last5.map((r) => (
              <li class={r.player.won ? "won" : "lost"}>
                <a href={gameHref(r.game.id)} title={dayLabel(r.game.day)}>{r.player.won ? "Won" : "Lost"}</a>
              </li>
            ))}
          </ol>
          {st ? <p class="small muted">{`Current streak: ${plural(st.count, st.kind)}`}</p> : null}
        </section>
      ) : null}
      <Divider />
      <div class="group">
        <Disclosure title="Speed" summary={all.length > 1 ? (speedRank === 0 ? `Slowest of the ${all.length}` : speedRank === all.length - 1 ? `Fastest of the ${all.length}` : `Avg turn ${formatAvgTurn(me.avgTurnMs)}`) : `Avg turn ${formatAvgTurn(me.avgTurnMs)}`} chart="C2 C4">
          <BarList chart="C2" items={[...all].sort((a, b) => b.avgTurnMs - a.avgTurnMs).map((p) => ({ label: p.name, value: p.avgTurnMs, display: formatAvgTurn(p.avgTurnMs), highlight: p.key === me.key }))} />
          {sorted.length > 0 ? (
            <p class="small muted" data-chart="C4">{`Middle half of ${me.name}'s turns: ${formatTurn(quantile(sorted, 0.25))} to ${formatTurn(quantile(sorted, 0.75))}. Fastest ${formatTurn(sorted[0]!)}, slowest ${formatTurn(sorted.at(-1)!)}.`}</p>
          ) : null}
        </Disclosure>
        <Disclosure title="Turn limit" summary={overRate === null ? "No games with a turn limit yet" : `Over the limit on ${formatPercent(overRate)} of turns`} chart="C7">
          <p class="small">{overRate === null ? "Play with a turn limit to see this." : `${me.overLimit} of ${me.limitedTurns} turns went over the limit, across games that had one.`}</p>
        </Disclosure>
        <Disclosure title="Factions" summary={`Played ${facs.length}${best ? ` · best on ${factionName(best.faction)}` : ""}`} chart="C9 C10 W4">
          <table class="data-table">
            <thead><tr><th scope="col">Faction</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Avg turn</th></tr></thead>
            <tbody>
              {facs.map((f) => (
                <tr>
                  <th scope="row"><a class="inline-faction" href={factionHref(f.faction)}><FactionIcon faction={f.faction} size={20} />{factionName(f.faction)}</a></th>
                  <td class="num">{String(f.games)}</td><td class="num">{String(f.wins)}</td><td class="num">{formatAvgTurn(f.avgTurnMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
        <Disclosure title="Rivals" summary={rv[0] ? `${rv[0].myWins > rv[0].theirWins ? "Beats" : rv[0].myWins < rv[0].theirWins ? "Trails" : "Level with"} ${rv[0].name} ${rv[0].myWins} to ${rv[0].theirWins}` : "No shared games yet"} chart="W7">
          <table class="data-table">
            <thead><tr><th scope="col">Against</th><th scope="col">Games</th><th scope="col">{`${me.name} won`}</th><th scope="col">They won</th></tr></thead>
            <tbody>
              {rv.map((r) => (
                <tr><th scope="row"><a href={playerHref(r.key)}>{r.name}</a></th><td class="num">{String(r.together)}</td><td class="num">{String(r.myWins)}</td><td class="num">{String(r.theirWins)}</td></tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
        <Disclosure title="Wins over time" summary={months.length ? `${plural(months.at(-1)!.wins, "win")} in ${shortMonthLabel(months.at(-1)!.month)}` : "No games yet"} chart="W8">
          <BarList chart="W8" items={months.map((m) => ({ label: shortMonthLabel(m.month), value: m.wins, display: `${m.wins} of ${m.games}` }))} />
        </Disclosure>
      </div>
      <Divider />
      <section class="group">
        <h2 class="label">Recent games</h2>
        <div class="card-list">
          {me.results.slice(0, 3).map((r) => (
            <GameCard g={r.game} showTime={sharesDay(snap, r.game)} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- Factions ----------
function factionSummary(f: FactionStats): string {
  return `${plural(f.games, "game")} · ${f.wins === 0 ? "no wins" : plural(f.wins, "win")} · avg turn ${formatAvgTurn(f.avgTurnMs)}`;
}

export function FactionsPage({ snap }: { snap: Snapshot }) {
  const factions = factionStats(statGames(snap));
  const shown = factions.slice(0, 6);
  const rest = factions.slice(6);
  const points = factions.filter((f) => f.decided > 0).map((f) => ({ label: factionName(f.key), avgMs: f.avgTurnMs, rate: f.wins / f.decided }));
  return (
    <div class="stack">
      <div class="heading">
        <BackLink href="/stats" label="Stats" />
        <h1 class="display">Factions</h1>
        <p class="small muted">Most wins first · only factions you've played</p>
      </div>
      <div class="group">
        {shown.map((f) => (
          <LinkRow href={factionHref(f.key)} title={factionName(f.key)} summary={factionSummary(f)} icon={<FactionIcon faction={f.key} />} />
        ))}
      </div>
      <Divider />
      <div class="group">
        {rest.length > 0 ? (
          <Disclosure title={plural(rest.length, "more faction", "more factions")} summary={rest.every((f) => f.wins === 0) ? "Played but not won yet" : "Fewer wins"}>
            <div class="group">
              {rest.map((f) => (
                <LinkRow href={factionHref(f.key)} title={factionName(f.key)} summary={factionSummary(f)} icon={<FactionIcon faction={f.key} />} />
              ))}
            </div>
          </Disclosure>
        ) : null}
        <Disclosure title="Win rate against speed" summary={points.length > 1 ? "Each faction's wins and average turn" : "Needs more finished games"} chart="W9">
          <Scatter points={points} />
        </Disclosure>
      </div>
    </div>
  );
}

export function FactionPage({ f }: { f: FactionStats }) {
  const overRate = f.limitedTurns > 0 ? f.overLimit / f.limitedTurns : null;
  const byGames = f.players;
  return (
    <div class="stack">
      <div class="heading">
        <BackLink href="/stats/factions" label="Factions" />
        <h1 class="display title-with-icon">
          <FactionIcon faction={f.key} size={36} />
          <span>{factionName(f.key)}</span>
        </h1>
      </div>
      <Tiles>
        <StatTile label="Games" value={String(f.games)} />
        <StatTile label="Win rate" value={rateText(f.wins, f.decided)} />
        <StatTile label="Avg turn" value={formatAvgTurn(f.avgTurnMs)} />
      </Tiles>
      <Divider />
      <div class="group">
        <Disclosure title="Who plays it" summary={byGames.length === 1 ? `Only ${byGames[0]!.name} so far` : `${plural(byGames.length, "player")} · most often ${byGames[0]!.name}`} chart="C9">
          <BarList chart="C9" items={byGames.map((p) => ({ label: p.name, value: p.games, display: String(p.games) }))} />
        </Disclosure>
        <Disclosure title="Speed by player" summary={byGames.map((p) => `${p.name}: ${formatAvgTurn(mean(p.turnsMs))}`).slice(0, 2).join(" · ")} chart="C10">
          <BarList chart="C10" items={byGames.map((p) => ({ label: p.name, value: mean(p.turnsMs), display: formatAvgTurn(mean(p.turnsMs)) }))} />
        </Disclosure>
        <Disclosure title="Wins by player" summary={f.wins === 0 ? "No wins yet" : byGames.filter((p) => p.wins > 0).map((p) => `${p.name} ${p.wins} of ${p.games}`).join(" · ")} chart="W4">
          <BarList chart="W4" items={byGames.map((p) => ({ label: p.name, value: p.wins, display: `${p.wins} of ${p.games}` }))} />
        </Disclosure>
        <Disclosure title="Turn limit" summary={overRate === null ? "No games with a turn limit yet" : `Over the limit on ${formatPercent(overRate)} of turns`} chart="C7">
          <p class="small">{overRate === null ? "Play with a turn limit to see this." : `${f.overLimit} of ${f.limitedTurns} turns went over the limit.`}</p>
        </Disclosure>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div class="empty">
      <h1 class="title">Not found</h1>
      <p><a href="/">Back to the calendar</a></p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { UiButton, UiCard, UiEmptyState, UiInput, UiLinkButton, UiLoadingState, UiStatus } from "../../components/ui/primitives";
import { SEASON_DRAFT_STORAGE_KEY, parseSeasonDraft, seasonPricing, seasonSquadSummary, type SeasonTeam } from "@/lib/cbbSeason";
import { DEMO_DAYS, createSeasonStandingsDemo, demoDayEnd, demoDayStart } from "@/lib/cbbSeasonDemo";
import { SEASON_TIME_ZONE, calculateSeasonStandings, isSeasonGame, recordPercentage, seasonDayKey, seasonGameScenario, seasonGameState, seasonGameWinner, seasonTeamRecords, type RecordLine, type SeasonSquad, type SeasonStanding } from "@/lib/cbbSeasonStandings";
import styles from "./standings.module.css";

const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(2)}%`;
const record = (r: RecordLine) => `${r.wins}–${r.losses}`;
const rank = (n: number | null) => n === null ? "Unranked" : `#${n}`;
const dayLabel = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: SEASON_TIME_ZONE, month: "short", day: "numeric" }).format(new Date(date));
const gameTime = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: SEASON_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(date));
type History = Array<{ date: string; rows: SeasonStanding[] }>;

function Movement({ row }: { row: SeasonStanding }) {
  return <span className={styles.movement} data-direction={row.movement === null ? "new" : row.movement > 0 ? "up" : row.movement < 0 ? "down" : "flat"}
    title={row.movement === null ? "No ranked position before this sample day" : `${Math.abs(row.movement)} places ${row.movement >= 0 ? "up" : "down"} since the start of this sample day`}>
    {row.movement === null ? "New" : row.movement > 0 ? `↑ ${row.movement}` : row.movement < 0 ? `↓ ${Math.abs(row.movement)}` : "—"}
  </span>;
}

function RaceChart({ history, focused }: { history: History; focused: SeasonStanding }) {
  const squadCount = history[history.length - 1]?.rows.length ?? 1;
  const points = (id: string) => history.flatMap((snapshot, index) => {
    const position = snapshot.rows.find(row => row.id === id)?.rank;
    return position === null || position === undefined ? [] : [{ x: 30 + index / Math.max(1, history.length - 1) * 570, y: 20 + (position - 1) / Math.max(1, squadCount - 1) * 130 }];
  });
  return <UiCard className={styles.race}>
    <div className={styles.sectionHeading}><div><span className={styles.kicker}>THE LONG GAME</span><h2>The race so far</h2></div><span>{focused.squad.name} highlighted</span></div>
    <svg viewBox="0 0 640 185" role="img" aria-labelledby="season-race-title season-race-description">
      <title id="season-race-title">{`Sample rank history for ${focused.squad.name}`}</title>
      <desc id="season-race-description">Higher positions are closer to first place. The highlighted line follows the selected squad. Exact ranks and records are in the expandable table below.</desc>
      {[20, 85, 150].map(y => <line key={y} x1="30" x2="600" y1={y} y2={y} className={styles.chartGrid} />)}
      <text x="4" y="24">1</text><text x="4" y="154">{squadCount}</text>
      {history[history.length - 1]?.rows.filter(row => row.id !== focused.id).map(row => <polyline key={row.id} points={points(row.id).map(p => `${p.x},${p.y}`).join(" ")} className={styles.otherLine} />)}
      <polyline points={points(focused.id).map(p => `${p.x},${p.y}`).join(" ")} className={styles.focusLine} />
      {points(focused.id).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" className={styles.chartDot} />)}
      <text x="30" y="178">{dayLabel(history[0].date)}</text><text x="600" y="178" textAnchor="end">{dayLabel(history[history.length - 1].date)}</text>
    </svg>
    <details><summary>Read {focused.squad.name}’s rank history</summary><div className={styles.tableScroll}><table><caption>Sample daily ranks and combined records</caption><thead><tr><th>Day</th><th>Rank</th><th>Record</th><th>Win %</th></tr></thead><tbody>{history.map(snapshot => {
      const row = snapshot.rows.find(r => r.id === focused.id)!;
      return <tr key={snapshot.date}><th scope="row">{dayLabel(snapshot.date)}</th><td>{rank(row.rank)}</td><td>{record(row)}</td><td>{pct(row.percentage)}</td></tr>;
    })}</tbody></table></div></details>
  </UiCard>;
}

export default function SeasonStandingsPreview({ teams }: { teams: SeasonTeam[] }) {
  const demo = useMemo(() => createSeasonStandingsDemo(teams), [teams]);
  const [day, setDay] = useState(DEMO_DAYS - 1);
  const [replay, setReplay] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState(demo.squads[0].id);
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState<SeasonSquad | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const [includeMine, setIncludeMine] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(SEASON_DRAFT_STORAGE_KEY);
        const draft = raw ? parseSeasonDraft(raw, teams) : null;
        const picks = draft?.teamIds.map(id => teams.find(t => t.id === id)!) ?? [];
        setMine(draft && seasonSquadSummary(picks).complete ? { id: "your-local-squad", name: draft.name, owner: "You · local draft", teamIds: draft.teamIds, isLocal: true } : null);
        setDraftError(false);
      } catch { setDraftError(true); setMine(null); }
      setDraftLoaded(true);
    };
    const timer = window.setTimeout(load, 0);
    const changed = (event: StorageEvent) => { if (event.key === SEASON_DRAFT_STORAGE_KEY || event.key === null) load(); };
    window.addEventListener("storage", changed);
    return () => { clearTimeout(timer); window.removeEventListener("storage", changed); };
  }, [teams]);

  const frames = useMemo(() => {
    const times = [...new Set(demo.games.filter(g => g.status === "final" && g.completedAt && seasonDayKey(g.completedAt) === seasonDayKey(demoDayEnd(day))).map(g => g.completedAt!))].sort();
    return [demoDayStart(day), ...new Set(Array.from({ length: Math.min(12, times.length) }, (_, i) => times[Math.ceil((i + 1) * times.length / Math.min(12, times.length)) - 1]))];
  }, [day, demo.games]);
  useEffect(() => {
    if (replay === null) return;
    const timer = window.setTimeout(() => setReplay(replay + 1 >= frames.length ? null : replay + 1), 1100);
    return () => clearTimeout(timer);
  }, [replay, frames.length]);

  const asOf = replay === null ? demoDayEnd(day) : frames[Math.min(replay, frames.length - 1)];
  const squads = useMemo(() => includeMine && mine ? [...demo.squads, mine] : demo.squads, [demo.squads, includeMine, mine]);
  const standings = useMemo(() => calculateSeasonStandings(squads, demo.games, asOf), [squads, demo.games, asOf]);
  const rows = standings.rows;
  const focused = rows.find(row => row.id === focusedId) ?? rows[0];
  const history = useMemo(() => Array.from({ length: day + 1 }, (_, index) => ({ date: demoDayEnd(index), rows: calculateSeasonStandings(squads, demo.games, index === day ? asOf : demoDayEnd(index)).rows })), [day, squads, demo.games, asOf]);
  const visibleRows = rows.filter(row => `${row.squad.name} ${row.squad.owner}`.toLowerCase().includes(search.toLowerCase().trim()));
  const teamMap = useMemo(() => new Map(teams.map(team => [team.id, team])), [teams]);
  const details = useMemo(() => seasonTeamRecords(focused.squad.teamIds, demo.games, asOf).map(result => ({ ...result, team: teamMap.get(result.id)! })), [focused.squad.teamIds, demo.games, asOf, teamMap]);
  const standout = details.filter(r => r.team.bandIndex >= 2 && r.wins + r.losses >= 3).sort((a, b) => (recordPercentage(b) ?? 0) - (recordPercentage(a) ?? 0) || b.wins - a.wins)[0];
  const climber = [...rows].filter(r => (r.movement ?? 0) > 0).sort((a, b) => b.movement! - a.movement!)[0];
  const hot = [...rows].filter(r => r.week.wins + r.week.losses >= 3).sort((a, b) => (recordPercentage(b.week) ?? 0) - (recordPercentage(a.week) ?? 0))[0];
  const leader = rows.find(r => r.rank === 1);
  const watch = useMemo(() => demo.games.filter(g => focused.squad.teamIds.some(id => id === g.awayTeamId || id === g.homeTeamId)
    && ["scheduled", "live"].includes(seasonGameState(g, asOf))).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 3), [demo.games, focused.squad.teamIds, asOf]);
  const recentFinals = useMemo(() => demo.games.filter(g => isSeasonGame(g) && seasonGameState(g, asOf) === "final" && seasonGameWinner(g)
    && focused.squad.teamIds.some(id => id === g.awayTeamId || id === g.homeTeamId))
    .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!)).slice(0, 3), [demo.games, focused.squad.teamIds, asOf]);

  function selectDay(next: number) { setDay(next); setReplay(null); }

  return <>
    <header className={styles.hero}><div><span className={styles.kicker}>2026–27 · SAMPLE LEAGUE</span><h1>Every night.<br /><span>A new leaderboard.</span></h1><p>Your squad’s combined winning percentage tells the story. Follow the climb, find your difference makers, and see what the next final could change.</p></div><div className={styles.heroScore}><span>SELECTED SQUAD</span><strong>{rank(focused.rank)}</strong><span>{focused.squad.name}</span><small>{pct(focused.percentage)} · {record(focused)}</small></div></header>
    <UiStatus tone="info"><strong>Playable preview · fictional results.</strong> All sample players, schedules, scores, and rank changes below are invented. This is not live season tracking. “Today” means the selected sample day. Your local draft stays private.</UiStatus>

    <UiCard className={styles.controls}>
      <div className={styles.controlHeading}><div><span className={styles.kicker}>TURN BACK THE CLOCK</span><h2>Sample {dayLabel(demoDayEnd(day))}, 2026</h2><p>Move through 18 sample days or replay the finals to watch the race change.</p></div><div className={styles.buttonRow}><UiButton size="sm" onClick={() => selectDay(day - 1)} disabled={day === 0} aria-label="Previous sample day">← Previous</UiButton><UiButton size="sm" onClick={() => selectDay(day + 1)} disabled={day === DEMO_DAYS - 1} aria-label="Next sample day">Next →</UiButton><UiButton size="sm" variant="primary" onClick={() => setReplay(replay === null ? 0 : null)}>{replay === null ? "Replay this day" : "Stop replay"}</UiButton></div></div>
      <label className={styles.daySlider}><span>Sample day {day + 1} of {DEMO_DAYS}</span><input type="range" min={0} max={DEMO_DAYS - 1} value={day} aria-label="Sample day" onChange={event => selectDay(Number(event.target.value))} /></label>
      <p className={styles.replayStatus} role="status">{replay === null ? "All finals through this sample day are shown." : `Replaying sample finals · update ${replay + 1} of ${frames.length}. In-progress results do not count until final.`}</p>
    </UiCard>

    <div className={styles.returnCards}>
      <UiCard><span className={styles.kicker}>BIGGEST CLIMB TODAY</span><strong>{climber ? `↑ ${climber.movement} ${climber.movement === 1 ? "place" : "places"}` : "No climber yet"}</strong><p>{climber?.squad.name ?? "The first finals will start the race."}</p></UiCard>
      <UiCard><span className={styles.kicker}>HOTTEST LAST 7 DAYS</span><strong>{hot ? record(hot.week) : "Waiting for finals"}</strong><p>{hot ? `${hot.squad.name} · ${pct(recordPercentage(hot.week))}` : "At least three team results needed."}</p></UiCard>
      <UiCard><span className={styles.kicker}>SELECTED SQUAD’S VALUE STANDOUT</span><strong>{standout?.team.name ?? "Who will break out?"}</strong><p>{standout ? `${record(standout)} · ${standout.team.cost}-point pick · at least 3 finals` : "A Value or Long-shot pick with at least three finals."}</p></UiCard>
    </div>

    <UiCard className={styles.localDraft}>
      <div><h2>Put your own squad in the mix.</h2><p>{mine ? "Compare your saved picks against this fictional league, only in your browser." : "Finish and save a legal 15-team squad to compare it with the sample field."}</p></div>
      {!draftLoaded ? <UiLoadingState title="Checking your local draft" /> : draftError ? <UiStatus tone="warning">Your local draft couldn’t be read. The sample league is still available.</UiStatus> : mine ? <label className={styles.checkLabel}><input type="checkbox" checked={includeMine} onChange={event => { setIncludeMine(event.target.checked); if (event.target.checked) setFocusedId(mine.id); }} /> Include {mine.name}</label> : <UiLinkButton href="/college-basketball#season-squad">Build your squad</UiLinkButton>}
    </UiCard>

    <UiCard className={styles.standingsCard}>
      <div className={styles.sectionHeading}><div><span className={styles.kicker}>THE FIELD · {squads.length} SQUADS</span><h2>Season standings</h2></div><label className={styles.search}><span>Find a squad</span><UiInput type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search squad names…" /></label></div>
      <p className={styles.smallNote}>Ranked by combined wins ÷ combined games. Equal percentages share a rank. Movement is since the start of this sample day. Click a squad to explore its picks.</p>
      {!visibleRows.length ? <UiEmptyState title="No matching squads" description="Try another squad name." actions={<UiButton onClick={() => setSearch("")}>Show all squads</UiButton>} /> : <div className={styles.tableScroll}><table className={styles.standingsTable}><caption className={styles.srOnly}>Fictional sample league standings for {dayLabel(asOf)}</caption><thead><tr><th scope="col">Rank</th><th scope="col">Squad</th><th scope="col">Record</th><th scope="col">Win %</th><th scope="col">Today</th><th scope="col">Last 7 days</th><th scope="col">Move</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.id} data-focused={row.id === focused.id} data-local={row.squad.isLocal}>
        <td className={styles.rankCell}>{row.rank ?? "—"}</td><th scope="row"><a href="#squad-breakdown" onClick={() => setFocusedId(row.id)}>{row.squad.name}{row.squad.isLocal ? <span className={styles.youBadge}>You</span> : null}</a><small>{row.squad.owner}</small></th><td>{record(row)}</td><td className={styles.percentCell}>{pct(row.percentage)}</td><td>{record(row.today)}</td><td>{record(row.week)}</td><td><Movement row={row} /></td>
      </tr>)}</tbody></table></div>}
      {standings.unscoredFinalIds.length ? <UiStatus tone="warning">{standings.unscoredFinalIds.length} sample finals need a valid result and are excluded.</UiStatus> : null}
    </UiCard>

    <div className={styles.middleGrid}><RaceChart history={history} focused={focused} />
      <UiCard className={styles.pulse}><span className={styles.kicker}>SQUAD PULSE</span><h2>{focused.squad.name}</h2><div className={styles.pulseStats}><div><small>Today’s finals</small><strong>{record(focused.today)}</strong></div><div><small>Last 7 days</small><strong>{record(focused.week)}</strong></div><div><small>Gap to first</small><strong>{leader?.percentage !== null && leader?.percentage !== undefined && focused.percentage !== null ? `${Math.max(0, (leader.percentage - focused.percentage) * 100).toFixed(2)} pp` : "—"}</strong></div><div><small>Since day started</small><strong><Movement row={focused} /></strong></div></div><h3>Last 10 team results</h3><div className={styles.form} aria-label={`Recent team results: ${focused.recent.join(", ") || "None yet"}`}>{focused.recent.length ? focused.recent.map((result, i) => <span key={i} data-result={result}>{result}</span>) : <span>No completed games yet</span>}</div><p className={styles.smallNote}>Each owned team’s result counts. Owning both opponents adds one win and one loss.</p></UiCard>
    </div>

    <section className={styles.watchSection} aria-labelledby="watch-title"><div className={styles.sectionHeading}><div><span className={styles.kicker}>A REASON TO CHECK BACK</span><h2 id="watch-title">Next games to watch</h2></div><span>For {focused.squad.name}</span></div><p className={styles.smallNote}>Sample scenarios assume only this game finishes next. Every squad owning either team updates together; these are possibilities, not predictions.</p><div className={styles.watchGrid}>{watch.map(game => {
      const state = seasonGameState(game, asOf);
      const awayRank = seasonGameScenario(rows, game, game.awayTeamId).find(r => r.id === focused.id)?.rank ?? null;
      const homeRank = seasonGameScenario(rows, game, game.homeTeamId).find(r => r.id === focused.id)?.rank ?? null;
      return <UiCard key={game.id} className={styles.watchCard}><span className={styles.kicker}>{state === "live" ? "SAMPLE · IN PROGRESS" : "SAMPLE · UPCOMING"}</span><p>{gameTime(game.startsAt)}</p><h3>{game.awayName}<span>at</span>{game.homeName}</h3><div className={styles.scenarios}><span>{game.awayName} wins<strong>{rank(awayRank)}</strong></span><span>{game.homeName} wins<strong>{rank(homeRank)}</strong></span></div></UiCard>;
    })}</div>{!watch.length ? <UiEmptyState title="No upcoming sample games for this squad" description="Choose an earlier sample day or another squad." /> : null}</section>

    <section className={styles.watchSection} aria-labelledby="recent-finals-title"><div className={styles.sectionHeading}><div><span className={styles.kicker}>HOW THE RECORD CHANGED</span><h2 id="recent-finals-title">Recent squad finals</h2></div><span>Fictional sample scores</span></div><div className={styles.watchGrid}>{recentFinals.map(game => {
      const both = focused.squad.teamIds.includes(game.awayTeamId) && focused.squad.teamIds.includes(game.homeTeamId);
      const won = focused.squad.teamIds.includes(seasonGameWinner(game)!);
      return <UiCard key={game.id} className={styles.finalCard} data-outcome={both ? "both" : won ? "win" : "loss"}><span className={styles.kicker}>SAMPLE FINAL · {gameTime(game.completedAt!)}</span><div><span>{game.awayName}</span><strong>{game.awayScore ?? "—"}</strong></div><div><span>{game.homeName}</span><strong>{game.homeScore ?? "—"}</strong></div><p>{both ? "+1 win · +1 loss · both teams on your squad" : won ? "+1 win for this squad" : "+1 loss for this squad"}</p></UiCard>;
    })}</div>{!recentFinals.length ? <UiEmptyState title="The first final starts your story" description="As sample games finish, their scores and impact appear here." /> : null}</section>

    <UiCard className={styles.breakdown} id="squad-breakdown"><div className={styles.sectionHeading}><div><span className={styles.kicker}>{focused.squad.isLocal ? "YOUR LOCAL PICKS · FICTIONAL RESULTS" : "SAMPLE SQUAD BREAKDOWN"}</span><h2>{focused.squad.name}</h2></div><span>{focused.squad.teamIds.length} teams · {record(focused)}</span></div><p className={styles.smallNote}>Pick ownership refers only to the {squads.length}-squad preview field. These are sample game records, not actual team records.</p><div className={styles.tableScroll}><table><caption className={styles.srOnly}>Team-by-team sample records for {focused.squad.name}</caption><thead><tr><th scope="col">Team</th><th scope="col">Tier</th><th scope="col">Cost</th><th scope="col">Record</th><th scope="col">Win %</th><th scope="col">Picked by</th></tr></thead><tbody>{details.map(result => <tr key={result.id}><th scope="row">{result.team.name}<small>{result.team.conference}</small></th><td>{seasonPricing.bands[result.team.bandIndex].label}</td><td>{result.team.cost}</td><td>{record(result)}</td><td>{pct(recordPercentage(result))}</td><td>{squads.filter(s => s.teamIds.includes(result.id)).length} / {squads.length}</td></tr>)}</tbody></table></div></UiCard>
    <p className={styles.smallNote}>Standings, activity, and metrics in this page are a demonstration. Live results, shared leagues, actual rank history, and public squad reveals will require the season backend. No bonus metric changes the winning-percentage scoring.</p>
  </>;
}

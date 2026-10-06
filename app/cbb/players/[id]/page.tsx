import { notFound } from 'next/navigation';
import { readCbbPlayerProfile } from '@/lib/cbbStatData';
import { shootingPercent, type StatLine } from '@/lib/cbbStatProjection';
import { UiEmptyState, UiLinkButton, UiStatus } from '@/app/components/ui/primitives';

export const dynamic = 'force-dynamic';
const number = (n: number | null | undefined, digits = 1) => n == null ? '—' : n.toFixed(digits);
const percent = (made: number, attempts: number) => { const value = shootingPercent(made, attempts); return value == null ? '—' : `${(value * 100).toFixed(1)}%`; };
const metrics = [['minutes', 'MPG'], ['points', 'PPG'], ['rebounds', 'RPG'], ['assists', 'APG'], ['steals', 'SPG'], ['blocks', 'BPG'], ['turnovers', 'TO*']] as const;

function Shooting({ line }: { line: StatLine }) {
  return <div className="cbb-profile-shooting">{[
    ['FG', line.twoMade + line.threeMade, line.twoAttempts + line.threeAttempts],
    ['2P', line.twoMade, line.twoAttempts], ['3P', line.threeMade, line.threeAttempts], ['FT', line.ftMade, line.ftAttempts],
  ].map(([label, made, attempts]) => <div key={label}><span>{label}%</span><strong>{percent(Number(made), Number(attempts))}</strong><small>{number(Number(made))} / {number(Number(attempts))} per game</small></div>)}</div>;
}

export default async function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readCbbPlayerProfile(id);
  if (!result) notFound();
  const { player: p, rank, season, stats, projection } = result;
  const projected = projection.projected;
  const baseline = projection.baseline;
  const factors = [
    ['Historical BBPR', p.historicalBbpr, 'Prior-season impact anchor.'],
    ['Competition difficulty', p.difficulty, 'Context for the historical rating; not a shooting multiplier.'],
    ['Historical rating', p.historicalRating, 'Historical performance adjusted by the ranking model.'],
    ['Projected role', p.projectedRole, 'Expected role in the rotation.'],
    ['Opportunity change', p.opportunityChange, 'Expected change in available opportunities.'],
    ['Offensive burden', p.offensiveBurden, 'Expected offensive responsibility.'],
    ['Opportunity score', p.opportunityScore, 'Combined opportunity assessment.'],
    ['Entry talent', p.entryTalentGrade, 'Incoming talent assessment for newcomers.'],
    ['NBA projection', p.nbaProjectionScore, 'Long-term professional potential.'],
    ['Upside / tools', p.upsideToolsScore, 'Physical tools and potential.'],
    ['Talent score', p.talentScore, 'Combined talent assessment.'],
    ['Development', p.developmentScore, 'Expected development entering this season.'],
    ['Projection score', p.projectionScore, 'Forward-looking component of the ranking.'],
  ] as const;
  return <main className="page-shell cbb-projections-shell">
    <nav aria-label="Player navigation"><UiLinkButton href="/cbb/players">← All players</UiLinkButton></nav>
    <section className="cbb-projections-hero"><div><span className="cbb-projections-kicker">#{rank} on the board · {season}</span><h1>{p.player}</h1><p>{p.currentTeam ?? 'Team pending'} · {p.position ?? 'Position pending'} · {p.classYear ?? p.playerType}{p.previousTeam ? ` · From ${p.previousTeam}` : ''}</p></div><div className="cbb-projections-meta"><span>Projected BBPR</span><strong className="cbb-profile-rating">{number(p.projectedBbpr, 2)}</strong><span>Ranking confidence {p.confidenceGrade ?? 'unrated'}</span></div></section>
    <UiStatus tone="info">Experimental stat model · These estimates have not been backtested. Minutes, usage, and shooting assumptions may change. Team rotation and pace constraints are not yet modeled.</UiStatus>
    <section className="cbb-projections-board cbb-profile-section" aria-labelledby="stat-title"><div className="cbb-profile-heading"><div><span className="cbb-projections-kicker">{season} outlook</span><h2 id="stat-title">Projected stat line</h2></div><span>{projection.status === 'comparable' ? 'Newcomer estimate' : projection.status === 'historical' ? 'Historical baseline' : 'Awaiting data'}</span></div>
      <p>{projection.reason}</p>
      {projected ? <><div className="cbb-profile-stat-grid">{metrics.map(([key, label]) => <div key={key}><span>{label}</span><strong>{number(projected[key])}</strong><small>Scenario {number(projection.lower?.[key])}–{number(projection.upper?.[key])}</small></div>)}</div><h3>Projected shooting splits</h3><Shooting line={projected} /><p className="cbb-profile-muted">Scenario ranges vary minutes and workload; they are not confidence intervals. *TO is estimated from assist-to-turnover ratio. Display rounding may cause small differences in totals.</p></> : <UiEmptyState as="div" title="Stat projection pending" description="The ranking breakdown is available below. A stat line will appear when both a verified baseline and the required role factors are available." />}
    </section>
    {baseline && <section className="cbb-projections-board cbb-profile-section" aria-labelledby="comparison-title"><h2 id="comparison-title">{stats.season} → {season}</h2><p>{baseline.team} · {baseline.games} games · {stats.source}</p><div className="cbb-projections-table-wrap"><table className="cbb-projections-table"><thead><tr><th scope="col">Stat</th><th scope="col">Last season</th><th scope="col">Projected</th><th scope="col">Change</th></tr></thead><tbody>{metrics.map(([key, label]) => { const prior = baseline[key], next = projected?.[key]; const delta = prior != null && next != null ? next - prior : null; return <tr key={key}><th scope="row">{label}</th><td>{number(prior)}</td><td>{number(next)}</td><td>{delta != null && delta > 0 ? '+' : ''}{number(delta)}</td></tr>; })}</tbody></table></div><h3>Last-season shooting</h3><Shooting line={baseline} /></section>}
    {projected && <section className="cbb-projections-board cbb-profile-section" aria-labelledby="explanation-title"><h2 id="explanation-title">Why this projection?</h2><ul className="cbb-profile-explanations">{projection.explanations.map(text => <li key={text}>{text}</li>)}</ul></section>}
    <section className="cbb-projections-board cbb-profile-section" aria-labelledby="ranking-title"><div className="cbb-profile-heading"><h2 id="ranking-title">Ranking breakdown</h2><span>{p.needsReview ? 'Under review' : 'Research complete'}</span></div><p>These are the stored inputs and component scores. Final BBPR includes calibration, so the factors below are not additive contributions. Ranking confidence does not measure stat-projection accuracy.</p><dl className="cbb-profile-factors">{factors.map(([label, value, description]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd><p>{description}</p></div>)}</dl></section>
    <footer className="cbb-profile-muted">Historical stats: <a className="cbb-player-link" href={stats.sourceUrl} target="_blank" rel="noreferrer">{stats.source}, {stats.season}</a> · Retrieved {stats.fetchedAt.slice(0, 10)}. Records with inconsistent shooting totals are excluded. Stat model v0.1.</footer>
  </main>;
}

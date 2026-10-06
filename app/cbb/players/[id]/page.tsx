import { notFound } from 'next/navigation';
import { readCbbPlayerProfile } from '@/lib/cbbStatData';
import { UiCard, UiEmptyState, UiLinkButton } from '@/app/components/ui/primitives';
import {
  formatStat, ProfileSection, ProjectedStatSummary, RankingFactorGroup,
  SeasonComparison, ShootingSplits,
} from '../components/ProfileComponents';
import styles from '../components/PlayerProfile.module.css';

export const dynamic = 'force-dynamic';

export default async function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readCbbPlayerProfile(id);
  if (!result) notFound();
  const { player: p, rank, season, stats, projection } = result;
  const { projected, baseline } = projection;
  const initials = p.player.split(/\s+/).slice(0, 2).map(name => name[0]).join('');
  const height = p.heightInches ? `${Math.floor(p.heightInches / 12)}′ ${p.heightInches % 12}″` : '—';
  const projectionLabel = projection.status === 'historical' ? 'Historical baseline' : projection.status === 'comparable' ? 'Newcomer estimate' : 'Awaiting data';

  return (
    <main className={`page-shell ${styles.page}`}>
      <div className={styles.topline}>
        <UiLinkButton href="/cbb/players" variant="ghost" size="sm">← Player board</UiLinkButton>
        <span>{season ?? 'Upcoming season'} <span aria-hidden="true">/</span> Player profile</span>
      </div>

      <header className={styles.hero}>
        <div className={styles.identity}>
          <div className={styles.monogram} aria-hidden="true">{initials}</div>
          <div className={styles.identityCopy}>
            <div className={styles.heroEyebrow}><span>{p.currentTeam ?? 'Team pending'}</span><span className={styles.heroBadge}>{p.playerType ?? 'Player'}</span></div>
            <h1>{p.player}</h1>
            <p>{[p.position, p.classYear, p.heightInches ? height : null].filter(Boolean).join(' · ') || 'Player details pending'}</p>
            {p.previousTeam && p.previousTeam !== p.currentTeam && <span className={styles.transfer}>Previously at {p.previousTeam}</span>}
          </div>
        </div>
        <div className={styles.heroRating}>
          <div><span>Board rank</span><strong><small>#</small>{rank}</strong></div>
          <div><span>Projected BBPR</span><strong>{formatStat(p.projectedBbpr, 2)}</strong></div>
        </div>
      </header>

      <nav className={styles.sectionNav} aria-label="Profile sections">
        <a href="#overview">Season outlook</a>
        <a href="#shooting">Shooting</a>
        {baseline && <a href="#comparison">Season comparison</a>}
        <a href="#ranking">Ranking breakdown</a>
      </nav>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <ProfileSection id="overview" eyebrow={`${season ?? 'Next season'} projection`} title="Season outlook" action={<span className={styles.badge}>{projectionLabel}</span>}>
            {projected ? <ProjectedStatSummary projection={projection} /> : (
              <UiEmptyState as="div" className={styles.emptyState} title="Stat projection pending" description={projection.reason} actions={<a className={styles.textLink} href="#ranking">Explore the ranking breakdown →</a>} />
            )}
            <div className={styles.modelNotice}><span className={styles.statusDot} aria-hidden="true" /><p><strong>Experimental projection</strong> Estimates have not been backtested. <a href="#methodology">About the model ↗</a></p></div>
          </ProfileSection>

          <ProfileSection id="shooting" eyebrow="Efficiency & volume" title="Shooting profile" description="Accuracy and shot volume, together in one view.">
            {projected ? <ShootingSplits line={projected} baseline={baseline} /> : baseline ? (
              <><p className={styles.inlineNote}>{stats.season} actuals · Projected splits are pending.</p><ShootingSplits line={baseline} baseline={null} /></>
            ) : <UiEmptyState as="div" className={styles.emptyState} title="Shooting profile pending" description="Shooting splits will appear when a supported statistical projection is available." />}
          </ProfileSection>

          {baseline && (
            <ProfileSection id="comparison" eyebrow="Year over year" title="Season comparison" description={`${baseline.team} · ${baseline.games} games in ${stats.season}`}>
              <SeasonComparison baseline={baseline} projected={projected} historicalSeason={stats.season} season={season} />
            </ProfileSection>
          )}
        </div>

        <aside className={styles.sidebar} aria-label="Player context">
          <UiCard className={styles.contextCard}>
            <span className={styles.eyebrow}>At a glance</span>
            <h2>Player snapshot</h2>
            <dl className={styles.facts}>
              {[
                ['Team', p.currentTeam ?? 'Pending'], ['Position', p.position ?? 'Pending'],
                ['Class', p.classYear ?? 'Pending'], ['Height', height],
                ['Age', formatStat(p.age)], ['Projected starter', p.projectedStarter ?? 'Pending'],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </UiCard>

          <UiCard className={styles.contextCard}>
            <span className={styles.eyebrow}>Ranking assessment</span>
            <div className={styles.confidenceHeader}><h2>Confidence</h2><strong>{p.confidenceGrade ?? '—'}</strong></div>
            <p className={styles.contextCopy}>{p.confidenceScore == null ? 'Confidence has not been assessed.' : `${formatStat(p.confidenceScore, 0)} / 100 in the ranking model`}</p>
            {p.confidenceScore != null && <meter className={styles.meter} min={0} max={100} value={p.confidenceScore} aria-label="Ranking confidence">{p.confidenceScore} / 100</meter>}
            <div className={styles.reviewStatus}><span className={styles.statusDot} aria-hidden="true" />{p.needsReview ? 'Research under review' : 'Research complete'}</div>
            <p className={styles.footnote}>Confidence in the ranking assessment, not a measure of stat-projection accuracy.</p>
          </UiCard>

          <UiCard className={styles.contextCard}>
            <span className={styles.eyebrow}>Projection foundation</span>
            <h2>{projection.status === 'comparable' ? 'Newcomer context' : 'The baseline'}</h2>
            <p className={styles.contextCopy}>{projection.reason}</p>
            {projection.comparisons > 0 && <div className={styles.cohortCount}><strong>{projection.comparisons}</strong><span>prior-season freshmen<br />in a similar position</span></div>}
            {baseline && <dl className={styles.facts}><div><dt>Season</dt><dd>{stats.season}</dd></div><div><dt>Sample</dt><dd>{baseline.games} games</dd></div></dl>}
            <a className={styles.textLink} href="#methodology">Read the methodology →</a>
          </UiCard>
        </aside>
      </div>

      <ProfileSection id="ranking" eyebrow="Behind the board position" title="Ranking breakdown" description="Three lenses on the player: proven production, expected opportunity, and future potential.">
        <div className={styles.factorGroups}>
          <RankingFactorGroup number="01" title="Track record" description="What the player has already shown." factors={[
            ['Historical BBPR', p.historicalBbpr, 'Prior-season impact'],
            ['Competition difficulty', p.difficulty, 'Strength of the competitive environment'],
            ['Historical rating', p.historicalRating, 'Adjusted historical performance'],
          ]} />
          <RankingFactorGroup number="02" title="Role & opportunity" description="Where the next season opens up." factors={[
            ['Projected role', p.projectedRole, 'Expected place in the rotation'],
            ['Opportunity change', p.opportunityChange, 'Change in available opportunities'],
            ['Offensive burden', p.offensiveBurden, 'Offensive responsibility'],
            ['Opportunity score', p.opportunityScore, 'Combined opportunity assessment'],
          ]} />
          <RankingFactorGroup number="03" title="Talent & development" description="The tools and potential to improve." factors={[
            ['Entry talent', p.entryTalentGrade, 'Incoming talent assessment'],
            ['NBA projection', p.nbaProjectionScore, 'Long-term professional potential'],
            ['Upside / tools', p.upsideToolsScore, 'Physical tools and potential'],
            ['Talent score', p.talentScore, 'Combined talent assessment'],
            ['Development', p.developmentScore, 'Expected development this season'],
          ]} />
        </div>
        <div className={styles.rankingSummary}>
          <div><span>Forward-looking score</span><strong>{formatStat(p.projectionScore)}</strong></div>
          <div><span>Final projected BBPR</span><strong>{formatStat(p.projectedBbpr, 2)}</strong></div>
          <p>Component scores inform the final ranking. Calibration and editorial adjustments mean these inputs are not additive contributions.</p>
        </div>
      </ProfileSection>

      <ProfileSection id="methodology" eyebrow="The details" title="Model & sources">
        {projected && <details className={styles.disclosure}><summary>Why this projection?<span aria-hidden="true">+</span></summary><div className={styles.disclosureBody}><ol className={styles.explanationList}>{projection.explanations.map(explanation => <li key={explanation}>{explanation}</li>)}</ol></div></details>}
        <details className={styles.disclosure}><summary>Assumptions & limitations<span aria-hidden="true">+</span></summary><div className={styles.disclosureBody}><p>This experimental model has not been backtested. Team rotation and pace constraints are not yet modeled. Minutes, workload, and shooting assumptions may change.</p><p>Scenario ranges represent different workloads, not confidence intervals. Turnovers are estimated from assist-to-turnover ratio. Display rounding may cause small differences in totals.</p><p>Records with inconsistent shooting totals are excluded. Missing values are shown as a dash.</p></div></details>
        <footer className={styles.sourceFooter}>
          <div><span>Historical data</span><a className={styles.textLink} href={stats.sourceUrl} target="_blank" rel="noreferrer">{stats.source} · {stats.season} ↗</a></div>
          <div><span>Retrieved</span><strong>{stats.fetchedAt.slice(0, 10)}</strong></div>
          <div><span>Stat model</span><strong>v0.1 · Experimental</strong></div>
        </footer>
      </ProfileSection>
    </main>
  );
}

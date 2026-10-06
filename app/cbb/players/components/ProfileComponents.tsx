import type { ReactNode } from 'react';
import { UiCard } from '@/app/components/ui/primitives';
import { shootingPercent, type StatBaseline, type StatLine, type StatProjection } from '@/lib/cbbStatProjection';
import styles from './PlayerProfile.module.css';

export const formatStat = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);

const statMetrics = [
  ['minutes', 'Minutes'], ['points', 'Points'], ['rebounds', 'Rebounds'],
  ['assists', 'Assists'], ['steals', 'Steals'], ['blocks', 'Blocks'], ['turnovers', 'Turnovers*'],
] as const;

export function ProfileSection({ id, eyebrow, title, description, action, children }: {
  id: string; eyebrow: string; title: string; description?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <UiCard id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 id={`${id}-title`}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </UiCard>
  );
}

export function StatChange({ previous, next, percentage = false }: {
  previous: number | null | undefined; next: number | null | undefined; percentage?: boolean;
}) {
  if (previous == null || next == null) return <span className={styles.muted}>—</span>;
  const delta = Number(((next - previous) * (percentage ? 100 : 1)).toFixed(1));
  return (
    <span className={styles.change} data-direction={delta > 0 ? 'up' : delta < 0 ? 'down' : 'even'}>
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}{percentage ? ' pp' : ''}
    </span>
  );
}

export function ProjectedStatSummary({ projection }: { projection: StatProjection }) {
  const line = projection.projected;
  if (!line) return null;
  return (
    <>
      <div className={styles.primaryStats}>
        {([['points', 'Points', 'PPG'], ['rebounds', 'Rebounds', 'RPG'], ['assists', 'Assists', 'APG']] as const).map(([key, label, unit]) => (
          <div className={styles.primaryStat} key={key}>
            <span className={styles.statLabel}>{label}</span>
            <div className={styles.statValue}>{formatStat(line[key])}<small>{unit}</small></div>
            {projection.baseline ? (
              <span className={styles.statContext}><StatChange previous={projection.baseline[key]} next={line[key]} /> vs. last season</span>
            ) : <span className={styles.statContext}>Per-game estimate</span>}
          </div>
        ))}
      </div>
      <dl className={styles.supportingStats}>
        {([['minutes', 'Minutes'], ['steals', 'Steals'], ['blocks', 'Blocks'], ['turnovers', 'Turnovers*']] as const).map(([key, label]) => (
          <div key={key}><dt>{label}</dt><dd>{formatStat(line[key])}</dd></div>
        ))}
      </dl>
      <details className={styles.disclosure}>
        <summary>Explore lower and upper scenarios<span aria-hidden="true">+</span></summary>
        <div className={styles.disclosureBody}>
          <p>These scenarios vary minutes and workload. They are not statistical confidence intervals.</p>
          <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Projection scenarios">
            <table className={styles.table}>
              <thead><tr><th scope="col">Per game</th><th scope="col">Lower</th><th scope="col">Expected</th><th scope="col">Upper</th></tr></thead>
              <tbody>{statMetrics.map(([key, label]) => (
                <tr key={key}><th scope="row">{label}</th><td>{formatStat(projection.lower?.[key])}</td><td>{formatStat(line[key])}</td><td>{formatStat(projection.upper?.[key])}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </details>
    </>
  );
}

const shootingMetrics = [
  { label: 'Field goal', short: 'FG', made: (s: StatLine) => s.twoMade + s.threeMade, attempts: (s: StatLine) => s.twoAttempts + s.threeAttempts },
  { label: 'Three-point', short: '3P', made: (s: StatLine) => s.threeMade, attempts: (s: StatLine) => s.threeAttempts },
  { label: 'Free throw', short: 'FT', made: (s: StatLine) => s.ftMade, attempts: (s: StatLine) => s.ftAttempts },
  { label: 'Two-point', short: '2P', made: (s: StatLine) => s.twoMade, attempts: (s: StatLine) => s.twoAttempts },
];
const accuracy = (line: StatLine | null, metric: typeof shootingMetrics[number]) =>
  line ? shootingPercent(metric.made(line), metric.attempts(line)) : null;
const formatPercent = (value: number | null) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;

export function ShootingSplits({ line, baseline }: { line: StatLine; baseline: StatLine | null }) {
  return (
    <div className={styles.shootingGrid}>
      {shootingMetrics.map(metric => {
        const value = accuracy(line, metric);
        return (
          <div className={styles.shootingStat} key={metric.short}>
            <span className={styles.statLabel}>{metric.label}</span>
            <strong>{formatPercent(value)}</strong>
            {value != null && <meter className={styles.meter} min={0} max={1} value={value} aria-label={`${metric.label} percentage`}>{formatPercent(value)}</meter>}
            <span className={styles.shotAttempts}>{formatStat(metric.made(line))} / {formatStat(metric.attempts(line))}<small>made / attempted per game</small></span>
            {baseline && <span className={styles.statContext}>Last season {formatPercent(accuracy(baseline, metric))}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function SeasonComparison({ baseline, projected, historicalSeason, season }: {
  baseline: StatBaseline; projected: StatLine | null; historicalSeason: string; season: string | null;
}) {
  return (
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Season comparison">
      <table className={styles.table}>
        <thead><tr><th scope="col">Per game</th><th scope="col">{historicalSeason}<small>Actual</small></th><th scope="col">{season ?? 'Next season'}<small>Projected</small></th><th scope="col">Change</th></tr></thead>
        <tbody>
          {statMetrics.map(([key, label]) => (
            <tr key={key}><th scope="row">{label}</th><td>{formatStat(baseline[key])}</td><td className={styles.projectedCell}>{formatStat(projected?.[key])}</td><td><StatChange previous={baseline[key]} next={projected?.[key]} /></td></tr>
          ))}
          {shootingMetrics.map(metric => (
            <tr key={metric.short}><th scope="row">{metric.short}%</th><td>{formatPercent(accuracy(baseline, metric))}</td><td className={styles.projectedCell}>{formatPercent(accuracy(projected, metric))}</td><td><StatChange previous={accuracy(baseline, metric)} next={accuracy(projected, metric)} percentage /></td></tr>
          ))}
        </tbody>
      </table>
      <p className={styles.footnote}>Shooting changes are percentage points (pp). *Turnovers are estimated from assist-to-turnover ratio.</p>
    </div>
  );
}

export type RankingFactor = readonly [label: string, value: number | null | undefined, description: string];

export function RankingFactorGroup({ title, number, description, factors }: {
  title: string; number: string; description: string; factors: readonly RankingFactor[];
}) {
  return (
    <div className={styles.factorGroup}>
      <header><span className={styles.groupNumber}>{number}</span><div><h3>{title}</h3><p>{description}</p></div></header>
      <dl>{factors.map(([label, value, explanation]) => (
        <div className={styles.factorRow} key={label}>
          <dt>{label}<small>{explanation}</small></dt><dd>{formatStat(value)}</dd>
        </div>
      ))}</dl>
    </div>
  );
}

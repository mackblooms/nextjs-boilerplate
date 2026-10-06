'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { UiButton, UiEmptyState, UiInput } from '@/app/components/ui/primitives';

type Player = { id: string; player: string; team: string | null; position: string | null; classYear: string | null; rank: number; score: number | null; provisional: boolean };
export default function PlayerDirectory({ players }: { players: Player[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => players.filter(p => `${p.player} ${p.team ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())), [players, query]);
  const pageSize = 50;
  return <section className="cbb-projections-board">
    <div className="cbb-profile-section"><label htmlFor="profile-search">Find a player or team</label><UiInput id="profile-search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Search players and teams" /><p role="status">{filtered.length} players · Select a name to view their profile.</p></div>
    {!filtered.length ? <UiEmptyState title="No players found" description="Try a different player or team name." /> : <>
      <div className="cbb-projections-table-wrap"><table className="cbb-projections-table"><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Team</th><th scope="col">BBPR / anchor</th></tr></thead><tbody>
        {filtered.slice(page * pageSize, (page + 1) * pageSize).map(p => <tr key={p.id}><td>#{p.rank}</td><td><Link className="cbb-player-link" href={`/cbb/players/${encodeURIComponent(p.id)}`}>{p.player}</Link><span>{p.position ?? '—'} · {p.classYear ?? '—'}</span></td><td>{p.team ?? '—'}</td><td>{p.score?.toFixed(2) ?? '—'}{p.provisional && <span>provisional anchor</span>}</td></tr>)}
      </tbody></table></div>
      <div className="cbb-profile-pagination"><UiButton disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</UiButton><span>Page {page + 1} of {Math.ceil(filtered.length / pageSize)}</span><UiButton disabled={(page + 1) * pageSize >= filtered.length} onClick={() => setPage(p => p + 1)}>Next</UiButton></div>
    </>}
  </section>;
}

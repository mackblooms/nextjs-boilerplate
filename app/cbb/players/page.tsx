import { readCbbProfileData } from '@/lib/cbbStatData';
import PlayerDirectory from './PlayerDirectory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'College basketball player profiles | bracketball' };

export default async function PlayersPage() {
  const { rankings, players } = await readCbbProfileData();
  // Explicit public fields: administrative research and internal notes stay server-side.
  const directory = players.map((p, index) => ({
    id: p.id, player: p.player, team: p.currentTeam, position: p.position, classYear: p.classYear,
    rank: index + 1, score: p.projectedBbpr ?? p.historicalRating ?? p.historicalBbpr ?? p.starScore ?? p.entryTalentGrade ?? null,
    provisional: p.projectedBbpr == null,
  }));
  return <main className="page-shell cbb-projections-shell">
    <section className="cbb-projections-hero"><div><span className="cbb-projections-kicker">{rankings.model.rankingSeason} scouting board</span><h1>player profiles</h1><p>Explore the rankings, the factors, and the projected stat lines.</p></div></section>
    <PlayerDirectory players={directory} />
  </main>;
}

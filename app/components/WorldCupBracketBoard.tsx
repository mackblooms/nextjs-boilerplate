type Team = {
  id: string;
  name: string;
  region: string | null;
};

type Game = {
  id: string;
  round: string;
  slot: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

const GROUPS = Array.from({ length: 12 }, (_, index) => `Group ${String.fromCharCode(65 + index)}`);
const ROUNDS = [
  { key: "R32", label: "round of 32", slots: 16 },
  { key: "S16", label: "round of 16", slots: 8 },
  { key: "E8", label: "quarterfinals", slots: 4 },
  { key: "F4", label: "semifinals", slots: 2 },
  { key: "CHIP", label: "final", slots: 1 },
] as const;

export default function WorldCupBracketBoard({
  teams,
  games,
  highlightTeamIds,
}: {
  teams: Team[];
  games: Game[];
  highlightTeamIds: Set<string>;
}) {
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const teamRow = (teamId: string | null, winnerId: string | null) => {
    const team = teamId ? teamById.get(teamId) : null;
    return (
      <div
        className="world-cup-bracket-team"
        data-highlighted={teamId && highlightTeamIds.has(teamId) ? "true" : undefined}
        data-winner={teamId && winnerId === teamId ? "true" : undefined}
      >
        {team?.name ?? "tbd"}
      </div>
    );
  };

  return (
    <div className="world-cup-bracket-board">
      <section className="world-cup-groups" aria-label="World cup groups">
        <div className="world-cup-board-heading">
          <span>group stage</span>
          <strong>12 groups of four</strong>
        </div>
        <div className="world-cup-group-grid">
          {GROUPS.map((group) => (
            <article className="world-cup-group-card" key={group}>
              <strong>{group}</strong>
              {teams
                .filter((team) => team.region === group)
                .map((team) => (
                  <div
                    className="world-cup-group-team"
                    data-highlighted={highlightTeamIds.has(team.id) ? "true" : undefined}
                    key={team.id}
                  >
                    {team.name}
                  </div>
                ))}
            </article>
          ))}
        </div>
      </section>

      <section className="world-cup-knockout" aria-label="World cup knockout bracket">
        <div className="world-cup-board-heading">
          <span>knockout stage</span>
          <strong>32 teams to one champion</strong>
        </div>
        <div className="world-cup-knockout-grid">
          {ROUNDS.map((round) => {
            const roundGames = games
              .filter((game) => game.round === round.key)
              .sort((a, b) => a.slot - b.slot);

            return (
              <div className="world-cup-knockout-round" key={round.key}>
                <strong>{round.label}</strong>
                {Array.from({ length: round.slots }, (_, index) => {
                  const game = roundGames[index];
                  return (
                    <article className="world-cup-knockout-game" key={`${round.key}-${index + 1}`}>
                      {teamRow(game?.team1_id ?? null, game?.winner_team_id ?? null)}
                      {teamRow(game?.team2_id ?? null, game?.winner_team_id ?? null)}
                    </article>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

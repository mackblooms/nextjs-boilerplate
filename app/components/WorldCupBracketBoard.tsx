type Team = {
  id: string;
  name: string;
  region: string | null;
};

type Game = {
  id: string;
  round: string;
  region: string | null;
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

const WORLD_CUP_SLOT_LABELS: Record<string, [string, string]> = {
  "R32|1": ["2A", "2B"],
  "R32|2": ["1E", "3RD A/B/C/D/F"],
  "R32|3": ["1F", "2C"],
  "R32|4": ["1C", "2F"],
  "R32|5": ["1I", "3RD C/D/F/G/H"],
  "R32|6": ["2E", "2I"],
  "R32|7": ["1A", "3RD C/E/F/H/I"],
  "R32|8": ["1L", "3RD E/H/I/J/K"],
  "R32|9": ["1D", "3RD B/E/F/I/J"],
  "R32|10": ["1G", "3RD A/E/H/I/J"],
  "R32|11": ["2K", "2L"],
  "R32|12": ["1H", "2J"],
  "R32|13": ["1B", "3RD E/F/G/I/J"],
  "R32|14": ["1J", "2H"],
  "R32|15": ["1K", "3RD D/E/I/J/L"],
  "R32|16": ["2D", "2G"],
  "S16|1": ["W74", "W77"],
  "S16|2": ["W73", "W75"],
  "S16|3": ["W76", "W78"],
  "S16|4": ["W79", "W80"],
  "S16|5": ["W83", "W84"],
  "S16|6": ["W81", "W82"],
  "S16|7": ["W86", "W88"],
  "S16|8": ["W85", "W87"],
  "E8|1": ["W89", "W90"],
  "E8|2": ["W93", "W94"],
  "E8|3": ["W91", "W92"],
  "E8|4": ["W95", "W96"],
  "F4|1": ["W97", "W98"],
  "F4|2": ["W99", "W100"],
  "CHIP|1": ["W101", "W102"],
};

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
  const groupGamesByRegion = new Map<string, Game[]>();

  for (const game of games) {
    if (game.round !== "GROUP" || !game.region) continue;
    const regionGames = groupGamesByRegion.get(game.region) ?? [];
    regionGames.push(game);
    groupGamesByRegion.set(game.region, regionGames);
  }

  for (const regionGames of groupGamesByRegion.values()) {
    regionGames.sort((a, b) => a.slot - b.slot);
  }

  const teamRow = (teamId: string | null, winnerId: string | null, fallbackLabel = "tbd") => {
    const team = teamId ? teamById.get(teamId) : null;
    return (
      <div
        className="world-cup-bracket-team"
        data-highlighted={teamId && highlightTeamIds.has(teamId) ? "true" : undefined}
        data-winner={teamId && winnerId === teamId ? "true" : undefined}
      >
        {team?.name ?? fallbackLabel}
      </div>
    );
  };

  const groupGameRow = (game: Game) => (
    <article className="world-cup-group-game" key={game.id}>
      {teamRow(game.team1_id, game.winner_team_id)}
      {teamRow(game.team2_id, game.winner_team_id)}
    </article>
  );

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
              {(groupGamesByRegion.get(group) ?? []).length > 0 ? (
                <div className="world-cup-group-games">
                  {(groupGamesByRegion.get(group) ?? []).map(groupGameRow)}
                </div>
              ) : null}
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
                  const slot = game?.slot ?? index + 1;
                  const slotLabels = WORLD_CUP_SLOT_LABELS[`${round.key}|${slot}`] ?? ["tbd", "tbd"];
                  return (
                    <article className="world-cup-knockout-game" key={`${round.key}-${index + 1}`}>
                      {teamRow(game?.team1_id ?? null, game?.winner_team_id ?? null, slotLabels[0])}
                      {teamRow(game?.team2_id ?? null, game?.winner_team_id ?? null, slotLabels[1])}
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

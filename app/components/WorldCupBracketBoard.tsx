import {
  WORLD_CUP_LEFT_LAYOUT,
  WORLD_CUP_RIGHT_LAYOUT,
  WORLD_CUP_SLOT_LABELS,
  type WorldCupRound,
} from "@/lib/worldCupBracket";

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

export default function WorldCupBracketBoard({
  teams,
  games,
  highlightTeamIds,
  layout = "stacked",
}: {
  teams: Team[];
  games: Game[];
  highlightTeamIds: Set<string>;
  layout?: "stacked" | "side-groups";
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

  const gamesByRoundSlot = new Map<string, Game>();
  for (const game of games) {
    gamesByRoundSlot.set(`${game.round}|${game.slot}`, game);
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

  const knockoutGame = (round: WorldCupRound, slot: number) => {
    const game = gamesByRoundSlot.get(`${round}|${slot}`);
    const slotLabels = WORLD_CUP_SLOT_LABELS[`${round}|${slot}`] ?? ["tbd", "tbd"];
    return (
      <article className="world-cup-knockout-game" key={`${round}-${slot}`}>
        {teamRow(game?.team1_id ?? null, game?.winner_team_id ?? null, slotLabels[0])}
        {teamRow(game?.team2_id ?? null, game?.winner_team_id ?? null, slotLabels[1])}
      </article>
    );
  };

  const roundLabel = (round: WorldCupRound) => ROUNDS.find((candidate) => candidate.key === round)?.label ?? round;
  const sideRound = (round: Exclude<WorldCupRound, "CHIP">, side: "left" | "right") => {
    const layout = side === "left" ? WORLD_CUP_LEFT_LAYOUT[round] : WORLD_CUP_RIGHT_LAYOUT[round];
    return (
      <div className="world-cup-knockout-round" data-side={side} data-round={round} key={`${side}-${round}`}>
        <strong>{roundLabel(round)}</strong>
        {layout.map((slot) => knockoutGame(round, slot))}
      </div>
    );
  };

  const showGroupGames = layout === "stacked";

  return (
    <div className="world-cup-bracket-board" data-layout={layout}>
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
              {showGroupGames && (groupGamesByRegion.get(group) ?? []).length > 0 ? (
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
          {(["R32", "S16", "E8", "F4"] as const).map((round) => sideRound(round, "left"))}
          <div className="world-cup-knockout-center">
            <strong>final</strong>
            {knockoutGame("CHIP", 1)}
          </div>
          {(["F4", "E8", "S16", "R32"] as const).map((round) => sideRound(round, "right"))}
        </div>
      </section>
    </div>
  );
}

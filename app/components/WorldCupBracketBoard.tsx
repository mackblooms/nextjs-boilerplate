import type { CSSProperties } from "react";
import {
  WORLD_CUP_LEFT_LAYOUT,
  WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT,
  WORLD_CUP_RIGHT_LAYOUT,
  WORLD_CUP_SLOT_LABELS,
  type WorldCupRound,
} from "@/lib/worldCupBracket";
import type { MatchedLiveGame } from "@/lib/liveBracket";
import { getEliminatedTeamIds } from "@/lib/teamElimination";
import { worldCupLogoUrl } from "@/lib/worldCupLogos";

type Team = {
  id: string;
  name: string;
  region: string | null;
  logo_url?: string | null;
};

type Game = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  status?: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

const GROUPS = Array.from({ length: 12 }, (_, index) => `Group ${String.fromCharCode(65 + index)}`);
const ROUNDS = [
  { key: "R32", label: "round of 32", slots: 16 },
  { key: "S16", label: "round of 16", slots: 8 },
  { key: "E8", label: "quarterfinals", slots: 4 },
  { key: "F4", label: "semifinals", slots: 2 },
  { key: "CHIP", label: "final", slots: 1 },
] as const;

const ROUND_RING: Record<WorldCupRound, number> = {
  R32: 44,
  S16: 31,
  E8: 20,
  F4: 10,
  CHIP: 0,
};

const ROUND_ORDER: Exclude<WorldCupRound, "CHIP">[] = ["R32", "S16", "E8", "F4"];

function logoUrlForTeam(team: Team | null | undefined) {
  if (!team) return null;
  return worldCupLogoUrl(team.name, team.logo_url);
}

type GroupStanding = {
  team: Team;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
};

function isFinalGroupGame(game: Game) {
  const status = String(game.status ?? "").toLowerCase();
  return (
    Boolean(game.winner_team_id) ||
    status.includes("final") ||
    status === "ft" ||
    status.includes("full time") ||
    status.includes("full-time") ||
    status.includes("complete") ||
    status.includes("post")
  );
}

function scoreIsKnown(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function buildGroupStandings(group: string, teams: Team[], games: Game[], liveByGameId?: Map<string, MatchedLiveGame>) {
  const rows = new Map<string, GroupStanding>();
  for (const team of teams.filter((candidate) => candidate.region === group)) {
    rows.set(team.id, {
      team,
      played: 0,
      points: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
  }

  for (const game of games) {
    if (game.round !== "GROUP" || game.region !== group || !game.team1_id || !game.team2_id) continue;
    const live = liveByGameId?.get(game.id);
    const useLiveScore = live?.state === "LIVE" && scoreIsKnown(live.team1Score) && scoreIsKnown(live.team2Score);
    if (!isFinalGroupGame(game) && !useLiveScore) continue;

    const team1 = rows.get(game.team1_id);
    const team2 = rows.get(game.team2_id);
    if (!team1 || !team2) continue;

    const team1Score = useLiveScore
      ? live.team1Score
      : scoreIsKnown(game.team1_score)
        ? game.team1_score
        : null;
    const team2Score = useLiveScore
      ? live.team2Score
      : scoreIsKnown(game.team2_score)
        ? game.team2_score
        : null;
    const hasScores = team1Score != null && team2Score != null;
    team1.played += 1;
    team2.played += 1;

    if (hasScores) {
      team1.goalsFor += team1Score;
      team1.goalsAgainst += team2Score;
      team2.goalsFor += team2Score;
      team2.goalsAgainst += team1Score;
    }

    if (hasScores && team1Score === team2Score) {
      team1.points += 1;
      team2.points += 1;
      continue;
    }

    const winnerId =
      game.winner_team_id ??
      (hasScores ? (team1Score > team2Score ? game.team1_id : game.team2_id) : null);

    if (winnerId === game.team1_id) team1.points += 3;
    if (winnerId === game.team2_id) team2.points += 3;
  }

  return [...rows.values()].sort((a, b) => {
    const diff =
      b.points - a.points ||
      (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor;
    if (diff !== 0) return diff;

    if (a.played === 0 && b.played > 0) return -1;
    if (b.played === 0 && a.played > 0) return 1;

    return a.team.name.localeCompare(b.team.name);
  });
}

export default function WorldCupBracketBoard({
  teams,
  games,
  highlightTeamIds,
  liveByGameId,
  layout = "stacked",
}: {
  teams: Team[];
  games: Game[];
  highlightTeamIds: Set<string>;
  liveByGameId?: Map<string, MatchedLiveGame>;
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

  const knockoutSlots = (round: WorldCupRound) => {
    const count = ROUNDS.find((candidate) => candidate.key === round)?.slots ?? 1;
    return Array.from({ length: count }, (_, index) => index + 1);
  };

  const nodePosition = (round: Exclude<WorldCupRound, "CHIP">, slot: number) => {
    const slots = knockoutSlots(round).length;
    const angle = -90 + ((slot - 0.5) * 360) / slots;
    const radians = (angle * Math.PI) / 180;
    const radius = ROUND_RING[round];
    return {
      x: 50 + Math.cos(radians) * radius,
      y: 50 + Math.sin(radians) * radius,
    };
  };

  const eliminatedTeamIds = getEliminatedTeamIds(games, "world-cup");

  const teamRow = (teamId: string | null, winnerId: string | null, fallbackLabel = "tbd") => {
    const team = teamId ? teamById.get(teamId) : null;
    const isEliminated = Boolean(teamId && eliminatedTeamIds.has(teamId));
    const logoUrl = logoUrlForTeam(team);
    return (
      <div
        className="world-cup-bracket-team"
        data-highlighted={teamId && highlightTeamIds.has(teamId) ? "true" : undefined}
        data-winner={teamId && winnerId === teamId ? "true" : undefined}
        data-eliminated={isEliminated ? "true" : undefined}
        data-placeholder={team ? undefined : "true"}
      >
        <span className="world-cup-team-logo" data-empty={logoUrl ? undefined : "true"}>
          {logoUrl ? <img src={logoUrl} alt="" loading="lazy" /> : null}
        </span>
        <span className="world-cup-team-name">{team?.name ?? fallbackLabel}</span>
      </div>
    );
  };

  const teamBadge = (teamId: string | null, fallbackLabel = "tbd") => {
    const team = teamId ? teamById.get(teamId) : null;
    const logoUrl = logoUrlForTeam(team);
    return (
      <span className="world-cup-group-team">
        <span className="world-cup-team-logo" data-empty={logoUrl ? undefined : "true"}>
          {logoUrl ? <img src={logoUrl} alt="" loading="lazy" /> : null}
        </span>
        <span className="world-cup-team-name">{team?.name ?? fallbackLabel}</span>
      </span>
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
      <article className="world-cup-knockout-game" data-round={round} key={`${round}-${slot}`}>
        {teamRow(game?.team1_id ?? null, game?.winner_team_id ?? null, slotLabels[0])}
        {teamRow(game?.team2_id ?? null, game?.winner_team_id ?? null, slotLabels[1])}
      </article>
    );
  };

  const circularKnockoutGame = (round: Exclude<WorldCupRound, "CHIP">, slot: number) => {
    const position = nodePosition(round, slot);
    return (
      <div
        className="world-cup-knockout-node"
        data-round={round}
        key={`${round}-${slot}`}
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
        } as CSSProperties}
      >
        {knockoutGame(round, slot)}
      </div>
    );
  };

  const connectorLines = (["S16", "E8", "F4", "CHIP"] as const).flatMap((targetRound) => {
    const targetSlots = knockoutSlots(targetRound);
    return targetSlots.map((targetSlot) => {
      const feeders = Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)
        .filter(([, target]) => target.round === targetRound && target.slot === targetSlot)
        .map(([sourceKey]) => {
          const [sourceRound, sourceSlot] = sourceKey.split("|");
          return {
            round: sourceRound as Exclude<WorldCupRound, "CHIP">,
            slot: Number(sourceSlot),
          };
        })
        .filter((source) => Number.isFinite(source.slot))
        .sort((a, b) => a.slot - b.slot);

      if (feeders.length !== 2) return null;

      const fromA = nodePosition(feeders[0].round, feeders[0].slot);
      const fromB = nodePosition(feeders[1].round, feeders[1].slot);
      const to = targetRound === "CHIP"
        ? { x: 50, y: 50 }
        : nodePosition(targetRound as Exclude<WorldCupRound, "CHIP">, targetSlot);

      const sourceRadius = ROUND_RING[feeders[0].round];
      const targetRadius = ROUND_RING[targetRound];
      const fallbackVector = {
        x: (fromA.x + fromB.x) / 2 - 50,
        y: (fromA.y + fromB.y) / 2 - 50,
      };
      const targetVector = targetRound === "CHIP" ? fallbackVector : {
        x: to.x - 50,
        y: to.y - 50,
      };
      const vectorLength = Math.hypot(targetVector.x, targetVector.y) || 1;
      const radial = { x: targetVector.x / vectorLength, y: targetVector.y / vectorLength };
      const tangent = { x: -radial.y, y: radial.x };
      const jointRadius = targetRadius + (sourceRadius - targetRadius) * 0.58;
      const joint = {
        x: 50 + radial.x * jointRadius,
        y: 50 + radial.y * jointRadius,
      };

      const offsetA = (fromA.x - joint.x) * tangent.x + (fromA.y - joint.y) * tangent.y;
      const offsetB = (fromB.x - joint.x) * tangent.x + (fromB.y - joint.y) * tangent.y;
      const cornerA = {
        x: joint.x + tangent.x * offsetA,
        y: joint.y + tangent.y * offsetA,
      };
      const cornerB = {
        x: joint.x + tangent.x * offsetB,
        y: joint.y + tangent.y * offsetB,
      };

      return (
        <g
          data-round={feeders[0].round}
          data-target-round={targetRound}
          key={`${targetRound}-${targetSlot}-connector`}
        >
          <path
            d={`M ${fromA.x} ${fromA.y} L ${cornerA.x} ${cornerA.y} L ${cornerB.x} ${cornerB.y} L ${fromB.x} ${fromB.y} M ${joint.x} ${joint.y} L ${to.x} ${to.y}`}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={joint.x} cy={joint.y} r="0.54" />
          <circle cx={to.x} cy={to.y} r={targetRound === "CHIP" ? "0.66" : "0.46"} />
        </g>
      );
    }).filter(Boolean);
  });

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
      <section className="world-cup-knockout" aria-label="World cup knockout bracket">
        <div className="world-cup-board-heading">
          <span>knockout stage</span>
          <strong>32 teams to one champion</strong>
        </div>
        {layout === "side-groups" ? (
          <div className="world-cup-knockout-circle">
            <svg className="world-cup-knockout-connectors" aria-hidden="true" viewBox="0 0 100 100">
              {connectorLines}
            </svg>
            {ROUND_ORDER.flatMap((round) => knockoutSlots(round).map((slot) => circularKnockoutGame(round, slot)))}
            <div className="world-cup-knockout-trophy" aria-label="World Cup final">
              <span>trophy</span>
              <strong>WC</strong>
              {knockoutGame("CHIP", 1)}
            </div>
          </div>
        ) : (
          <div className="world-cup-knockout-grid">
            {(["R32", "S16", "E8", "F4"] as const).map((round) => sideRound(round, "left"))}
            <div className="world-cup-knockout-center">
              <strong>final</strong>
              {knockoutGame("CHIP", 1)}
            </div>
            {(["F4", "E8", "S16", "R32"] as const).map((round) => sideRound(round, "right"))}
          </div>
        )}
      </section>

      <details className="world-cup-groups" aria-label="World cup groups">
        <summary className="world-cup-groups-summary">
          <span className="world-cup-board-heading">
            <span>group stage</span>
            <strong>12 groups of four</strong>
          </span>
        </summary>
        <div className="world-cup-group-grid">
          {GROUPS.map((group) => {
            const groupGames = groupGamesByRegion.get(group) ?? [];
            const standings = buildGroupStandings(group, teams, groupGames, liveByGameId);
            const hasLiveGroupGame = groupGames.some((game) => liveByGameId?.get(game.id)?.state === "LIVE");
            return (
              <article className="world-cup-group-card" data-live={hasLiveGroupGame ? "true" : undefined} key={group}>
                <div className="world-cup-group-card-heading">
                  <strong>{group}</strong>
                  {hasLiveGroupGame ? <span className="live-status-dot" aria-label="Live standings" /> : null}
                </div>
                <table className="world-cup-group-table">
                  <thead>
                    <tr>
                      <th scope="col">team</th>
                      <th scope="col">pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row) => (
                      <tr
                        data-highlighted={highlightTeamIds.has(row.team.id) ? "true" : undefined}
                        data-eliminated={eliminatedTeamIds.has(row.team.id) ? "true" : undefined}
                        key={row.team.id}
                      >
                        <td>{teamBadge(row.team.id)}</td>
                        <td>{row.played > 0 ? row.points : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showGroupGames && groupGames.length > 0 ? (
                  <div className="world-cup-group-games">
                    {groupGames.map(groupGameRow)}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </details>
    </div>
  );
}

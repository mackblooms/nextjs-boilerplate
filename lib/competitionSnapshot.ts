import type { CompetitionSlug } from "@/lib/competitions";

export type CompetitionSnapshotTeam = {
  id: string;
  name: string;
  seed: number | null;
  seed_in_region: number | null;
  cost: number | null;
  region: string | null;
  logo_url?: string | null;
  espn_team_id?: string | number | null;
};

export type CompetitionSnapshotGame = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  status: string | null;
  start_time: string | null;
  game_date: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  sportsdata_game_id?: number | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

export type CompetitionSnapshot = {
  ok: true;
  competition: CompetitionSlug;
  teams: CompetitionSnapshotTeam[];
  games: CompetitionSnapshotGame[];
};

export async function fetchCompetitionSnapshot(
  competitionSlug: CompetitionSlug,
): Promise<CompetitionSnapshot> {
  const res = await fetch(
    `/api/competition-data?competition=${encodeURIComponent(competitionSlug)}`,
    { cache: "no-store" },
  );
  const payload = (await res.json().catch(() => ({}))) as
    | CompetitionSnapshot
    | { error?: string };

  if (!res.ok || !("ok" in payload) || !payload.ok) {
    const message = "error" in payload ? payload.error : null;
    throw new Error(message ?? "Unable to load competition data.");
  }

  return payload;
}

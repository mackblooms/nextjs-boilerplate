import type { Metadata } from "next";
import { seasonTeams } from "@/lib/cbbSeasonTeams";
import SeasonStandingsPreview from "./SeasonStandingsPreview";

export const metadata: Metadata = { title: "Season standings preview | bracketball", description: "Explore a sample college basketball league: daily rank movement, squad form, race history and games to watch." };

export default function SeasonStandingsPage() {
  return <SeasonStandingsPreview teams={seasonTeams} />;
}

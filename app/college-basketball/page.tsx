import type { Metadata } from "next";
import CompetitionSwitcher from "../components/CompetitionSwitcher";
import { seasonTeams } from "@/lib/cbbSeasonTeams";
import SeasonSquadBuilder from "./SeasonSquadBuilder";
import styles from "./season.module.css";

export const metadata: Metadata = {
  title: "College Basketball Season | bracketball",
  description: "Build a 100-point college basketball squad and explore the 2026-27 season pricing preview.",
};

export default function CollegeBasketballPage() {
  return <div className={`page-shell page-shell--stack ${styles.page}`}>
    <CompetitionSwitcher activeCompetition="college-basketball" compact />
    <section className={styles.hero}>
      <div><span className={styles.eyebrow}>2026–27 · season squad builder</span>
        <h1>A whole season.<br /><span>Your squad.</span></h1>
        <p>Find your favorites. Back the overlooked. Build a squad with 100 points and follow every win and loss through conference tournaments.</p>
      </div>
      <div className={styles.heroStat}><strong>100</strong><span>points to build with</span><small>15–18 teams · one combined record</small></div>
    </section>
    <SeasonSquadBuilder teams={seasonTeams} />
  </div>;
}

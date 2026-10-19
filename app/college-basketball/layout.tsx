import type { ReactNode } from "react";
import CompetitionSwitcher from "../components/CompetitionSwitcher";
import SeasonNavigation from "./SeasonNavigation";
import styles from "./season.module.css";

export default function SeasonLayout({ children }: { children: ReactNode }) {
  return <div className={`page-shell page-shell--stack ${styles.page}`}>
    <CompetitionSwitcher activeCompetition="college-basketball" compact />
    <SeasonNavigation />
    {children}
  </div>;
}

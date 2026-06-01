"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  WORLD_CUP_SCORING_EVENTS,
  WORLD_CUP_TEAM_COSTS,
  WORLD_CUP_UNDERDOG_BONUS_EVENTS,
  WORLD_CUP_VALUE_RUN_BONUS_EVENTS,
} from "@/lib/worldCupRules";

const SEED_COSTS: Array<[number, number]> = [
  [1, 22], [2, 19], [3, 14], [4, 12], [5, 10], [6, 8], [7, 7], [8, 6],
  [9, 6], [10, 5], [11, 4], [12, 4], [13, 3], [14, 3], [15, 2], [16, 1],
];

const ROUND_POINTS: Array<[string, string]> = [
  ["Round of 64", "12"],
  ["Round of 32", "36"],
  ["Round of 16", "84"],
  ["Round of 8", "180"],
  ["Round of 4", "300"],
  ["Championship", "360"],
];

function RulesTable({
  columns,
  rows,
}: {
  columns: [string, string];
  rows: ReadonlyArray<readonly [string | number, string | number]>;
}) {
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--border-color)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", fontWeight: 900, background: "var(--surface-muted)" }}>
        <div>{columns[0]}</div>
        <div style={{ textAlign: "right" }}>{columns[1]}</div>
      </div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", borderTop: "1px solid var(--border-color)" }}>
          <div>{label}</div>
          <div style={{ textAlign: "right", fontWeight: 900 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function BasketballRules() {
  return (
    <>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>1) Draft Budget: 100 Total Points</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Every entry gets <b>100 points</b> to spend in the draft. Team cost is based on seed rank.
          Higher-ranked teams cost more and lower-ranked teams cost less.
        </p>
        <RulesTable columns={["Seed Rank", "Draft Cost"]} rows={SEED_COSTS.map(([seed, cost]) => [`${seed}-seed`, cost])} />
        <p style={{ marginTop: 10, opacity: 0.85 }}>Example: a 1-seed costs 22 points, while a 16-seed costs 1 point.</p>
      </section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>2) Base Points Per Win</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>Scoring is <b>per game won</b>. Every tournament win by a team you drafted adds points cumulatively.</p>
        <RulesTable columns={["Round Won", "Points"]} rows={ROUND_POINTS} />
        <p style={{ marginTop: 10, opacity: 0.85 }}>A champion that wins all 6 games earns 972 base points before bonuses.</p>
      </section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>3) Upset Bonus</h2><p style={{ marginTop: 10, lineHeight: 1.6 }}>When your team wins as an underdog, you earn an extra upset bonus on top of base points. Bigger upsets generally earn more than smaller upsets.</p></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>4) Seed Multiplier</h2><p style={{ marginTop: 10, lineHeight: 1.6 }}>Each seed has a weighting factor that adjusts base win points. Underdog seeds receive a stronger boost than top seeds. This is applied automatically by the scoring system.</p></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>5) Historic Upset Bonus</h2><p style={{ marginTop: 10, lineHeight: 1.6 }}>Certain rare first-round underdog outcomes can trigger an additional one-time bonus for <b>14-, 15-, and 16-seeds</b>. Lower seeds earn a larger historic upset bonus.</p></section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>6) Perfect Round of 64 Bonus</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>If <b>all</b> of your drafted teams win in the Round of 64, you earn a one-time perfect-round bonus based on the risk profile of your draft.</p>
        <p style={{ marginTop: 10, opacity: 0.85 }}>Your draft does not need to spend exactly 100 points. Any valid draft at or under the budget can qualify.</p>
      </section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>7) Draft Caps</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li>Max 2 one-seeds</li><li>Max 2 two-seeds</li><li>Max 6 combined seeds 14-16</li></ul></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>8) Tie-breakers</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li>Total points.</li><li>If tied: most Round of 4 teams drafted.</li><li>If still tied: most Championship teams drafted.</li><li>If still tied: split pot or commissioner decides.</li></ul></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>9) FAQ / Edge Cases</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li><b>Play-in teams:</b> once decided, the winner inherits the slot and scoring.</li><li><b>Vacated wins / forfeits:</b> scoring follows official bracket advancement.</li><li><b>Scoring updates:</b> automated when games go final.</li></ul></section>
    </>
  );
}

function SoccerRules() {
  return (
    <>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>1) Draft Budget: 100 Total Points</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Every entry gets <b>100 points</b> to draft any number of national teams. Team cost is
          based on projected value across the full tournament path: group results, advancement
          odds, draw difficulty, and championship upside.
        </p>
        <RulesTable columns={["National Team", "Draft Cost"]} rows={WORLD_CUP_TEAM_COSTS} />
        <p style={{ marginTop: 10, opacity: 0.85 }}>Example: Spain costs 24 points, while long-shot teams at the bottom of the board cost 4 points.</p>
      </section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>2) Base Points Per Result</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>Scoring is cumulative. Group-stage results score immediately, then each knockout advancement adds progressively more points.</p>
        <RulesTable columns={["Result", "Points"]} rows={WORLD_CUP_SCORING_EVENTS} />
      </section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>3) Underdog Bonus: Teams Below 10</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>Teams priced below <b>10 points</b> earn extra bonuses for group-stage success. These bonuses are cumulative and are added on top of base scoring.</p>
        <RulesTable columns={["Result", "Additional Bonus"]} rows={WORLD_CUP_UNDERDOG_BONUS_EVENTS} />
      </section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>4) Value Run Bonus: Teams Priced 15 or Below</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>Teams priced at <b>15 points or below</b> earn extra cumulative bonuses when they make a knockout-stage run. Teams priced below 10 can earn both bonus types.</p>
        <RulesTable columns={["Milestone", "Additional Bonus"]} rows={WORLD_CUP_VALUE_RUN_BONUS_EVENTS} />
        <p style={{ marginTop: 10, opacity: 0.85 }}>Example: an 8-point team that wins one group game, escapes its group, and reaches the quarterfinal earns 4 + 10 + 8 + 16 = 38 bonus points.</p>
      </section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>5) Why Prices Differ</h2><p style={{ marginTop: 10, lineHeight: 1.6 }}>Price is not based only on the chance to win the championship. A team with a favorable group and an easier early knockout path can be valuable because it is likely to collect points before the final rounds.</p></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>6) Draft Rules</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li>Draft any number of national teams.</li><li>Stay at or below the 100-point budget.</li><li>There are no pot, group, or roster-size caps.</li></ul></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>7) Tie-breakers</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li>Total points.</li><li>If tied: most semifinal teams drafted.</li><li>If still tied: most finalists drafted.</li><li>If still tied: split pot or commissioner decides.</li></ul></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>8) FAQ / Edge Cases</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li><b>Group-stage draws:</b> each drafted team earns 2 points.</li><li><b>Third-place qualifiers:</b> official advancement to the Round of 32 earns the same advancement points.</li><li><b>Extra time and penalties:</b> knockout scoring follows official advancement.</li><li><b>Scoring updates:</b> automated when games go final.</li></ul></section>
    </>
  );
}

export default function HowItWorksRulesContent() {
  const pathname = usePathname();
  const [sport, setSport] = useState<"basketball" | "soccer">(
    pathname.startsWith("/world-cup") ? "soccer" : "basketball",
  );

  return (
    <>
      <div style={{ display: "flex", gap: 8, margin: "14px 0 4px", flexWrap: "wrap" }} aria-label="Choose rules by sport">
        {(["basketball", "soccer"] as const).map((option) => (
          <button
            type="button"
            key={option}
            onClick={() => setSport(option)}
            aria-pressed={sport === option}
            className={`ui-btn ui-btn--md ${sport === option ? "ui-btn--primary" : "ui-btn--secondary"}`}
          >
            {option}
          </button>
        ))}
      </div>
      {sport === "soccer" ? <SoccerRules /> : <BasketballRules />}
    </>
  );
}

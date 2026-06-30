"use client";

import type { ReactNode } from "react";
import {
  WORLD_CUP_DRAFT_TIERS,
  WORLD_CUP_LONGSHOT_BONUS_EVENTS,
  WORLD_CUP_SCORING_EVENTS,
  WORLD_CUP_VALUE_RUN_BONUS_EVENTS,
} from "@/lib/worldCupRules";
import type { CompetitionSlug } from "@/lib/competitions";
import WorldCupTeamLabel from "@/app/components/WorldCupTeamLabel";

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
  rows: ReadonlyArray<readonly [ReactNode, ReactNode]>;
}) {
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--border-color)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", fontWeight: 900, background: "var(--surface-muted)" }}>
        <div>{columns[0]}</div>
        <div style={{ textAlign: "right" }}>{columns[1]}</div>
      </div>
      {rows.map(([label, value], index) => (
        <div key={index} style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", borderTop: "1px solid var(--border-color)" }}>
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
        <RulesTable
          columns={["Tier and National Teams", "Draft Cost"]}
          rows={WORLD_CUP_DRAFT_TIERS.map((tier) => [
            <span style={{ display: "grid", gap: 6 }}>
              <strong>{tier.name}</strong>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {tier.teams.map((team) => (
                  <WorldCupTeamLabel key={team} name={team} />
                ))}
              </span>
            </span>,
            tier.cost,
          ])}
        />
        <p style={{ marginTop: 10, opacity: 0.85 }}>Example: Diamond-tier Spain costs 24 points. Moonshot teams cost 3 points.</p>
      </section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>2) Base Points Per Result</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>Scoring is cumulative. Group-stage results score immediately, then each knockout advancement adds progressively more points.</p>
        <RulesTable columns={["Result", "Points"]} rows={WORLD_CUP_SCORING_EVENTS} />
      </section>
      <section className="legal-doc-section">
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>3) Bonuses for Value Picks</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>Bronze- and Value-tier teams priced <b>10 points or lower</b> earn extra cumulative Value Run bonuses when they advance.</p>
        <RulesTable columns={["10-Point-or-Lower Result", "Additional Bonus"]} rows={WORLD_CUP_VALUE_RUN_BONUS_EVENTS} />
        <p style={{ marginTop: 16, lineHeight: 1.6 }}>Longshot- and Moonshot-tier teams priced <b>5 points or lower</b> use a larger longshot bonus schedule instead.</p>
        <RulesTable columns={["5-Point-or-Lower Result", "Additional Bonus"]} rows={WORLD_CUP_LONGSHOT_BONUS_EVENTS} />
        <p style={{ marginTop: 10, opacity: 0.85 }}>Every team earns the same 6 base points for a group-stage win. Value bonuses reward the harder achievement: a low-priced team surviving its group and continuing to advance.</p>
      </section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>4) Why Prices Differ</h2><p style={{ marginTop: 10, lineHeight: 1.6 }}>Price is not based only on the chance to win the championship. A team with a favorable group and an easier early knockout path can be valuable because it is likely to collect points before the final rounds.</p></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>5) Draft Rules</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li>Draft any number of national teams.</li><li>Stay at or below the 100-point budget.</li><li>Draft at most 3 Gold-or-higher teams priced 20 points or higher.</li><li>There are no pot, group, or roster-size caps.</li></ul></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>6) Tie-breakers</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li>Total points.</li><li>If tied: most semifinal teams drafted.</li><li>If still tied: most finalists drafted.</li><li>If still tied: split pot or commissioner decides.</li></ul></section>
      <section className="legal-doc-section"><h2 style={{ fontSize: 20, fontWeight: 900 }}>7) FAQ / Edge Cases</h2><ul style={{ marginTop: 10, lineHeight: 1.6 }}><li><b>Group-stage draws:</b> each drafted team earns 2 points.</li><li><b>Third-place qualifiers:</b> official advancement to the Round of 32 earns the same advancement points.</li><li><b>Extra time and penalties:</b> knockout scoring follows official advancement.</li><li><b>Scoring updates:</b> automated when games go final.</li></ul></section>
    </>
  );
}

export default function HowItWorksRulesContent({
  competitionSlug,
}: {
  competitionSlug: CompetitionSlug;
}) {
  return competitionSlug === "world-cup" ? <SoccerRules /> : <BasketballRules />;
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProjectionFactorRow = {
  label: string;
  value: string;
};

type ProjectionResult = {
  player: {
    name: string;
    team: string | null;
    position: string | null;
    age: number | null;
    year: string | null;
    coach: string | null;
    system: string | null;
    role: string | null;
    minutesPerGame: number;
  };
  factors: {
    trajectory: number;
    momentum: number;
    situation: number;
    coachImpact: number;
    systemFit: number;
    growthPotential: number;
    opportunity: number;
  };
  projection: {
    projectedPPG: number;
    projectedRPG: number;
    projectedAPG: number;
    projected3P: number;
    projectedFG: number;
    projectedFT: number;
    projectedBPG: number;
    projectedSPG: number;
    formulaDetails: {
      scoreSummary: string;
      ppg: string;
      rpg: string;
      apg: string;
      threePoint: string;
      fieldGoal: string;
      freeThrow: string;
      blocks: string;
      steals: string;
    };
  };
  explanation: string;
  source: string;
  matches: Array<{ id: string; name: string; team: string | null }>;
};

export default function AdminPlayerLookup() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectionResult | null>(null);

  const submitSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Type a player name first.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error("Your auth session is missing. Refresh the page and try again.");
      }

      const res = await fetch(`/api/admin/player-projection?name=${encodeURIComponent(trimmed)}`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Lookup failed.");
        setLoading(false);
        return;
      }

      setResult(json as ProjectionResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const factorRows: ProjectionFactorRow[] = result
    ? [
        { label: "Trajectory", value: result.factors.trajectory.toFixed(3) },
        { label: "Momentum", value: result.factors.momentum.toFixed(3) },
        { label: "Situation", value: result.factors.situation.toFixed(3) },
        { label: "Coach impact", value: result.factors.coachImpact.toFixed(3) },
        { label: "System fit", value: result.factors.systemFit.toFixed(3) },
        { label: "Growth potential", value: result.factors.growthPotential.toFixed(3) },
        { label: "Opportunity", value: result.factors.opportunity.toFixed(3) },
      ]
    : [];

  return (
    <details style={{ border: "1px solid var(--border-color)", borderRadius: 12, padding: 16, background: "var(--surface-muted)" }}>
      <summary style={{ fontSize: 18, fontWeight: 900, cursor: "pointer" }}>
        Auto player lookup: projections by name
      </summary>

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          Type a D1 NCAA player name and the system will attempt to retrieve that player’s profile, compute historic-factor multipliers, and generate projection output.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter player name"
            style={{ flex: 1, minWidth: 250, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--surface)" }}
          />
          <button
            type="button"
            onClick={submitSearch}
            disabled={loading}
            style={{ minWidth: 120, padding: "10px 14px", borderRadius: 8, fontWeight: 700 }}
          >
            {loading ? "Searching…" : "Lookup"}
          </button>
        </div>

        {error ? (
          <div style={{ color: "var(--danger-foreground)", fontWeight: 700 }}>{error}</div>
        ) : null}

        {result ? (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 8, border: "1px solid var(--border-color)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
              <div style={{ fontWeight: 700 }}>Matched player</div>
              <div>{result.player.name}</div>
              <div>{result.player.team ? `Team: ${result.player.team}` : "Team not available"}</div>
              <div>{result.player.position ? `Position: ${result.player.position}` : "Position not available"}</div>
              <div>{result.player.age ? `Age: ${result.player.age}` : "Age not available"}</div>
              <div>{result.player.year ? `Year: ${result.player.year}` : "Season/year not available"}</div>
              <div>{result.player.coach ? `Coach: ${result.player.coach}` : "Coach not available"}</div>
              <div>{result.player.system ? `System: ${result.player.system}` : "System not available"}</div>
              <div>{`Minutes per game: ${result.player.minutesPerGame.toFixed(1)}`}</div>
            </div>

            {result.matches.length > 1 ? (
              <div style={{ display: "grid", gap: 6, border: "1px solid var(--border-color)", borderRadius: 12, padding: 12, background: "var(--surface)" }}>
                <div style={{ fontWeight: 700 }}>Other possible matches</div>
                {result.matches.map((match) => (
                  <div key={match.id}>
                    {match.name}{match.team ? ` — ${match.team}` : ""}
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Auto-derived factors</div>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                {factorRows.map((row) => (
                  <div key={row.label} style={{ padding: 10, border: "1px solid var(--border-color)", borderRadius: 12, background: "var(--surface)" }}>
                    <div style={{ fontWeight: 700 }}>{row.label}</div>
                    <div>{row.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color)" }}>Stat</th>
                    <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid var(--border-color)" }}>Projection</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["PPG", result.projection.projectedPPG.toFixed(1)],
                    ["RPG", result.projection.projectedRPG.toFixed(1)],
                    ["APG", result.projection.projectedAPG.toFixed(1)],
                    ["3P%", `${(result.projection.projected3P * 100).toFixed(1)}%`],
                    ["FG%", `${(result.projection.projectedFG * 100).toFixed(1)}%`],
                    ["FT%", `${(result.projection.projectedFT * 100).toFixed(1)}%`],
                    ["BPG", result.projection.projectedBPG.toFixed(1)],
                    ["SPG", result.projection.projectedSPG.toFixed(1)],
                  ].map(([stat, value]) => (
                    <tr key={stat as string}>
                      <td style={{ padding: 8, borderBottom: "1px solid var(--border-color)", fontWeight: 700 }}>{stat}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid var(--border-color)", textAlign: "right" }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ fontWeight: 700 }}>Explanation</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border-color)", fontSize: 13 }}>
              {result.explanation}
              {"\n\n"}
              {result.projection.formulaDetails.scoreSummary}
              {"\n\n"}
              {result.projection.formulaDetails.ppg}
              {"\n\n"}
              {result.projection.formulaDetails.rpg}
              {"\n\n"}
              {result.projection.formulaDetails.apg}
              {"\n\n"}
              {result.projection.formulaDetails.threePoint}
              {"\n\n"}
              {result.projection.formulaDetails.fieldGoal}
              {"\n\n"}
              {result.projection.formulaDetails.freeThrow}
              {"\n\n"}
              {result.projection.formulaDetails.blocks}
              {"\n\n"}
              {result.projection.formulaDetails.steals}
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

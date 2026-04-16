"use client";

import { useMemo, useState } from "react";
import {
  defaultProjectionInput,
  type PlayerProjectionInput,
  projectPlayerStats,
} from "@/lib/playerProjection";

const labelStyle = {
  fontWeight: 700,
  fontSize: 13,
  marginBottom: 6,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  minHeight: 42,
  borderRadius: 8,
  border: "1px solid var(--border-color)",
  background: "var(--surface)",
};

const sliderStyle = {
  width: "100%",
};

export default function AdminProjectionTool() {
  const [input, setInput] = useState<PlayerProjectionInput>(defaultProjectionInput);
  const projection = useMemo(() => projectPlayerStats(input), [input]);

  const updateNumber = (field: Exclude<keyof PlayerProjectionInput, "playerName">, value: number) => {
    setInput((current) => ({ ...current, [field]: value }));
  };

  const updateText = (field: "playerName", value: string) => {
    setInput((current) => ({ ...current, [field]: value }));
  };

  return (
    <details style={{ border: "1px solid var(--border-color)", borderRadius: 12, padding: 16, background: "var(--surface-muted)" }}>
      <summary style={{ fontSize: 18, fontWeight: 900, cursor: "pointer" }}>
        Hidden Admin Projection Engine
      </summary>

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          This tool is only visible to site admins. Enter a player baseline and situational factors, and the engine will show the projected stat line and the exact formulas used.
        </p>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={labelStyle}>Player name</label>
            <input
              style={inputStyle}
              value={input.playerName}
              onChange={(event) => updateText("playerName", event.target.value)}
            />

            <label style={labelStyle}>Previous PPG</label>
            <input
              style={inputStyle}
              type="number"
              value={input.previousPPG}
              step={0.1}
              onChange={(event) => updateNumber("previousPPG", Number(event.target.value))}
            />

            <label style={labelStyle}>Previous RPG</label>
            <input
              style={inputStyle}
              type="number"
              value={input.previousRPG}
              step={0.1}
              onChange={(event) => updateNumber("previousRPG", Number(event.target.value))}
            />

            <label style={labelStyle}>Previous APG</label>
            <input
              style={inputStyle}
              type="number"
              value={input.previousAPG}
              step={0.1}
              onChange={(event) => updateNumber("previousAPG", Number(event.target.value))}
            />

            <label style={labelStyle}>Previous 3P%</label>
            <input
              style={inputStyle}
              type="number"
              value={input.previous3P * 100}
              step={0.1}
              onChange={(event) => updateNumber("previous3P", Number(event.target.value) / 100)}
            />

            <label style={labelStyle}>Previous FG%</label>
            <input
              style={inputStyle}
              type="number"
              value={input.previousFG * 100}
              step={0.1}
              onChange={(event) => updateNumber("previousFG", Number(event.target.value) / 100)}
            />

            <label style={labelStyle}>Previous FT%</label>
            <input
              style={inputStyle}
              type="number"
              value={input.previousFT * 100}
              step={0.1}
              onChange={(event) => updateNumber("previousFT", Number(event.target.value) / 100)}
            />
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Momentum</label>
              <input
                style={sliderStyle}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={input.momentum}
                onChange={(event) => updateNumber("momentum", Number(event.target.value))}
              />
              <div style={{ marginTop: 4 }}>{(input.momentum * 100).toFixed(0)}%</div>
            </div>

            <div>
              <label style={labelStyle}>Situation / role</label>
              <input
                style={sliderStyle}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={input.situation}
                onChange={(event) => updateNumber("situation", Number(event.target.value))}
              />
              <div style={{ marginTop: 4 }}>{(input.situation * 100).toFixed(0)}%</div>
            </div>

            <div>
              <label style={labelStyle}>Coach impact</label>
              <input
                style={sliderStyle}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={input.coachImpact}
                onChange={(event) => updateNumber("coachImpact", Number(event.target.value))}
              />
              <div style={{ marginTop: 4 }}>{(input.coachImpact * 100).toFixed(0)}%</div>
            </div>

            <div>
              <label style={labelStyle}>System fit</label>
              <input
                style={sliderStyle}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={input.systemFit}
                onChange={(event) => updateNumber("systemFit", Number(event.target.value))}
              />
              <div style={{ marginTop: 4 }}>{(input.systemFit * 100).toFixed(0)}%</div>
            </div>

            <div>
              <label style={labelStyle}>Growth potential</label>
              <input
                style={sliderStyle}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={input.growthPotential}
                onChange={(event) => updateNumber("growthPotential", Number(event.target.value))}
              />
              <div style={{ marginTop: 4 }}>{(input.growthPotential * 100).toFixed(0)}%</div>
            </div>

            <div>
              <label style={labelStyle}>Opportunity / usage</label>
              <input
                style={sliderStyle}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={input.opportunity}
                onChange={(event) => updateNumber("opportunity", Number(event.target.value))}
              />
              <div style={{ marginTop: 4 }}>{(input.opportunity * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6, alignItems: "center", gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <div style={labelStyle}>Previous minutes per game</div>
              <input
                style={inputStyle}
                type="number"
                value={input.minutesPerGame}
                step={0.1}
                onChange={(event) => updateNumber("minutesPerGame", Number(event.target.value))}
              />
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color)" }}>Stat</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid var(--border-color)" }}>Baseline</th>
                  <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid var(--border-color)" }}>Projection</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["PPG", input.previousPPG.toFixed(1), projection.projectedPPG.toFixed(1)],
                  ["RPG", input.previousRPG.toFixed(1), projection.projectedRPG.toFixed(1)],
                  ["APG", input.previousAPG.toFixed(1), projection.projectedAPG.toFixed(1)],
                  ["3P%", `${(input.previous3P * 100).toFixed(1)}%`, `${(projection.projected3P * 100).toFixed(1)}%`],
                  ["FG%", `${(input.previousFG * 100).toFixed(1)}%`, `${(projection.projectedFG * 100).toFixed(1)}%`],
                  ["FT%", `${(input.previousFT * 100).toFixed(1)}%`, `${(projection.projectedFT * 100).toFixed(1)}%`],
                  ["BPG", input.previousBPG.toFixed(1), projection.projectedBPG.toFixed(1)],
                  ["SPG", input.previousSPG.toFixed(1), projection.projectedSPG.toFixed(1)],
                ].map(([stat, baseline, projected]) => (
                  <tr key={stat}>
                    <td style={{ padding: 8, borderBottom: "1px solid var(--border-color)", fontWeight: 700 }}>{stat}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid var(--border-color)", textAlign: "right" }}>{baseline}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid var(--border-color)", textAlign: "right" }}>{projected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>Formula transparency</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border-color)", fontSize: 13 }}>
              {projection.formulaDetails.scoreSummary}
              {"\n\n"}
              {projection.formulaDetails.ppg}
              {"\n\n"}
              {projection.formulaDetails.rpg}
              {"\n\n"}
              {projection.formulaDetails.apg}
              {"\n\n"}
              {projection.formulaDetails.threePoint}
              {"\n\n"}
              {projection.formulaDetails.fieldGoal}
              {"\n\n"}
              {projection.formulaDetails.freeThrow}
              {"\n\n"}
              {projection.formulaDetails.blocks}
              {"\n\n"}
              {projection.formulaDetails.steals}
            </pre>
          </div>
        </div>
      </div>
    </details>
  );
}

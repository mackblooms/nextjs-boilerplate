"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type Team = {
  id: string;
  name: string;
  seed_in_region: number | null;
  region: string | null;
  logo_url?: string | null;
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

type PlayerOption = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

type RoundKey = "R64" | "R32" | "S16" | "E8";

const REGIONS = ["East", "West", "South", "Midwest"] as const;
type Region = (typeof REGIONS)[number];

const isRegion = (value: string | null): value is Region => value !== null && REGIONS.includes(value as Region);

export default function BracketPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entry");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [highlightTeamIds, setHighlightTeamIds] = useState<Set<string>>(new Set());

  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const byRoundByRegion = useMemo(() => {
    const out: Record<Region, Record<RoundKey, Game[]>> = {
      East: { R64: [], R32: [], S16: [], E8: [] },
      West: { R64: [], R32: [], S16: [], E8: [] },
      South: { R64: [], R32: [], S16: [], E8: [] },
      Midwest: { R64: [], R32: [], S16: [], E8: [] },
    };

    for (const g of games) {
      if (!isRegion(g.region)) continue;
      if (g.round === "R64" || g.round === "R32" || g.round === "S16" || g.round === "E8") {
        out[g.region][g.round].push(g);
      }
    }

    for (const region of REGIONS) {
      for (const round of ["R64", "R32", "S16", "E8"] as const) {
        out[region][round].sort((a, b) => a.slot - b.slot);
      }
    }

    return out;
  }, [games]);

  const finalFour = useMemo(
    () => games.filter((g) => g.round === "F4").sort((a, b) => a.slot - b.slot),
    [games],
  );

  const championship = useMemo(() => games.find((g) => g.round === "CHIP"), [games]);

  const BRACKET_UNITS = 16;
  const UNIT_PX = 44;
  const GAME_SPAN = 2;

  const rowStartFor = (round: RoundKey, slot: number) => {
    if (round === "R64") return (slot - 1) * 2 + 1;
    if (round === "R32") return (slot - 1) * 4 + 2;
    if (round === "S16") return (slot - 1) * 8 + 4;
    return 8;
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }

      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,region,seed_in_region,logo_url");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }
      setTeams((teamRows ?? []) as Team[]);

      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }
      setGames((gameRows ?? []) as Game[]);

      const { data: playerRows, error: playerErr } = await supabase
        .from("pool_leaderboard")
        .select("entry_id,user_id,display_name")
        .eq("pool_id", poolId)
        .order("display_name", { ascending: true });

      if (playerErr) {
        setMsg(playerErr.message);
        setLoading(false);
        return;
      }

      const opts = (playerRows ?? []) as PlayerOption[];
      setPlayers(opts);
      setSelectedEntryId(entryId ?? opts[0]?.entry_id ?? "");
      setLoading(false);
    };

    void load();
  }, [entryId, poolId]);

  useEffect(() => {
    const loadHighlights = async () => {
      setHighlightTeamIds(new Set());
      if (!selectedEntryId) return;

      const { data, error } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", selectedEntryId);

      if (error) {
        setMsg(error.message);
        return;
      }

      setHighlightTeamIds(new Set((data ?? []).map((r) => r.team_id as string)));
    };

    void loadHighlights();
  }, [selectedEntryId]);

  useEffect(() => {
    const applyFitScale = () => {
      if (!fitMode) return;
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) return;

      const next = Math.min(1, viewport.clientWidth / content.scrollWidth);
      setScale(Math.max(0.35, next));
    };

    applyFitScale();
    window.addEventListener("resize", applyFitScale);
    return () => window.removeEventListener("resize", applyFitScale);
  }, [fitMode]);

  const zoomIn = () => {
    setFitMode(false);
    setScale((s) => Math.min(1.25, +(s + 0.1).toFixed(2)));
  };

  const zoomOut = () => {
    setFitMode(false);
    setScale((s) => Math.max(0.35, +(s - 0.1).toFixed(2)));
  };

  const setFit = () => setFitMode(true);
  const set100 = () => {
    setFitMode(false);
    setScale(1);
  };

  const renderTeam = (teamId: string | null, winnerId: string | null) => {
    if (!teamId) {
      return (
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            opacity: 0.6,
            fontWeight: 700,
          }}
        >
          <span>TBD</span>
          <span />
        </span>
      );
    }

    const t = teamById.get(teamId);
    const isHighlighted = highlightTeamIds.has(teamId);
    const isWinner = winnerId === teamId;

    return (
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: isHighlighted ? "var(--highlight)" : "transparent",
          fontWeight: isWinner ? 900 : 700,
          alignItems: "center",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {t?.logo_url ? (
            <Image
              src={t.logo_url}
              alt={t.name ?? "Team"}
              width={18}
              height={18}
              style={{ objectFit: "contain", flexShrink: 0 }}
              unoptimized
            />
          ) : (
            <span style={{ width: 18, height: 18, flexShrink: 0 }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t?.name ?? "Unknown"}
          </span>
        </span>
        <span
          style={{
            opacity: 0.75,
            flexShrink: 0,
            width: 22,
            textAlign: "right",
            whiteSpace: "nowrap",
            lineHeight: "18px",
          }}
        >
          {t?.seed_in_region ?? ""}
        </span>
      </span>
    );
  };

  const renderGameBox = (children: ReactNode) => (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 6,
        background: "var(--surface)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );

  const renderSingleTeamBox = (teamId: string | null, winnerId: string | null) => (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 6,
        background: "var(--surface)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      {renderTeam(teamId, winnerId)}
    </div>
  );

  const renderRegionBracket = (region: Region, reverse = false) => {
    const rounds = byRoundByRegion[region];

    const renderRoundColumn = (title: string, roundKey: RoundKey) => {
      const gamesForRound = rounds[roundKey] ?? [];

      return (
        <div style={{ minWidth: 260 }}>
          <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9 }}>{title}</div>
          <div
            style={{
              display: "grid",
              gridTemplateRows: `repeat(${BRACKET_UNITS}, ${UNIT_PX}px)`,
              gap: 0,
            }}
          >
            {gamesForRound.map((g) => {
              const start = rowStartFor(roundKey, g.slot);
              return (
                <div key={g.id} style={{ gridRow: `${start} / span ${GAME_SPAN}` }}>
                  {renderGameBox(
                    <>
                      {renderTeam(g.team1_id, g.winner_team_id)}
                      {renderTeam(g.team2_id, g.winner_team_id)}
                    </>,
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <section
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 16,
          padding: 14,
          background: "var(--surface-muted)",
          minWidth: 4 * 260 + 3 * 16 + 40,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 12, textAlign: reverse ? "left" : "inherit" }}>{region}</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(260px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {!reverse ? (
            <>
              {renderRoundColumn("Round of 64", "R64")}
              {renderRoundColumn("Round of 32", "R32")}
              {renderRoundColumn("Sweet 16", "S16")}
              {renderRoundColumn("Elite 8", "E8")}
            </>
          ) : (
            <>
              {renderRoundColumn("Elite 8", "E8")}
              {renderRoundColumn("Sweet 16", "S16")}
              {renderRoundColumn("Round of 32", "R32")}
              {renderRoundColumn("Round of 64", "R64")}
            </>
          )}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>
        {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        <p style={{ marginTop: 12, opacity: 0.8 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "100%", margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", maxWidth: 1800, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={`/pool/${poolId}`} style={{ padding: "10px 12px", border: "1px solid var(--border-color)", borderRadius: 10, textDecoration: "none", fontWeight: 900 }}>Back to Pool</Link>
          <Link href={`/pool/${poolId}/leaderboard`} style={{ padding: "10px 12px", border: "1px solid var(--border-color)", borderRadius: 10, textDecoration: "none", fontWeight: 900 }}>Leaderboard</Link>
        </div>
      </div>

      {entryId ? (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "var(--highlight)", border: "1px solid var(--highlight-border)", fontWeight: 900, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, maxWidth: 1800, marginInline: "auto" }}>
        <div>Viewing a player’s bracket (highlighting their teams)</div>
          <Link href={`/pool/${poolId}/bracket`} style={{ fontWeight: 900, textDecoration: "none", border: "1px solid var(--highlight-border)", padding: "8px 10px", borderRadius: 10, background: "var(--surface)" }}>Clear</Link>
        </div>
      ) : null}

      {msg ? <p style={{ marginTop: 12, maxWidth: 1800, marginInline: "auto" }}>{msg}</p> : null}

      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", maxWidth: 1800, marginInline: "auto" }}>
        <div style={{ fontWeight: 900 }}>Highlight picks for:</div>
        <select value={selectedEntryId} onChange={(e) => setSelectedEntryId(e.target.value)} style={{ padding: "8px 10px", borderRadius: 10 }}>
          {players.length === 0 ? <option value="">No players yet</option> : null}
          {players.map((p) => (
            <option key={p.entry_id} value={p.entry_id}>{p.display_name ?? p.user_id.slice(0, 8)}</option>
          ))}
        </select>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Highlighted teams show in <b>yellow</b>.</div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", maxWidth: 1800, marginInline: "auto" }}>
        <div style={{ fontWeight: 900 }}>View:</div>
        <button onClick={setFit} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border-color)", background: fitMode ? "var(--surface-elevated)" : "var(--surface)", fontWeight: 900, cursor: "pointer" }}>Fit</button>
        <button onClick={set100} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border-color)", background: !fitMode && scale === 1 ? "var(--surface-elevated)" : "var(--surface)", fontWeight: 900, cursor: "pointer" }}>100%</button>
        <button onClick={zoomOut} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border-color)", background: "var(--surface)", fontWeight: 900, cursor: "pointer" }}>−</button>
        <button onClick={zoomIn} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border-color)", background: "var(--surface)", fontWeight: 900, cursor: "pointer" }}>+</button>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Zoom: <b>{Math.round(scale * 100)}%</b></div>
      </div>

<div
  ref={viewportRef}
  style={{
    marginTop: 12,
    border: "1px solid var(--border-color)",
    borderRadius: 14,
    background: "var(--surface)",
    padding: 12,
    overflowX: "auto",
    overflowY: "hidden",
  }}
>
  <div
    ref={contentRef}
    style={{
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      width: "max-content",
      margin: "0 auto",
    }}
  >
    <div style={{ display: "flex", gap: 18, alignItems: "center", minWidth: 3200 }}>
      <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
        {renderRegionBracket("East")}
        {renderRegionBracket("West")}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 860 }}>
        <section style={{ border: "1px solid var(--border-color)", borderRadius: 16, padding: 14, background: "var(--surface)", width: 860 }}>
          <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 16, textAlign: "center" }}>Final Four</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr minmax(280px, 320px) 1fr",
              gridTemplateRows: "minmax(56px, auto) minmax(96px, auto) minmax(56px, auto)",
              columnGap: 18,
              rowGap: 20,
              alignItems: "center",
            }}
          >
            <div style={{ gridColumn: 1, gridRow: 1 }}>{renderSingleTeamBox(finalFour[0]?.team1_id ?? null, finalFour[0]?.winner_team_id ?? null)}</div>
            <div style={{ gridColumn: 3, gridRow: 1 }}>{renderSingleTeamBox(finalFour[0]?.team2_id ?? null, finalFour[0]?.winner_team_id ?? null)}</div>
            <div style={{ gridColumn: 1, gridRow: 3 }}>{renderSingleTeamBox(finalFour[1]?.team1_id ?? null, finalFour[1]?.winner_team_id ?? null)}</div>
            <div style={{ gridColumn: 3, gridRow: 3 }}>{renderSingleTeamBox(finalFour[1]?.team2_id ?? null, finalFour[1]?.winner_team_id ?? null)}</div>

            <div style={{ gridColumn: 2, gridRow: 2, alignSelf: "center", justifySelf: "center", width: "100%" }}>
              <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9, fontSize: 12, textAlign: "center" }}>Championship</div>
              {renderGameBox(
                <>
                  {renderTeam(championship?.team1_id ?? null, championship?.winner_team_id ?? null)}
                  {renderTeam(championship?.team2_id ?? null, championship?.winner_team_id ?? null)}
                </>,
              )}
            </div>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
        {renderRegionBracket("South", true)}
        {renderRegionBracket("Midwest", true)}
      </div>
    </div>
  </div>
</div>

    </main>
  );
}

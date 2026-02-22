"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { useSearchParams } from "next/navigation";

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

const REGIONS = ["East", "West", "South", "Midwest"] as const;

// Mapping for R64 slot -> seed pair (for label display only)

export default function BracketPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");

  const [highlightTeamIds, setHighlightTeamIds] = useState<Set<string>>(new Set());

  const searchParams = useSearchParams();
  const entryId = searchParams.get("entry");

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

const r64ByRegion = useMemo(() => {
  const out: Record<string, Game[]> = {};
  for (const r of REGIONS) out[r] = [];
  for (const g of games) {
    if (g.round === "R64" && g.region && out[g.region]) {
      out[g.region].push(g);
    }
  }
  for (const r of REGIONS) out[r].sort((a, b) => a.slot - b.slot);
  return out;
}, [games]);

const r32ByRegion = useMemo(() => {
  const out: Record<string, Game[]> = {};
  for (const r of REGIONS) out[r] = [];
  for (const g of games) {
    if (g.round === "R32" && g.region && out[g.region]) {
      out[g.region].push(g);
    }
  }
  for (const r of REGIONS) out[r].sort((a, b) => a.slot - b.slot);
  return out;
}, [games]);

const s16ByRegion = useMemo(() => {
  const out: Record<string, Game[]> = {};
  for (const r of REGIONS) out[r] = [];
  for (const g of games) {
    if (g.round === "S16" && g.region && out[g.region]) {
      out[g.region].push(g);
    }
  }
  for (const r of REGIONS) out[r].sort((a, b) => a.slot - b.slot);
  return out;
}, [games]);

const e8ByRegion = useMemo(() => {
  const out: Record<string, Game[]> = {};
  for (const r of REGIONS) out[r] = [];
  for (const g of games) {
    if (g.round === "E8" && g.region && out[g.region]) {
      out[g.region].push(g);
    }
  }
  for (const r of REGIONS) out[r].sort((a, b) => a.slot - b.slot);
  return out;
}, [games]);

const finalFour = useMemo(() => {
  return games
    .filter((g) => g.round === "F4")
    .sort((a, b) => a.slot - b.slot);
}, [games]);

const championship = useMemo(() => {
  return games.find((g) => g.round === "CHIP");
}, [games]);



const byRegionRound = useMemo(() => {
  return {
    East: {
      R64: r64ByRegion["East"] ?? [],
      R32: r32ByRegion["East"] ?? [],
      S16: s16ByRegion["East"] ?? [],
      E8: e8ByRegion["East"] ?? [],
    },
    West: {
      R64: r64ByRegion["West"] ?? [],
      R32: r32ByRegion["West"] ?? [],
      S16: s16ByRegion["West"] ?? [],
      E8: e8ByRegion["West"] ?? [],
    },
    South: {
      R64: r64ByRegion["South"] ?? [],
      R32: r32ByRegion["South"] ?? [],
      S16: s16ByRegion["South"] ?? [],
      E8: e8ByRegion["South"] ?? [],
    },
    Midwest: {
      R64: r64ByRegion["Midwest"] ?? [],
      R32: r32ByRegion["Midwest"] ?? [],
      S16: s16ByRegion["Midwest"] ?? [],
      E8: e8ByRegion["Midwest"] ?? [],
    },
  };
}, [r64ByRegion, r32ByRegion, s16ByRegion, e8ByRegion]);
  
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

      // Teams (need region + seed_in_region)
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,region,seed_in_region,logo_url")


      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }
      setTeams((teamRows ?? []) as Team[]);

      // Games
      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }
      setGames((gameRows ?? []) as Game[]);

      // Players in this pool (use pool_leaderboard to get entry_id + display name)
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

      // Default: select first player (or none)
      // If URL has ?entry=, use that player. Otherwise default to first.
if (entryId) {
  setSelectedEntryId(entryId);
} else {
  setSelectedEntryId(opts[0]?.entry_id ?? "");
}

      setLoading(false);
    };

    load();
  }, [poolId, entryId]);

  // Load highlighted teams whenever selectedEntryId changes
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

      setHighlightTeamIds(new Set((data ?? []).map((r: any) => r.team_id)));
    };

    loadHighlights();
  }, [selectedEntryId]);

function renderTeam(teamId: string | null, winnerId: string | null) {
  if (!teamId)
  return (
    <span
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        padding: "6px 8px",
        borderRadius: 8,
        border: "1px solid #eee",
        opacity: 0.6,
        fontWeight: 700,
      }}
    >
      <span>TBD</span>
      <span />
    </span>
  );

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
        border: "1px solid #eee",
        background: isHighlighted ? "#fff6d6" : "transparent",
        fontWeight: isWinner ? 900 : 700,
        alignItems: "center",
      }}
    >
      {/* LEFT: logo + team name */}
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
          <img
            src={t.logo_url}
            alt={t?.name ?? "Team"}
            width={18}
            height={18}
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
        ) : (
          // keeps alignment consistent even if logo missing
          <span style={{ width: 18, height: 18, flexShrink: 0 }} />
        )}

        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t?.name ?? "Unknown"}
        </span>
      </span>

      {/* RIGHT: seed */}
      <span style={{ opacity: 0.75, flexShrink: 0 }}>
        {t?.seed_in_region ?? ""}
      </span>
    </span>
  );
}
  
function BracketColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 260 }}>
      <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9 }}>{title}</div>
      <div style={{ display: "grid", gap: 14 }}>{children}</div>
    </div>
  );
}

function GameBox({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #e9e9e9",
        borderRadius: 14,
        padding: 10,
        background: "white",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}  

function RegionBracket({
  region,
  reverse = false,
}: {
  region: (typeof REGIONS)[number];
  reverse?: boolean;
}) {
  const rounds = byRegionRound[region];

  return (
    <section
      style={{
        border: "1px solid #ddd",
        borderRadius: 16,
        padding: 14,
        background: "#fafafa",
        minWidth: 4 * 260 + 3 * 16 + 40,
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 12 }}>{region}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(260px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* If reverse=false (left side): R64 -> R32 -> S16 -> E8 */}
        {/* If reverse=true  (right side): E8 -> S16 -> R32 -> R64 */}

        {!reverse ? (
          <>
            <BracketColumn title="Round of 64">
              {(rounds?.R64 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>

            <BracketColumn title="Round of 32">
              {(rounds?.R32 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>

            <BracketColumn title="Sweet 16">
              {(rounds?.S16 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>

            <BracketColumn title="Elite 8">
              {(rounds?.E8 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>
          </>
        ) : (
          <>
            <BracketColumn title="Elite 8">
              {(rounds?.E8 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>

            <BracketColumn title="Sweet 16">
              {(rounds?.S16 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>

            <BracketColumn title="Round of 32">
              {(rounds?.R32 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>

            <BracketColumn title="Round of 64">
              {(rounds?.R64 ?? []).map((g) => (
                <GameBox key={g.id}>
                  {renderTeam(g.team1_id, g.winner_team_id)}
                  {renderTeam(g.team2_id, g.winner_team_id)}
                </GameBox>
              ))}
            </BracketColumn>
          </>
        )}
      </div>
    </section>
  );
}

if (loading) {
  return (
    <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={`/pool/${poolId}`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Back to Pool
          </a>

          <a
            href={`/pool/${poolId}/leaderboard`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Leaderboard
          </a>
        </div>
      </div>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
      <p style={{ marginTop: 12, opacity: 0.8 }}>Loading…</p>
    </main>
  );
}

  return (
    <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={`/pool/${poolId}`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Back to Pool
          </a>

          <a
            href={`/pool/${poolId}/leaderboard`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Leaderboard
          </a>
        </div>
      </div>
{entryId ? (
  <div
    style={{
      marginTop: 12,
      padding: "10px 12px",
      borderRadius: 12,
      background: "#fff6d6",
      border: "1px solid #f3e3a5",
      fontWeight: 900,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    }}
  >
    <div>
      Viewing a player’s bracket (highlighting their teams)
    </div>

    <a
      href={`/pool/${poolId}/bracket`}
      style={{
        fontWeight: 900,
        textDecoration: "none",
        border: "1px solid #d8c77b",
        padding: "8px 10px",
        borderRadius: 10,
        background: "white",
      }}
    >
      Clear
    </a>
  </div>
) : null}
      
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>Highlight picks for:</div>
        <select
          value={selectedEntryId}
          onChange={(e) => setSelectedEntryId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 10 }}
        >
          {players.length === 0 ? <option value="">No players yet</option> : null}
          {players.map((p) => (
            <option key={p.entry_id} value={p.entry_id}>
              {p.display_name ?? p.user_id.slice(0, 8)}
            </option>
          ))}
        </select>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Highlighted teams show in <b>yellow</b>.
        </div>
      </div>

      {/* Bracket (single source of truth) */}
      <div
        style={{
          marginTop: 18,
          overflowX: "auto",
          paddingBottom: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "flex-start",
            minWidth: 1800,
          }}
        >
          {/* LEFT SIDE: East + West */}
          <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
            <RegionBracket region={"East"} />
            <RegionBracket region={"West"} />
          </div>

          {/* CENTER: Final Four + Championship */}
          <section
            style={{
              border: "1px solid #ddd",
              borderRadius: 16,
              padding: 14,
              background: "#fff",
              minWidth: 360,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 16 }}>
              Final Four
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <GameBox>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Semifinal 1
                </div>
                {renderTeam(
                  finalFour?.[0]?.team1_id ?? null,
                  finalFour?.[0]?.winner_team_id ?? null
                )}
                {renderTeam(
                  finalFour?.[0]?.team2_id ?? null,
                  finalFour?.[0]?.winner_team_id ?? null
                )}
              </GameBox>

              <GameBox>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                  Semifinal 2
                </div>
                {renderTeam(
                  finalFour?.[1]?.team1_id ?? null,
                  finalFour?.[1]?.winner_team_id ?? null
                )}
                {renderTeam(
                  finalFour?.[1]?.team2_id ?? null,
                  finalFour?.[1]?.winner_team_id ?? null
                )}
              </GameBox>

              <div style={{ height: 8 }} />

              <div style={{ fontWeight: 900 }}>Championship</div>
              <GameBox>
                {renderTeam(
                  championship?.team1_id ?? null,
                  championship?.winner_team_id ?? null
                )}
                {renderTeam(
                  championship?.team2_id ?? null,
                  championship?.winner_team_id ?? null
                )}
              </GameBox>
            </div>
          </section>

{/* RIGHT SIDE: South + Midwest (mirrored) */}
<div style={{ display: "grid", gap: 18, alignContent: "start" }}>
  <RegionBracket region="South" reverse />
  <RegionBracket region="Midwest" reverse />
</div>
        </div>
       </div>
    </main>
  );
}
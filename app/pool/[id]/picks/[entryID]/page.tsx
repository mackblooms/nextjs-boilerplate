"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabaseClient";

type PickRow = {
  team_id: string;
  team_name: string;
  seed: number | null;
  cost: number | null;
  round_reached: string | null;
  total_team_score: number | null;
  logo_url?: string | null; // we’ll fill this in after
};

export default function PicksPage() {
  const params = useParams() as any;

const poolId = params.id as string | undefined;

// supports [entryId] OR [entryid] OR [entryID]
const entryId =
  (params.entryId as string | undefined) ??
  (params.entryid as string | undefined) ??
  (params.entryID as string | undefined);

  if (!poolId || !entryId) {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Player Picks</h1>
      <p style={{ marginTop: 12 }}>
        Missing poolId or entryId in the URL. This usually means the folder name
        for the route doesn’t match the param name (e.g., [entryId] vs [entryid]).
      </p>
      <p style={{ marginTop: 12, opacity: 0.85 }}>
        Current URL should look like: /pool/&lt;poolId&gt;/picks/&lt;entryId&gt;
      </p>
    </main>
  );
}

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [displayName, setDisplayName] = useState("Player");
  const [picks, setPicks] = useState<PickRow[]>([]);

  const totalScore = useMemo(
    () => picks.reduce((s, p) => s + (p.total_team_score ?? 0), 0),
    [picks]
  );

  const totalCost = useMemo(
    () => picks.reduce((s, p) => s + (p.cost ?? 0), 0),
    [picks]
  );

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

      // Get entry info
      const { data: entryRow, error: entryErr } = await supabase
        .from("entries")
        .select("id,pool_id,user_id")
        .eq("id", entryId)
        .single();

      if (entryErr) {
        setMsg(entryErr.message);
        setLoading(false);
        return;
      }

      if (entryRow.pool_id !== poolId) {
        setMsg("That entry does not belong to this pool.");
        setLoading(false);
        return;
      }

      // Get display name
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", entryRow.user_id)
        .maybeSingle();

      setDisplayName(prof?.display_name ?? "Player");

      // Get picks
const { data: pickRows, error: picksErr } = await supabase
  .from("entry_pick_details")
  .select("team_id,team_name,seed,cost,round_reached,total_team_score")
  .eq("entry_id", entryId);

if (picksErr) {
  setMsg(picksErr.message);
  setLoading(false);
  return;
}

// Build a unique list of team IDs from the picks
const teamIds = Array.from(new Set((pickRows ?? []).map((p: any) => p.team_id).filter(Boolean)));

// Fetch logos from teams
let logoById = new Map<string, string | null>();
if (teamIds.length > 0) {
  const { data: teamRows, error: teamErr } = await supabase
    .from("teams")
    .select("id,logo_url")
    .in("id", teamIds);

  if (teamErr) {
    setMsg(teamErr.message);
    setLoading(false);
    return;
  }

  logoById = new Map((teamRows ?? []).map((t: any) => [t.id, t.logo_url ?? null]));
}

// Merge logos onto picks
const merged = (pickRows ?? []).map((p: any) => ({
  ...p,
  logo_url: logoById.get(p.team_id) ?? null,
}));

const sorted = merged.sort((a: any, b: any) => (a.seed ?? 999) - (b.seed ?? 999));
setPicks(sorted as PickRow[]);
setLoading(false);
      
};

    load();
  }, [entryId, poolId]);

  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>
          {displayName}’s Picks
        </h1>

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
          Back to Leaderboard
        </a>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      {!loading && !msg ? (
        <>
          <div style={{ marginTop: 14, display: "flex", gap: 18 }}>
            <div style={{ fontWeight: 900 }}>Total score: {totalScore}</div>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>
              Total cost: {totalCost}
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              border: "1px solid #ddd",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 80px 120px 120px",
                padding: "10px 12px",
                fontWeight: 900,
                background: "#fafafa",
                borderBottom: "1px solid #eee",
              }}
            >
              <div>Team</div>
              <div>Seed</div>
              <div>Cost</div>
              <div>Round</div>
              <div style={{ textAlign: "right" }}>Points</div>
            </div>

            {picks.map((p) => (
              <div
                key={p.team_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px 120px 120px",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f1f1f1",
                  alignItems: "center",
                }}
              >
<div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
  {p.logo_url ? (
    <img
      src={p.logo_url}
      alt={p.team_name}
      width={18}
      height={18}
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  ) : (
    <span style={{ width: 18, height: 18, flexShrink: 0 }} />
  )}

  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
    {p.team_name}
  </span>
</div>
                
                <div>{p.seed}</div>
                <div>{p.cost}</div>
                <div>{p.round_reached}</div>
                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  {p.total_team_score}
                </div>
              </div>
            ))}

            {picks.length === 0 && (
              <div style={{ padding: "12px 12px" }}>
                No picks saved yet.
              </div>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../../lib/supabaseClient";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "../../../../../lib/draftLock";
import { scoreEntries, type ScoringGame } from "../../../../../lib/scoring";

type PickRow = {
  team_id: string;
  team_name: string;
  seed: number | null;
  cost: number | null;
  round_reached: string | null;
  total_team_score: number | null;
  logo_url?: string | null;
};

export default function PicksPage() {
  const params = useParams() as Record<string, string | undefined>;

  const poolId = params.id;

  // supports [entryId] OR [entryid] OR [entryID]
  const entryId = params.entryId ?? params.entryid ?? params.entryID;
  const hasRouteParams = !!poolId && !!entryId;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [displayName, setDisplayName] = useState("Player");
  const [picks, setPicks] = useState<PickRow[]>([]);
  const [draftLocked, setDraftLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [perfectR64Bonus, setPerfectR64Bonus] = useState(0);

  const totalTeamScore = useMemo(
    () => picks.reduce((s, p) => s + (p.total_team_score ?? 0), 0),
    [picks],
  );

  const totalScore = useMemo(
    () => totalTeamScore + perfectR64Bonus,
    [perfectR64Bonus, totalTeamScore],
  );

  const totalCost = useMemo(
    () => picks.reduce((s, p) => s + (p.cost ?? 0), 0),
    [picks],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");
      setPerfectR64Bonus(0);

      if (!poolId || !entryId) {
        setLoading(false);
        setMsg("Missing pool id or entry id in the URL.");
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }

      const { data: memberRow, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberErr) {
        setMsg(memberErr.message);
        setLoading(false);
        return;
      }

      if (!memberRow) {
        setMsg("Join this pool to view picks.");
        setLoading(false);
        return;
      }

      const { data: poolRow, error: poolErr } = await supabase
        .from("pools")
        .select("lock_time")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setMsg(poolErr.message);
        setLoading(false);
        return;
      }

      const resolvedLockTime = resolveDraftLockTime(poolRow?.lock_time ?? null);
      const isLocked = isDraftLocked(poolRow?.lock_time ?? null);
      setLockTime(resolvedLockTime);
      setDraftLocked(isLocked);

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

      if (!isLocked && entryRow.user_id !== user.id) {
        setMsg("Drafts are private until lock. You can only view your picks right now.");
        setPicks([]);
        setLoading(false);
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", entryRow.user_id)
        .maybeSingle();

      setDisplayName(prof?.display_name ?? "Player");

      const { data: pickRows, error: picksErr } = await supabase
        .from("entry_pick_details")
        .select("team_id,team_name,seed,cost,round_reached,total_team_score")
        .eq("entry_id", entryId);

      if (picksErr) {
        setMsg(picksErr.message);
        setLoading(false);
        return;
      }

      const teamIds = Array.from(
        new Set((pickRows ?? []).map((p) => p.team_id).filter(Boolean)),
      );

      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("round,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }

      let logoById = new Map<string, string | null>();
      let seedById = new Map<string, number | null>();

      if (teamIds.length > 0) {
        const { data: teamRows, error: teamErr } = await supabase
          .from("teams")
          .select("id,logo_url,seed_in_region")
          .in("id", teamIds);

        if (teamErr) {
          setMsg(teamErr.message);
          setLoading(false);
          return;
        }

        logoById = new Map((teamRows ?? []).map((t) => [t.id, t.logo_url ?? null]));
        seedById = new Map(
          (teamRows ?? []).map((t) => [t.id, t.seed_in_region ?? null]),
        );
      }

      const picksByEntry = new Map<string, string[]>([
        [
          entryId,
          ((pickRows ?? []) as { team_id: string }[]).map((row) => row.team_id).filter(Boolean),
        ],
      ]);
      const scoredEntries = scoreEntries((gameRows ?? []) as ScoringGame[], seedById, picksByEntry);
      const computedTeamScores = scoredEntries.teamScoresByTeamId;
      setPerfectR64Bonus(scoredEntries.perfectR64BonusByEntryId.get(entryId) ?? 0);

      const merged = (pickRows ?? []).map((p) => ({
        ...p,
        total_team_score: computedTeamScores.get(p.team_id) ?? 0,
        logo_url: logoById.get(p.team_id) ?? null,
      }));

      const sorted = merged.sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
      setPicks(sorted as PickRow[]);
      setLoading(false);
    };

    void load();
  }, [entryId, poolId]);

  if (!hasRouteParams) {
    return (
      <main className="page-shell page-shell--stack" style={{ maxWidth: 900 }}>
        <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900 }}>
          Player Picks
        </h1>
        <p style={{ marginTop: 12 }}>
          Missing poolId or entryId in the URL. This usually means the folder name
          for the route does not match the param name (e.g., [entryId] vs [entryid]).
        </p>
        <p style={{ marginTop: 12, opacity: 0.85 }}>
          Current URL should look like: /pool/&lt;poolId&gt;/picks/&lt;entryId&gt;
        </p>
      </main>
    );
  }

  return (
    <main className="page-shell" style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900 }}>
          {displayName}&apos;s Picks
        </h1>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading...</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      {!draftLocked ? (
        <p style={{ marginTop: 8, opacity: 0.8, fontWeight: 700 }}>
          Other members&apos; picks are hidden until draft lock
          {lockTime ? ` (${formatDraftLockTimeET(lockTime)})` : ""}.
        </p>
      ) : null}

      {!loading && !msg ? (
        <>
          <div style={{ marginTop: 14, display: "flex", gap: 18 }}>
            <div style={{ fontWeight: 900 }}>Total score: {totalScore}</div>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>
              Perfect R64 bonus: {perfectR64Bonus}
            </div>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>
              Total cost: {totalCost}
            </div>
          </div>

          <div
            className="page-card"
            style={{
              marginTop: 16,
              border: "1px solid var(--border-color)",
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
                background: "var(--surface-muted)",
                borderBottom: "1px solid var(--border-color)",
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
                  borderBottom: "1px solid var(--border-color)",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
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

                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
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

            {picks.length === 0 ? (
              <div style={{ padding: "12px 12px" }}>No picks saved yet.</div>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

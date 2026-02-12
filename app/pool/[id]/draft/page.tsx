"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type Team = {
  id: string;
  name: string;
  seed: number;
  cost: number;
};

const BUDGET = 100;
const MAX_1 = 2;
const MAX_2 = 2;
const MAX_12 = 4;

export default function DraftPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [entryId, setEntryId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const [locked, setLocked] = useState(false);

  // Derived
  const selectedTeams = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t]));
    return Array.from(selected)
      .map((id) => map.get(id))
      .filter(Boolean) as Team[];
  }, [selected, teams]);

  const totalCost = useMemo(
    () => selectedTeams.reduce((sum, t) => sum + t.cost, 0),
    [selectedTeams]
  );

  const remaining = BUDGET - totalCost;

  const count1 = selectedTeams.filter((t) => t.seed === 1).length;
  const count2 = selectedTeams.filter((t) => t.seed === 2).length;
  const count12 = count1 + count2;

  const isValid =
    totalCost <= BUDGET &&
    count1 <= MAX_1 &&
    count2 <= MAX_2 &&
    count12 <= MAX_12;

  const sortedTeams = [...teams].sort((a, b) => {
    if (a.seed !== b.seed) return a.seed - b.seed;
    return a.name.localeCompare(b.name);
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }

      // Check lock time
      const { data: poolRow } = await supabase
        .from("pools")
        .select("lock_time")
        .eq("id", poolId)
        .single();

      if (poolRow?.lock_time) {
        const lock = new Date(poolRow.lock_time);
        if (new Date() > lock) {
          setLocked(true);
        }
      }

      // Check membership
      const { data: mem } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      setIsMember(!!mem);

      // Load teams
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,seed,cost");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }

      setTeams((teamRows ?? []) as Team[]);

      // Load entry
      const { data: existingEntry, error: entrySelErr } = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (entrySelErr) {
        setMsg(entrySelErr.message);
        setLoading(false);
        return;
      }

      let eid = existingEntry?.id;

      if (!eid) {
        const { data: newEntry, error: entryInsErr } = await supabase
          .from("entries")
          .insert({ pool_id: poolId, user_id: user.id })
          .select("id")
          .single();

        if (entryInsErr || !newEntry) {
          setMsg(entryInsErr?.message ?? "Failed to create entry.");
          setLoading(false);
          return;
        }

        eid = newEntry.id;
      }

      setEntryId(eid);

      // Load existing picks
      const { data: picks, error: picksErr } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", eid);

      if (picksErr) {
        setMsg(picksErr.message);
        setLoading(false);
        return;
      }

      const pickedIds = new Set<string>((picks ?? []).map((p: any) => p.team_id));
      setSelected(pickedIds);

      setLoading(false);
    };

    load();
  }, [poolId]);

  function toggleTeam(teamId: string) {
    if (locked) return;

    const next = new Set(selected);

    if (next.has(teamId)) {
      next.delete(teamId);
      setSelected(next);
      return;
    }

    const map = new Map(teams.map((t) => [t.id, t]));
    next.add(teamId);

    const arr = Array.from(next)
      .map((id) => map.get(id))
      .filter(Boolean) as Team[];

    const cost = arr.reduce((s, t) => s + t.cost, 0);
    const c1 = arr.filter((t) => t.seed === 1).length;
    const c2 = arr.filter((t) => t.seed === 2).length;

    if (
      cost > BUDGET ||
      c1 > MAX_1 ||
      c2 > MAX_2 ||
      c1 + c2 > MAX_12
    ) {
      setMsg("That selection would violate budget or seed caps.");
      return;
    }

    setSelected(next);
  }

  async function savePicks() {
    if (!entryId || !isValid || locked) return;

    setSaving(true);

    await supabase.from("entry_picks").delete().eq("entry_id", entryId);

    if (selected.size > 0) {
      const rows = Array.from(selected).map((team_id) => ({
        entry_id: entryId,
        team_id,
      }));

      const { error } = await supabase.from("entry_picks").insert(rows);

      if (error) {
        setMsg(error.message);
        setSaving(false);
        return;
      }
    }

    setMsg("Saved!");
    setSaving(false);
  }

  if (loading) {
    return <main style={{ padding: 40 }}>Loading…</main>;
  }

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Draft</h1>

      {locked && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            borderRadius: 8,
            fontWeight: 900,
          }}
        >
          Draft Locked 🔒
        </div>
      )}

      <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
        {sortedTeams.map((t) => (
          <label
            key={t.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: 8,
              border: "1px solid #eee",
              borderRadius: 8,
              cursor: locked ? "not-allowed" : "pointer",
            }}
          >
            <div>
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                disabled={locked}
                onChange={() => toggleTeam(t.id)}
              />
              <span style={{ marginLeft: 8 }}>
                {t.name} (Seed {t.seed})
              </span>
            </div>
            <b>{t.cost}</b>
          </label>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <div>Total: {totalCost}</div>
        <div>Remaining: {remaining}</div>
        <div>1 Seeds: {count1}/{MAX_1}</div>
        <div>2 Seeds: {count2}/{MAX_2}</div>
        <div>1+2 Combined: {count12}/{MAX_12}</div>

        <button
          onClick={savePicks}
          disabled={!isValid || saving || locked}
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 900,
          }}
        >
          {saving ? "Saving…" : "Save Picks"}
        </button>
      </div>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}

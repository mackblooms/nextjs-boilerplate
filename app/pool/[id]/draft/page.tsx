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
  const [lockTime, setLockTime] = useState<string | null>(null);

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

  const count1 = useMemo(
    () => selectedTeams.filter((t) => t.seed === 1).length,
    [selectedTeams]
  );
  const count2 = useMemo(
    () => selectedTeams.filter((t) => t.seed === 2).length,
    [selectedTeams]
  );
  const count12 = count1 + count2;

  const isValid =
    totalCost <= BUDGET &&
    count1 <= MAX_1 &&
    count2 <= MAX_2 &&
    count12 <= MAX_12;

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (a.seed !== b.seed) return a.seed - b.seed;
      return a.name.localeCompare(b.name);
    });
  }, [teams]);

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

      // ✅ Lock check (paste-in safe)
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

if (poolRow?.lock_time) {
  setLockTime(poolRow.lock_time);
  const lock = new Date(poolRow.lock_time);
  setLocked(new Date() > lock);
} else {
  setLocked(false);
}

      // Membership
      const { data: mem, error: memErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memErr) {
        setMsg(memErr.message);
        setLoading(false);
        return;
      }

      setIsMember(!!mem);

      // Teams
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,seed,cost");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }

      setTeams((teamRows ?? []) as Team[]);

      // Entry
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

      let eid = existingEntry?.id as string | undefined;

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

        eid = newEntry.id as string;
      }

      setEntryId(eid);

      // Picks
      const { data: picks, error: picksErr } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", eid);

      if (picksErr) {
        setMsg(picksErr.message);
        setLoading(false);
        return;
      }

      setSelected(new Set((picks ?? []).map((p: any) => p.team_id)));

      setLoading(false);
    };

    load();
  }, [poolId]);

  async function joinPool() {
    setMsg("");
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setMsg("Please log in first.");
      return;
    }

    const { error } = await supabase.from("pool_members").insert({
      pool_id: poolId,
      user_id: user.id,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setIsMember(true);
    setMsg("Joined pool. You can draft now.");
  }

  function toggleTeam(teamId: string) {
    if (locked) return;

    setMsg("");

    const next = new Set(selected);
    const map = new Map(teams.map((t) => [t.id, t]));

    if (next.has(teamId)) {
      next.delete(teamId);
      setSelected(next);
      return;
    }

    next.add(teamId);

    const arr = Array.from(next)
      .map((id) => map.get(id))
      .filter(Boolean) as Team[];

    const cost = arr.reduce((s, t) => s + t.cost, 0);
    const c1 = arr.filter((t) => t.seed === 1).length;
    const c2 = arr.filter((t) => t.seed === 2).length;

    if (cost > BUDGET || c1 > MAX_1 || c2 > MAX_2 || c1 + c2 > MAX_12) {
      const t = map.get(teamId);
      setMsg(
        `Can't add ${t?.name ?? "that team"} — it would break budget or seed caps.`
      );
      return;
    }

    setSelected(next);
  }

  async function savePicks() {
    setMsg("");

    if (!entryId) {
      setMsg("Entry not ready yet. Refresh and try again.");
      return;
    }
    if (!isMember) {
      setMsg("Join the pool before drafting.");
      return;
    }
    if (locked) {
      setMsg("Draft is locked.");
      return;
    }
    if (!isValid) {
      setMsg("Draft is not valid (budget/caps). Fix issues before saving.");
      return;
    }

    setSaving(true);

    const { error: delErr } = await supabase
      .from("entry_picks")
      .delete()
      .eq("entry_id", entryId);

    if (delErr) {
      setMsg(delErr.message);
      setSaving(false);
      return;
    }

    const rows = Array.from(selected).map((team_id) => ({
      entry_id: entryId,
      team_id,
    }));

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("entry_picks").insert(rows);
      if (insErr) {
        setMsg(insErr.message);
        setSaving(false);
        return;
      }
    }

    setMsg("Saved!");
    setSaving(false);
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900 }}>Draft</h1>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
            Draft
          </h1>
          <div style={{ fontSize: 14, opacity: 0.85 }}>
            Budget: {BUDGET} • Caps: max {MAX_1} one-seeds, max {MAX_2} two-seeds,
            max {MAX_12} combined
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
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

      {!isMember ? (
        <div style={{ marginTop: 18 }}>
          <p style={{ opacity: 0.9 }}>
            You’re not a member of this pool yet.
          </p>
          <button
            onClick={joinPool}
            style={{
              marginTop: 10,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Join pool
          </button>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 18,
        }}
      >
        {/* Team list */}
        <section
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Teams</div>

          <div style={{ display: "grid", gap: 8 }}>
            {sortedTeams.map((t) => {
              const checked = selected.has(t.id);
              return (
                <label
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    border: "1px solid #eee",
                    borderRadius: 10,
                    cursor: locked ? "not-allowed" : "pointer",
                    userSelect: "none",
                    opacity: locked ? 0.85 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleTeam(t.id)}
                    />
                    <div>
                      <div style={{ fontWeight: 800 }}>{t.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Seed {t.seed}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontWeight: 900 }}>{t.cost}</div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Sidebar */}
        <aside
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 14,
            height: "fit-content",
            position: "sticky",
            top: 16,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Summary</div>

          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total cost</span>
              <b>{totalCost}</b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Remaining</span>
              <b>{remaining}</b>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid #eee" }} />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1-seeds</span>
              <b>
                {count1}/{MAX_1}
              </b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>2-seeds</span>
              <b>
                {count2}/{MAX_2}
              </b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1+2 combined</span>
              <b>
                {count12}/{MAX_12}
              </b>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #eee",
                background: isValid ? "#f6fff7" : "#fff6f6",
                fontWeight: 900,
              }}
            >
              {isValid ? "Draft is valid ✅" : "Draft invalid ❌"}
            </div>

            {locked ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "#fff3cd",
                  border: "1px solid #ffeeba",
                  fontWeight: 900,
                }}
              >
                Draft Locked 🔒
              </div>
            ) : null}

            {lockTime && (
  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
    Locks: {new Date(lockTime).toLocaleString()}
  </div>
)}
          </div>

          <button
            onClick={savePicks}
            disabled={saving || !isMember || !isValid || locked}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
              opacity: saving || !isMember || !isValid || locked ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : locked ? "Draft Locked" : "Save picks"}
          </button>

          {msg ? (
            <p style={{ marginTop: 12, fontSize: 14, whiteSpace: "pre-wrap" }}>
              {msg}
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

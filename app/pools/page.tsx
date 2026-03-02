"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type PoolRow = { id: string; name: string };

export default function PoolsPage() {
  const [loading, setLoading] = useState(true);
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setMsg("Please log in to see your pools.");
        setLoading(false);
        return;
      }

      const { data: memberships, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id);

      if (memberErr) {
        setMsg(memberErr.message);
        setLoading(false);
        return;
      }

      const ids = (memberships ?? []).map((m) => m.pool_id);
      if (ids.length === 0) {
        setPools([]);
        setLoading(false);
        return;
      }

      const { data: poolRows, error: poolErr } = await supabase
        .from("pools")
        .select("id,name")
        .in("id", ids)
        .order("name", { ascending: true });

      if (poolErr) {
        setMsg(poolErr.message);
        setLoading(false);
        return;
      }

      setPools(poolRows ?? []);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <main style={{ maxWidth: 860, margin: "90px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>My Pools</h1>

      {loading ? <p>Loading your pools…</p> : null}
      {msg ? <p>{msg}</p> : null}

      {!loading && !msg && pools.length === 0 ? (
        <div>
          <p>You haven’t joined any pools yet.</p>
          <Link href="/pools/new" style={{ fontWeight: 800 }}>
            Create your first pool
          </Link>
        </div>
      ) : null}

      {!loading && pools.length > 0 ? (
        <ul style={{ marginTop: 12, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {pools.map((pool) => (
            <li key={pool.id}>
              <Link
                href={`/pool/${pool.id}`}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                {pool.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

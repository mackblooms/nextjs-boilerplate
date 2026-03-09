"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type PoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
};

export default function PoolsPage() {
  const [loading, setLoading] = useState(true);
  const [allPools, setAllPools] = useState<PoolRow[]>([]);
  const [myPools, setMyPools] = useState<PoolRow[]>([]);
  const [allPoolsMsg, setAllPoolsMsg] = useState("");
  const [myPoolsMsg, setMyPoolsMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAllPoolsMsg("");
      setMyPoolsMsg("");

      const { data: allRows, error: allErr } = await supabase
        .from("pools")
        .select("id,name,is_private")
        .order("name", { ascending: true });

      if (allErr) {
        setAllPoolsMsg(allErr.message);
        setMyPoolsMsg(allErr.message);
        setLoading(false);
        return;
      }

      const pools = (allRows ?? []) as PoolRow[];
      setAllPools(pools);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setMyPools([]);
        setMyPoolsMsg("Log in to see pools you have joined.");
        setLoading(false);
        return;
      }

      const { data: memberships, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id);

      if (memberErr) {
        setMyPools([]);
        setMyPoolsMsg(memberErr.message);
        setLoading(false);
        return;
      }

      const memberPoolIds = new Set((memberships ?? []).map((m) => m.pool_id as string));
      setMyPools(pools.filter((pool) => memberPoolIds.has(pool.id)));
      setLoading(false);
    };

    load();
  }, []);

  const myPoolIds = useMemo(() => new Set(myPools.map((pool) => pool.id)), [myPools]);

  const cardStyle = {
    display: "block",
    padding: "12px 14px",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    textDecoration: "none",
  } as const;

  return (
    <main style={{ maxWidth: 900, margin: "90px auto", padding: 16, display: "grid", gap: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Pools</h1>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>My Pools</h2>

        {loading ? <p>Loading pools...</p> : null}
        {myPoolsMsg ? <p>{myPoolsMsg}</p> : null}

        {!loading && !myPoolsMsg && myPools.length === 0 ? (
          <div>
            <p>You have not joined any pools yet.</p>
            <Link href="/pools/new" style={{ fontWeight: 800 }}>
              Create your first pool
            </Link>
          </div>
        ) : null}

        {!loading && myPools.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {myPools.map((pool) => (
              <li key={pool.id}>
                <Link href={`/pool/${pool.id}`} style={cardStyle}>
                  <div style={{ fontWeight: 800 }}>{pool.name}</div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                    {(pool.is_private ?? true) ? "Private" : "Public"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>All Pools</h2>

        {allPoolsMsg ? <p>{allPoolsMsg}</p> : null}

        {!loading && !allPoolsMsg && allPools.length === 0 ? <p>No pools found.</p> : null}

        {!loading && allPools.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {allPools.map((pool) => (
              <li key={pool.id}>
                <Link href={`/pool/${pool.id}`} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontWeight: 800 }}>{pool.name}</span>
                    {myPoolIds.has(pool.id) ? (
                      <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 700 }}>Joined</span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, opacity: 0.75 }}>
                    {(pool.is_private ?? true) ? "Private (password required)" : "Public"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

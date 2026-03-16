"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "../../lib/supabaseClient";

type PoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
};

type StatusTone = "success" | "error" | "info";

type StatusMessage = {
  tone: StatusTone;
  text: string;
};

type TabKey = "my" | "discover";

function privacyLabel(pool: PoolRow) {
  return (pool.is_private ?? true) ? "Private" : "Public";
}

function sortPoolsByName(a: PoolRow, b: PoolRow) {
  return a.name.localeCompare(b.name);
}

export default function PoolsPage() {
  const [loading, setLoading] = useState(true);
  const [allPools, setAllPools] = useState<PoolRow[]>([]);
  const [myPools, setMyPools] = useState<PoolRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [query, setQuery] = useState("");
  const [allPoolsMsg, setAllPoolsMsg] = useState("");
  const [myPoolsMsg, setMyPoolsMsg] = useState("");
  const [joinStatus, setJoinStatus] = useState<StatusMessage | null>(null);
  const [joiningPoolId, setJoiningPoolId] = useState<string | null>(null);
  const [joinPasswordByPool, setJoinPasswordByPool] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAllPoolsMsg("");
      setMyPoolsMsg("");
      setJoinStatus(null);

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

      const pools = ((allRows ?? []) as PoolRow[]).sort(sortPoolsByName);
      setAllPools(pools);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setUserId(null);
        setMyPools([]);
        setMyPoolsMsg("Log in to see pools you have joined.");
        setActiveTab("discover");
        setLoading(false);
        return;
      }

      setUserId(user.id);

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
      const memberPools = pools.filter((pool) => memberPoolIds.has(pool.id)).sort(sortPoolsByName);
      setMyPools(memberPools);

      if (memberPools.length === 0) {
        setActiveTab("discover");
      }

      setLoading(false);
    };

    void load();
  }, []);

  const myPoolIds = useMemo(() => new Set(myPools.map((pool) => pool.id)), [myPools]);

  const discoverPools = useMemo(
    () => allPools.filter((pool) => !myPoolIds.has(pool.id)).sort(sortPoolsByName),
    [allPools, myPoolIds],
  );

  const filteredDiscoverPools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return discoverPools;
    return discoverPools.filter((pool) => pool.name.toLowerCase().includes(needle));
  }, [discoverPools, query]);

  async function joinPool(pool: PoolRow) {
    setJoinStatus(null);

    if (!userId) {
      setJoinStatus({ tone: "error", text: "Log in first to join a pool." });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setJoinStatus({ tone: "error", text: "Session expired. Log in again to join a pool." });
      return;
    }

    const requiresPassword = (pool.is_private ?? true) !== false;
    const password = (joinPasswordByPool[pool.id] ?? "").trim();

    if (requiresPassword && password.length === 0) {
      setJoinStatus({ tone: "error", text: "Enter the pool password to join this private pool." });
      return;
    }

    setJoiningPoolId(pool.id);

    const res = await fetch("/api/pools/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        poolId: pool.id,
        password,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      setJoinStatus({ tone: "error", text: body.error ?? "Failed to join pool." });
      setJoiningPoolId(null);
      return;
    }

    setMyPools((prev) => [...prev, pool].sort(sortPoolsByName));
    setJoinPasswordByPool((prev) => ({ ...prev, [pool.id]: "" }));
    setJoinStatus({ tone: "success", text: `Joined ${pool.name}. You can open it from My Pools.` });
    setJoiningPoolId(null);
    setActiveTab("my");
  }

  const tabButton = (isActive: boolean): CSSProperties => ({
    padding: "10px 14px",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    background: isActive ? "var(--surface-elevated)" : "var(--surface)",
    fontWeight: 800,
    cursor: "pointer",
  });

  const statusStyle: CSSProperties =
    joinStatus?.tone === "success"
      ? { background: "var(--success-bg)", borderColor: "var(--border-color)" }
      : joinStatus?.tone === "error"
        ? { background: "var(--danger-bg)", borderColor: "var(--border-color)" }
        : { background: "var(--surface-muted)", borderColor: "var(--border-color)" };

  return (
    <main style={{ maxWidth: 960, margin: "90px auto", padding: 16, display: "grid", gap: 18 }}>
      <section
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          padding: 14,
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Pools</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>
              Join pools here, then apply any saved draft from your Drafts workspace.
            </p>
          </div>

          <Link
            href="/drafts"
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              background: "var(--surface)",
            }}
          >
            My Drafts
          </Link>
          <Link
            href="/pools/new"
            style={{
              padding: "10px 14px",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              background: "var(--surface)",
            }}
          >
            + New Pool
          </Link>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setActiveTab("my")} style={tabButton(activeTab === "my")}>
            My Pools ({myPools.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("discover")}
            style={tabButton(activeTab === "discover")}
          >
            Discover & Join ({discoverPools.length})
          </button>
        </div>

        {joinStatus ? (
          <p
            role="status"
            aria-live="polite"
            style={{
              margin: 0,
              border: "1px solid",
              borderRadius: 10,
              padding: "10px 12px",
              fontWeight: 700,
              ...statusStyle,
            }}
          >
            {joinStatus.text}
          </p>
        ) : null}
      </section>

      {activeTab === "my" ? (
        <section style={{ display: "grid", gap: 10 }}>
          {loading ? <p>Loading pools...</p> : null}
          {myPoolsMsg ? <p>{myPoolsMsg}</p> : null}

          {!loading && !myPoolsMsg && myPools.length === 0 ? (
            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                padding: 12,
                background: "var(--surface)",
                display: "grid",
                gap: 8,
              }}
            >
              <p style={{ margin: 0 }}>You have not joined any pools yet.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("discover")}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Discover pools
                </button>
                <Link
                  href="/drafts"
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    textDecoration: "none",
                    fontWeight: 800,
                    background: "var(--surface)",
                  }}
                >
                  Open drafts
                </Link>
                <Link
                  href="/pools/new"
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    textDecoration: "none",
                    fontWeight: 800,
                    background: "var(--surface)",
                  }}
                >
                  Create a pool
                </Link>
              </div>
            </div>
          ) : null}

          {!loading && myPools.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {myPools.map((pool) => (
                <li key={pool.id}>
                  <div
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: 12,
                      padding: 12,
                      background: "var(--surface)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{pool.name}</div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>{privacyLabel(pool)} pool</div>
                    </div>
                    <Link
                      href={`/pool/${pool.id}/leaderboard`}
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--border-color)",
                        textDecoration: "none",
                        fontWeight: 800,
                        background: "var(--surface)",
                        minHeight: 40,
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      Open pool
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {activeTab === "discover" ? (
        <section style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              background: "var(--surface)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <label htmlFor="pool-search" style={{ fontWeight: 800, fontSize: 13 }}>
              Search pools
            </label>
            <input
              id="pool-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find by pool name"
              style={{
                width: "100%",
                padding: "10px 12px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
            {!userId ? (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                Log in to join pools. You can still browse and open pool pages now.
              </p>
            ) : null}
          </div>

          {allPoolsMsg ? <p>{allPoolsMsg}</p> : null}
          {!loading && !allPoolsMsg && filteredDiscoverPools.length === 0 ? (
            <p>{query.trim() ? "No pools match your search." : "No pools available to join right now."}</p>
          ) : null}

          {!loading && filteredDiscoverPools.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {filteredDiscoverPools.map((pool) => {
                const isPrivate = (pool.is_private ?? true) !== false;
                const joinDisabled = joiningPoolId === pool.id || !userId;

                return (
                  <li key={pool.id}>
                    <div
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: 12,
                        padding: 12,
                        background: "var(--surface)",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                          <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{pool.name}</div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {isPrivate ? "Private (password required)" : "Public"}
                          </div>
                        </div>

                        <Link
                          href={`/pool/${pool.id}`}
                          style={{
                            padding: "9px 12px",
                            borderRadius: 10,
                            border: "1px solid var(--border-color)",
                            textDecoration: "none",
                            fontWeight: 800,
                            background: "var(--surface)",
                            minHeight: 40,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          Open details
                        </Link>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {isPrivate ? (
                          <input
                            type="password"
                            value={joinPasswordByPool[pool.id] ?? ""}
                            onChange={(e) =>
                              setJoinPasswordByPool((prev) => ({
                                ...prev,
                                [pool.id]: e.target.value,
                              }))
                            }
                            placeholder="Pool password"
                            style={{
                              flex: "1 1 230px",
                              minWidth: 0,
                              padding: "10px 12px",
                              minHeight: 44,
                              borderRadius: 10,
                              border: "1px solid var(--border-color)",
                              background: "var(--surface-muted)",
                            }}
                          />
                        ) : null}

                        <button
                          type="button"
                          onClick={() => void joinPool(pool)}
                          disabled={joinDisabled}
                          style={{
                            flex: "1 1 160px",
                            padding: "10px 12px",
                            minHeight: 44,
                            borderRadius: 10,
                            border: "1px solid var(--border-color)",
                            background: "var(--surface)",
                            fontWeight: 800,
                            cursor: joinDisabled ? "not-allowed" : "pointer",
                            opacity: joinDisabled ? 0.7 : 1,
                          }}
                        >
                          {joiningPoolId === pool.id ? "Joining..." : "Join pool"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type Row = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  total_score: number;
  rank: number;
  logo_url?: string | null;
};

export default function LeaderboardPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

const [loading, setLoading] = useState(true);
const [rows, setRows] = useState<Row[]>([]);
const [msg, setMsg] = useState("");
const [myUserId, setMyUserId] = useState<string | null>(null);

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
      setMyUserId(authData.user.id);

      const { data, error } = await supabase
        .from("pool_leaderboard")
        .select("entry_id,user_id,display_name,total_score,rank,logo_url")
        .eq("pool_id", poolId)
        .order("rank", { ascending: true });

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as Row[]);
      setLoading(false);
    };

    load();
  }, [poolId]);

  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Leaderboard</h1>
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
            href={`/pool/${poolId}/draft`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Draft
          </a>
        </div>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      {!loading && !msg ? (
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
              gridTemplateColumns: "80px 1fr 140px",
              padding: "10px 12px",
              fontWeight: 900,
              background: "#fafafa",
              borderBottom: "1px solid #eee",
            }}
          >
            <div>Rank</div>
            <div>Player</div>
            <div style={{ textAlign: "right" }}>Score</div>
          </div>

          {rows.map((r) => (
            <div
  key={r.entry_id}
  style={{
    display: "grid",
    gridTemplateColumns: "80px 1fr 140px",
    padding: "10px 12px",
    borderBottom: "1px solid #f1f1f1",
    alignItems: "center",
    background: r.user_id === myUserId ? "#f0f8ff" : "transparent",
  }}
>
              <div style={{ fontWeight: 900 }}>{r.rank}</div>
              <div style={{ fontWeight: 800 }}>
  <div>
    <a
      href={`/pool/${poolId}/picks/${r.entry_id}`}
      style={{
        fontWeight: 800,
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
      }}
    >
      {r.logo_url ? (
        <img
          src={r.logo_url}
          alt={r.display_name ?? "Player"}
          width={18}
          height={18}
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
      ) : (
        <span style={{ width: 18, height: 18, flexShrink: 0 }} />
      )}

      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {r.rank === 1 ? "🏆 " : ""}
        {r.display_name ?? r.user_id.slice(0, 8)}
        {r.user_id === myUserId ? " (You)" : ""}
      </span>
    </a>
  </div>
</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>
                {r.total_score}
              </div>
            </div>
          ))}

          {rows.length === 0 ? (
            <div style={{ padding: "12px 12px" }}>
              No entries yet. Have friends join and draft.
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

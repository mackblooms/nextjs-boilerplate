"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type Pool = { id: string; name: string; created_by: string };

export default function PoolPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/pool/${poolId}`;
  }, [poolId]);

  const [pool, setPool] = useState<Pool | null>(null);
  const [msg, setMsg] = useState("");
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setMsg("Please log in first.");
        return;
      }

      const { data: poolData, error: poolErr } = await supabase
        .from("pools")
        .select("id,name,created_by")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setMsg(poolErr.message);
        return;
      }

      setPool(poolData);

      const { data: memberRow } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      setIsMember(!!memberRow);
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
    setMsg("Joined!");
  }

  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
            {pool ? pool.name : "Pool"}
          </h1>
          <div style={{ fontSize: 14, opacity: 0.8 }}>
            Share link:{" "}
            <span style={{ fontFamily: "monospace" }}>{shareLink}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <a
            href="/pools/new"
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            New Pool
          </a>

          <a
            href="/profile"
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Profile
          </a>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {isMember === false ? (
          <button
            onClick={joinPool}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            Join pool
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 24 }}>
        {isMember ? (
          <a
            href={`/pool/${poolId}/draft`}
            style={{
              display: "inline-block",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #ccc",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Go to Draft
          </a>
        ) : (
          <p style={{ opacity: 0.85 }}>
            Join the pool to draft your teams.
          </p>
        )}
      </div>

      {msg ? <p style={{ marginTop: 14 }}>{msg}</p> : null}
    </main>
  );
}

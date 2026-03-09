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
  const [copyMsg, setCopyMsg] = useState("");
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    const load = async () => {
      setMsg("");

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

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setIsMember(false);
        return;
      }

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

  async function copyShareLink() {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyMsg("Share link copied.");
    } catch {
      setCopyMsg("Unable to copy automatically. Copy the link below.");
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "grid",
          justifyItems: "center",
          textAlign: "center",
          gap: 10,
        }}
      >
        <button
          onClick={copyShareLink}
          aria-label="Copy shareable pool link"
          title="Copy shareable pool link"
          style={{
            border: "1px solid var(--border-color)",
            background: "var(--surface)",
            color: "var(--foreground)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            lineHeight: 0,
          }}
        >
          <svg
            aria-hidden="true"
            width="420"
            height="170"
            viewBox="0 0 760 280"
            fill="none"
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          >
            <path
              d="M70 60H320V240H70"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinejoin="miter"
            />
            <path
              d="M440 60H690M440 240H690M440 60V240M320 150H440"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinejoin="miter"
            />
          </svg>
        </button>

        <div style={{ fontSize: 14, opacity: 0.85, fontWeight: 700 }}>
          Click logo to copy the shareable pool link
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
          {pool ? pool.name : "Pool"}
        </h1>

        {copyMsg ? <p style={{ marginTop: 2, fontWeight: 700 }}>{copyMsg}</p> : null}

        {isMember === false ? (
          <div style={{ marginTop: 12 }}>
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
          </div>
        ) : null}

        {msg ? <p style={{ marginTop: 14 }}>{msg}</p> : null}
      </div>
    </main>
  );
}

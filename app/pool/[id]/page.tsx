"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";

type Pool = {
  id: string;
  name: string;
  created_by: string;
  is_private: boolean | null;
};

export default function PoolPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?invite=${encodeURIComponent(poolId)}`;
  }, [poolId]);

  const [pool, setPool] = useState<Pool | null>(null);
  const [msg, setMsg] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const load = async () => {
      setMsg("");

      const { data: poolData, error: poolErr } = await supabase
        .from("pools")
        .select("id,name,created_by,is_private")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setMsg(poolErr.message);
        return;
      }

      setPool(poolData as Pool);

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
    setJoining(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setMsg("Please log in first.");
      setJoining(false);
      return;
    }

    const poolIsPrivate = (pool?.is_private ?? true) !== false;
    if (poolIsPrivate && !joinPassword.trim()) {
      setMsg("Enter this pool's password.");
      setJoining(false);
      return;
    }

    const res = await fetch("/api/pools/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        poolId,
        password: joinPassword,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      setMsg(body.error ?? "Failed to join pool.");
      setJoining(false);
      return;
    }

    setIsMember(true);
    setJoinPassword("");
    setMsg("Joined!");
    setJoining(false);
  }

  async function copyShareLink() {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyMsg("Share link copied.");
    } catch {
      setCopyMsg("Unable to copy automatically. Please try again.");
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
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            lineHeight: 0,
          }}
        >
          <Image
            src="/pool-logo.svg?v=2"
            alt=""
            aria-hidden="true"
            width={420}
            height={170}
            priority
            style={{
              maxWidth: "100%",
              height: "auto",
              filter: "var(--logo-filter)",
            }}
          />
        </button>

        <div style={{ fontSize: 14, opacity: 0.85, fontWeight: 700 }}>
          Click logo to copy the shareable pool link
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
          {pool ? pool.name : "Pool"}
        </h1>

        {copyMsg ? <p style={{ marginTop: 2, fontWeight: 700 }}>{copyMsg}</p> : null}

        {isMember === false ? (
          <div style={{ marginTop: 12, width: "min(100%, 360px)" }}>
            {(pool?.is_private ?? true) !== false ? (
              <input
                type="password"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                placeholder="Pool password"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  marginBottom: 10,
                }}
              />
            ) : null}

            <button
              onClick={joinPool}
              disabled={joining}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "none",
                cursor: joining ? "not-allowed" : "pointer",
                fontWeight: 900,
                opacity: joining ? 0.7 : 1,
              }}
            >
              {joining ? "Joining..." : "Join pool"}
            </button>
          </div>
        ) : null}

        {msg ? <p style={{ marginTop: 14 }}>{msg}</p> : null}
      </div>
    </main>
  );
}

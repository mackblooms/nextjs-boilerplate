"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";

type Pool = {
  id: string;
  name: string;
  created_by: string;
  is_private: boolean | null;
};

type StatusTone = "success" | "error" | "info";
type StatusMessage = {
  tone: StatusTone;
  text: string;
};

export default function PoolPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?invite=${encodeURIComponent(poolId)}`;
  }, [poolId]);

  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus(null);

      const { data: poolData, error: poolErr } = await supabase
        .from("pools")
        .select("id,name,created_by,is_private")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setStatus({ tone: "error", text: poolErr.message });
        setLoading(false);
        return;
      }

      setPool(poolData as Pool);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setIsMember(false);
        setLoading(false);
        return;
      }

      const { data: memberRow } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      setIsMember(!!memberRow);
      setLoading(false);
    };

    load();
  }, [poolId]);

  useEffect(() => {
    if (!copyMsg) return;

    const timeout = window.setTimeout(() => setCopyMsg(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [copyMsg]);

  async function joinPool() {
    setStatus(null);
    setJoining(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setStatus({ tone: "error", text: "Please log in first." });
      setJoining(false);
      return;
    }

    const poolIsPrivate = (pool?.is_private ?? true) !== false;
    if (poolIsPrivate && !joinPassword.trim()) {
      setStatus({ tone: "error", text: "Enter this pool's password." });
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
      setStatus({ tone: "error", text: body.error ?? "Failed to join pool." });
      setJoining(false);
      return;
    }

    setIsMember(true);
    setJoinPassword("");
    setStatus({ tone: "success", text: "Joined! You can now access Draft, Bracket, and Leaderboard." });
    setJoining(false);
  }

  async function copyShareLink() {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyMsg("Share link copied.");
    } catch {
      setCopyMsg("Unable to copy automatically. You can copy it from the field below.");
    }
  }

  const poolIsPrivate = (pool?.is_private ?? true) !== false;
  const joinDisabled = joining || (poolIsPrivate && joinPassword.trim().length === 0);

  const statusStyle =
    status?.tone === "success"
      ? { background: "var(--success-bg)", borderColor: "var(--border-color)" }
      : status?.tone === "error"
        ? { background: "var(--danger-bg)", borderColor: "var(--border-color)" }
        : { background: "var(--surface-muted)", borderColor: "var(--border-color)" };

  return (
    <main style={{ maxWidth: 900, margin: "36px auto", padding: 16 }}>
      <div
        style={{
          display: "grid",
          gap: 16,
          border: "1px solid var(--border-color)",
          borderRadius: 16,
          padding: "18px 16px",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: 10 }}>
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
            {pool?.name ?? (loading ? "Loading pool..." : "Pool")}
          </h1>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 12,
                borderRadius: 999,
                padding: "6px 10px",
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
                fontWeight: 800,
              }}
            >
              {poolIsPrivate ? "Private pool" : "Public pool"}
            </span>
            {isMember === true ? (
              <span
                style={{
                  fontSize: 12,
                  borderRadius: 999,
                  padding: "6px 10px",
                  border: "1px solid var(--border-color)",
                  background: "var(--success-bg)",
                  fontWeight: 800,
                }}
              >
                You are a member
              </span>
            ) : null}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="share-link" style={{ fontWeight: 800, fontSize: 13 }}>
            Share link
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="share-link"
              type="text"
              value={shareLink}
              readOnly
              style={{
                flex: "1 1 420px",
                minWidth: 220,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
            <button
              type="button"
              onClick={copyShareLink}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Copy link
            </button>
          </div>
          {copyMsg ? <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{copyMsg}</p> : null}
        </div>

        {isMember === false && !loading ? (
          <section
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 12,
              background: "var(--surface-muted)",
              width: "100%",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Join this pool</h2>
            <p style={{ margin: "6px 0 0", opacity: 0.85, fontSize: 14 }}>
              {poolIsPrivate
                ? "This is a private pool. Enter the pool password to join."
                : "This is a public pool. Join now to make picks and track results."}
            </p>
            <div style={{ marginTop: 12, width: "min(100%, 420px)" }}>
              {poolIsPrivate ? (
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !joinDisabled) {
                      void joinPool();
                    }
                  }}
                  placeholder="Pool password"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    marginBottom: 10,
                    background: "var(--surface)",
                  }}
                />
              ) : null}

              <button
                type="button"
                onClick={joinPool}
                disabled={joinDisabled}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  cursor: joinDisabled ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: joinDisabled ? 0.7 : 1,
                }}
              >
                {joining ? "Joining..." : "Join pool"}
              </button>
            </div>
          </section>
        ) : null}

        {isMember === true ? (
          <section
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 12,
              background: "var(--surface-muted)",
              width: "100%",
              display: "grid",
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Quick actions</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link
                href={`/pool/${poolId}/draft`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface)",
                }}
              >
                Draft
              </Link>
              <Link
                href={`/pool/${poolId}/bracket`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface)",
                }}
              >
                Bracket
              </Link>
              <Link
                href={`/pool/${poolId}/leaderboard`}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface)",
                }}
              >
                Leaderboard
              </Link>
            </div>
          </section>
        ) : null}

        {loading ? <p style={{ margin: 0, fontWeight: 700, opacity: 0.85 }}>Checking your membership...</p> : null}

        {status ? (
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
            {status.text}
          </p>
        ) : null}
      </div>
    </main>
  );
}

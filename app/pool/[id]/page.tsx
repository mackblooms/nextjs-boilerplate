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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      setIsLoggedIn(!!user);

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

      if (!user) {
        setIsMember(false);
        setMsg("Please log in first.");
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

  return (
    <>
      <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
              {pool ? pool.name : "Pool"}
            </h1>
            <div style={{ fontSize: 14, opacity: 0.8 }}>
              Share link: <span style={{ fontFamily: "monospace" }}>{shareLink}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <a
              href="/pools/new"
              style={{
                padding: "10px 12px",
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              New Pool
            </a>

            {isLoggedIn ? (
              <a
                href="/profile"
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                Profile
              </a>
            ) : (
              <a
                href={`/login?next=${encodeURIComponent(`/pool/${poolId}`)}`}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                Log in / Sign up
              </a>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          {!isMember ? (
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

          <button
            onClick={() => setIsHowItWorksOpen(true)}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              fontWeight: 900,
              marginLeft: !isMember ? 10 : 0,
              background: "transparent",
            }}
          >
            How it works
          </button>
        </div>

        <div style={{ marginTop: 24 }}>
          {isMember ? (
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <a
                href={`/pool/${poolId}/draft`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Go to Draft
              </a>

              <a
                href={`/pool/${poolId}/bracket`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Bracket
              </a>

              <a
                href={`/pool/${poolId}/leaderboard`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Leaderboard
              </a>

              <a
                href={`/pool/${poolId}/admin`}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Admin
              </a>
            </div>
          ) : (
            <p style={{ opacity: 0.85 }}>Join the pool to draft your teams.</p>
          )}
          </div>

        {msg ? <p style={{ marginTop: 14 }}>{msg}</p> : null}
      </main>

      {isHowItWorksOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How it works"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setIsHowItWorksOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              maxHeight: "85vh",
              overflowY: "auto",
              background: "var(--surface)",
              borderRadius: 12,
              padding: 20,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>🏀 BracketPool Scoring System</h2>

            <p style={{ marginTop: 0, lineHeight: 1.6 }}>
              BracketPool is scored <b>per game won</b>, not by furthest round reached. Every win by a team you drafted adds to your
              total cumulatively.
            </p>

            <section style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900 }}>📊 Base Points Per Win</h3>
              <div style={{ marginTop: 12, border: "1px solid var(--border-color)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", fontWeight: 900, background: "var(--surface-muted)" }}>
                  <div>Round Won</div>
                  <div style={{ textAlign: "right" }}>Points</div>
                </div>
                {[
                  ["Round of 64", "12"],
                  ["Round of 32", "36"],
                  ["Sweet 16", "84"],
                  ["Elite 8", "180"],
                  ["Final Four", "300"],
                  ["Championship", "360"],
                ].map(([label, pts]) => (
                  <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", borderTop: "1px solid var(--border-color)" }}>
                  <div>{label}</div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>{pts}</div>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 10, opacity: 0.85 }}>
                A champion that wins all 6 games earns 972 base points before bonuses.
              </p>
            </section>

            <section style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900 }}>🔥 Upset Bonus</h3>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                Upsets add bonus points on each win: <b>12 × (Team Seed − Opponent Seed)</b>, minimum 0.
              </p>
            </section>

            <section style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900 }}>📈 Seed Multiplier (base points only)</h3>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                Base win points are multiplied by seed value from <b>1.00x (1-seed)</b> up to <b>1.525x (16-seed)</b>.
                Upset and historic bonuses are not multiplied.
              </p>
            </section>

            <section style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900 }}>🏆 Historic Upset Bonus</h3>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                One-time tournament bonus on a first Round of 64 win: 14-seed <b>+144</b>, 15-seed <b>+240</b>, 16-seed <b>+336</b>.
              </p>
            </section>

            <section style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 20, fontWeight: 900 }}>🧮 Final Formula</h3>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                <b>Win Score = (Base Round Points × Seed Multiplier) + Upset Bonus + Historic Bonus (if eligible)</b>
              </p>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                Leaderboard and player totals use this formula and update from recorded game winners.
              </p>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <button
                onClick={() => setIsHowItWorksOpen(false)}
                style={{
                  padding: "10px 12px",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
     ) : null}
    </>
  );
}
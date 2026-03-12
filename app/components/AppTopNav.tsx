"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

type Pool = { id: string; name: string; created_by: string };

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export default function AppTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [homeHref, setHomeHref] = useState("/");
  const [activePoolId, setActivePoolId] = useState<string | null>(null);
  const [activePool, setActivePool] = useState<Pool | null>(null);
  const isHidden = useAutoHideOnScroll();

  const poolIdFromPath = useMemo(() => {
    const match = pathname.match(/^\/pool\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    const load = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setUserId(null);
        setHomeHref("/");
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setUserId(null);
        setHomeHref("/");
        setActivePoolId(null);
        setActivePool(null);
        return;
      }

      setUserId(user.id);

      const { data: homeMembership } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (homeMembership?.pool_id) {
        setHomeHref(`/pool/${homeMembership.pool_id}`);
      } else {
        setHomeHref("/");
      }

      const { data: memberships } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true });

      const membershipPoolIds = (memberships ?? []).map((m) => m.pool_id);
      const selectedPoolId = poolIdFromPath ?? membershipPoolIds[0] ?? null;
      setActivePoolId(selectedPoolId);

      if (!selectedPoolId) {
        setActivePool(null);
        return;
      }

      const { data: poolData } = await supabase
        .from("pools")
        .select("id,name,created_by")
        .eq("id", selectedPoolId)
        .single();

      setActivePool(poolData ?? null);
    };

    load();
  }, [poolIdFromPath]);

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/");
    router.refresh();
  }

  if (!userId) return null;

  const pillStyle: CSSProperties = {
    padding: "8px 10px",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 700,
    fontSize: 14,
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 56,
        left: 0,
        right: 0,
        zIndex: 999,
        display: "flex",
        justifyContent: "center",
        padding: "8px 16px",
        pointerEvents: "none",
        transform: isHidden ? "translateY(-140%)" : "translateY(0)",
        opacity: isHidden ? 0 : 1,
        transition: "transform 180ms ease, opacity 180ms ease",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
          background: "var(--surface)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 8,
          pointerEvents: "auto",
        }}
      >
        <Link href={homeHref} style={pillStyle}>Home</Link>
        <Link href="/how-it-works" style={pillStyle}>How it works</Link>
        <Link href="/pools" style={pillStyle}>Pools</Link>
        {activePoolId ? <Link href={`/pool/${activePoolId}/draft`} style={pillStyle}>Draft</Link> : null}
        {activePoolId ? <Link href={`/pool/${activePoolId}/bracket`} style={pillStyle}>Bracket</Link> : null}
        {activePoolId ? <Link href={`/pool/${activePoolId}/leaderboard`} style={pillStyle}>Leaderboard</Link> : null}
        {activePoolId && activePool?.created_by === userId ? (
          <Link href={`/pool/${activePoolId}/admin`} style={pillStyle}>Admin</Link>
        ) : null}
        <Link href="/profile" style={pillStyle}>Profile</Link>
        <button onClick={signOut} style={{ ...pillStyle, background: "transparent", cursor: "pointer" }}>Sign out</button>
      </div>
    </div>
  );
}

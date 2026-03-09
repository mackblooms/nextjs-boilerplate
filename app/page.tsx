"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const buttonStyle = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid var(--border-color)",
  textDecoration: "none",
  fontWeight: 800,
  minWidth: 170,
  textAlign: "center" as const,
};

export default function Home() {
  const searchParams = useSearchParams();
  const invitePoolId = searchParams.get("invite");
  const [invitePoolName, setInvitePoolName] = useState<string | null>(null);

  const loginHref = useMemo(() => {
    if (!invitePoolId) return "/login";
    return `/login?next=${encodeURIComponent(`/pool/${invitePoolId}`)}`;
  }, [invitePoolId]);

  useEffect(() => {
    const loadInvitePoolName = async () => {
      if (!invitePoolId) {
        setInvitePoolName(null);
        return;
      }

      const { data } = await supabase
        .from("pools")
        .select("name")
        .eq("id", invitePoolId)
        .maybeSingle();

      setInvitePoolName(data?.name ?? null);
    };

    loadInvitePoolName();
  }, [invitePoolId]);

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "48px auto",
        padding: 16,
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: 20,
      }}
    >
      <Image
        src="/pool-logo.svg?v=2"
        alt="bracketball logo"
        width={560}
        height={206}
        priority
        style={{ width: "min(100%, 560px)", height: "auto", filter: "var(--logo-filter)" }}
      />

      <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>
        bracketball (beta)
      </h1>

      {invitePoolId ? (
        <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
          You are being invited to join <b>{invitePoolName ?? "this pool"}</b>.
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link href="/how-it-works" style={buttonStyle}>
          How it works
        </Link>
        <Link href="/pools/new" style={buttonStyle}>
          Create a pool
        </Link>
        <Link href={loginHref} style={buttonStyle}>
          Login / Sign up
        </Link>
      </div>
    </main>
  );
}

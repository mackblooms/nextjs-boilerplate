"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function HomeButton() {
  const [href, setHref] = useState("/");

  useEffect(() => {
    const loadDestination = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setHref("/");
        return;
      }

      const { data: membership } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (membership?.pool_id) {
        setHref(`/pool/${membership.pool_id}`);
        return;
      }

      setHref("/");
    };

    loadDestination();
  }, []);

  return (
    <Link
      href={href}
      aria-label="Go to bracketball home"
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 1000,
        background: "#111",
        color: "#fff",
        borderRadius: 999,
        padding: "8px 14px",
        fontWeight: 800,
        textDecoration: "none",
        lineHeight: 1,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      bracketball
    </Link>
  );
}

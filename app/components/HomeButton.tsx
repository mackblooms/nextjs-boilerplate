"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

export default function HomeButton() {
  const [href, setHref] = useState("/");
  const isHidden = useAutoHideOnScroll();

  useEffect(() => {
    const loadDestination = async () => {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setHref("/");
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
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
        top: 18,
        left: 20,
        zIndex: 1000,
        color: "var(--foreground)",
        textDecoration: "none",
        fontFamily:
          "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 28,
        letterSpacing: "0.18em",
        fontWeight: 500,
        lineHeight: 1,
        textTransform: "lowercase",
        transform: isHidden ? "translateY(-140%)" : "translateY(0)",
        opacity: isHidden ? 0 : 1,
        transition: "transform 180ms ease, opacity 180ms ease",
        pointerEvents: isHidden ? "none" : "auto",
      }}
    >
      bracketball
    </Link>
  );
}

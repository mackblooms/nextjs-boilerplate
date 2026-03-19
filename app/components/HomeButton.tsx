"use client";

import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

export default function HomeButton() {
  const [href, setHref] = useState("/");
  const pathname = usePathname();
  const isHidden = useAutoHideOnScroll();
  const showHomeLogo = pathname === "/";

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
        display: "inline-grid",
        gridTemplateColumns: "auto auto",
        columnGap: 8,
        alignItems: "start",
        transform: isHidden ? "translateY(-140%)" : "translateY(0)",
        opacity: isHidden ? 0 : 1,
        transition: "transform 180ms ease, opacity 180ms ease",
        pointerEvents: isHidden ? "none" : "auto",
      }}
    >
      <span
        style={{
          display: "grid",
          justifyItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily:
              "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 28,
            letterSpacing: "0.18em",
            fontWeight: 500,
            lineHeight: 1,
            textTransform: "lowercase",
          }}
        >
          bracketball
        </span>
        {showHomeLogo ? (
          <Image
            src="/pool-logo.svg?v=2"
            alt=""
            aria-hidden
            width={88}
            height={32}
            priority
            style={{
              width: 88,
              height: "auto",
              filter: "var(--logo-filter)",
            }}
          />
        ) : null}
      </span>
      <span
        style={{
          alignSelf: "center",
          marginTop: 1,
          fontFamily:
            "\"Arial Black\", Impact, Haettenschweiler, \"Segoe UI\", sans-serif",
          fontSize: 22,
          lineHeight: 1,
          letterSpacing: "0.03em",
          textTransform: "lowercase",
          fontWeight: 900,
          color: "#8f949a",
          textShadow:
            "-1px -1px 0 #2f3236, 1px -1px 0 #2f3236, -1px 1px 0 #2f3236, 1px 1px 0 #2f3236",
        }}
      >
        beta
      </span>
    </Link>
  );
}

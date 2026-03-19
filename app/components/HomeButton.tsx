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
        display: "inline-block",
        transform: isHidden ? "translateY(-140%)" : "translateY(0)",
        opacity: isHidden ? 0 : 1,
        transition: "transform 180ms ease, opacity 180ms ease",
        pointerEvents: isHidden ? "none" : "auto",
      }}
    >
      <span
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          alignItems: "baseline",
          columnGap: 4,
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
        <span
          style={{
            fontFamily: "\"Sea Dog Swift\", \"DM Sans\", Arial, sans-serif",
            fontSize: 20,
            lineHeight: 1,
            letterSpacing: "0.01em",
            textTransform: "lowercase",
            fontWeight: 700,
            color: "var(--foreground)",
            opacity: 0.72,
          }}
        >
          beta
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
              gridColumn: 1,
              justifySelf: "center",
              width: 88,
              height: "auto",
              filter: "var(--logo-filter)",
            }}
          />
        ) : null}
      </span>
    </Link>
  );
}

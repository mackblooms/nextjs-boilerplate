"use client";

import Link from "next/link";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Russo_One } from "next/font/google";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

const russoOne = Russo_One({
  subsets: ["latin"],
  weight: "400",
});

function notifyHomeButtonHover(hovered: boolean) {
  window.dispatchEvent(
    new CustomEvent("bb:home-button-hover", {
      detail: { hovered },
    })
  );
}

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

    void loadDestination();

    return () => {
      notifyHomeButtonHover(false);
    };
  }, []);

  return (
    <Link
      href={href}
      aria-label="Go to bracketball home"
      onMouseEnter={() => notifyHomeButtonHover(true)}
      onMouseLeave={() => notifyHomeButtonHover(false)}
      onFocus={() => notifyHomeButtonHover(true)}
      onBlur={() => notifyHomeButtonHover(false)}
      style={{
        position: "fixed",
        top: 14,
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
          alignItems: "center",
          columnGap: 6,
          rowGap: 5,
          background: "var(--surface-glass)",
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          boxShadow: "var(--shadow-sm)",
          backdropFilter: "blur(8px)",
          padding: "8px 10px",
        }}
      >
        <span
          style={{
            fontFamily:
              "var(--font-brand-display), var(--font-app-sans), 'Avenir Next', sans-serif",
            fontSize: 23,
            letterSpacing: "0.08em",
            fontWeight: 700,
            lineHeight: 1,
            textTransform: "lowercase",
          }}
        >
          bracketball
        </span>
        <span
          style={{
            fontFamily: russoOne.style.fontFamily,
            fontSize: 14,
            lineHeight: 1,
            letterSpacing: "0.06em",
            textTransform: "lowercase",
            fontWeight: 400,
            color: "var(--focus-ring)",
            border: "1px solid var(--highlight-border)",
            borderRadius: 9999,
            padding: "3px 8px 2px",
            background: "var(--surface-elevated)",
            opacity: 0.92,
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
              width: 84,
              height: "auto",
              filter: "var(--logo-filter)",
              opacity: 0.94,
            }}
          />
        ) : null}
      </span>
    </Link>
  );
}

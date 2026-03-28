"use client";

import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Russo_One } from "next/font/google";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

const russoOne = Russo_One({
  subsets: ["latin"],
  weight: "400",
});
const COMPACT_HEADER_QUERY = "(max-width: 780px)";

function notifyHomeButtonHover(hovered: boolean) {
  window.dispatchEvent(
    new CustomEvent("bb:home-button-hover", {
      detail: { hovered },
    })
  );
}

export default function HomeButton() {
  const [href, setHref] = useState("/");
  const [isCompact, setIsCompact] = useState(false);
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
      setHref("/");
    };

    void loadDestination();

    return () => {
      notifyHomeButtonHover(false);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_HEADER_QUERY);
    const syncCompact = () => setIsCompact(media.matches);
    syncCompact();

    const onChange = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  if (isCompact) {
    return null;
  }

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
        top: isCompact ? 10 : 14,
        left: isCompact ? 10 : 20,
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
          padding: isCompact ? "7px 9px" : "8px 10px",
        }}
      >
        <span
          style={{
            fontFamily:
              "var(--font-brand-display), var(--font-app-sans), 'Avenir Next', sans-serif",
            fontSize: isCompact ? 18 : 23,
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
            fontSize: isCompact ? 11 : 14,
            lineHeight: 1,
            letterSpacing: "0.06em",
            textTransform: "lowercase",
            fontWeight: 400,
            color: "var(--focus-ring)",
            border: "1px solid var(--highlight-border)",
            borderRadius: 9999,
            padding: isCompact ? "2px 7px" : "3px 8px 2px",
            background: "var(--surface-elevated)",
            opacity: 0.92,
          }}
        >
          beta
        </span>
      </span>
    </Link>
  );
}

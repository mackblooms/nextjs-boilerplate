"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const isDark = theme === "dark";

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      role="switch"
      aria-checked={isDark}
      aria-label="Theme"
      style={{
        position: "fixed",
        top: 14,
        right: 16,
        width: 68,
        height: 36,
        border: "1px solid var(--border-color)",
        borderRadius: 999,
        background: "var(--surface)",
        cursor: "pointer",
        zIndex: 50,
        padding: 0,
      }}
    >
      <span
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: "100%",
        }}
      >
        <span style={{ position: "absolute", left: 9, top: 8, fontSize: 16 }}>🌙</span>
        <span style={{ position: "absolute", right: 9, top: 8, fontSize: 16 }}>☀️</span>
        <span
          style={{
            position: "absolute",
            top: 3,
            left: isDark ? 35 : 3,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--surface-elevated)",
            border: "1px solid var(--border-color)",
            transition: "left 150ms ease",
          }}
        />
      </span>
    </button>
  );
}

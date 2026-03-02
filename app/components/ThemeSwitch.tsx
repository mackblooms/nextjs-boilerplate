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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        border: "1px solid #ccc",
        borderRadius: 999,
        padding: "8px 12px",
        background: "var(--background)",
        color: "var(--foreground)",
        cursor: "pointer",
        fontWeight: 700,
        zIndex: 50,
      }}
    >
      Toggle theme
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import HowItWorksRulesContent from "./HowItWorksRulesContent";

export default function HowItWorksRulesModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("bb:open-how-it-works", onOpen);
    return () => window.removeEventListener("bb:open-how-it-works", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2300,
        background: "rgba(0, 0, 0, 0.62)",
        display: "grid",
        placeItems: "center",
        padding: 14,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="How it works"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(920px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          boxShadow: "var(--shadow-lg)",
          padding: 16,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
            bracketball: How It Works
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              padding: "6px 10px",
              background: "transparent",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <p style={{ margin: 0, lineHeight: 1.6 }}>
          This covers draft budget rules, scoring, and bonuses.
        </p>

        <HowItWorksRulesContent />
      </section>
    </div>
  );
}

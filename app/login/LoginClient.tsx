"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Mode = "sign-in" | "sign-up";

export default function LoginClient() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "success">("idle");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMsg("");

    const next =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("next") || "/pools"
        : "/pools";

    if (mode === "sign-up") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        setStatus("error");
        setMsg(error.message);
        return;
      }

      setStatus("success");
      setMsg("Account created. If email confirmation is enabled, check your inbox once. After that, sign in with your password.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }

    setStatus("success");
    setMsg("Signed in successfully. Redirecting...");

    window.location.href = next;
  }

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Sign in</h1>
      <p style={{ marginBottom: 24 }}>Use email + password so you don’t need a magic link every time.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: mode === "sign-in" ? "var(--surface-elevated)" : "transparent",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("sign-up")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: mode === "sign-up" ? "var(--surface-elevated)" : "transparent",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Create account
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid #ccc",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid #ccc",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />

        <button
          type="submit"
          disabled={status === "sending"}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {status === "sending"
            ? "Working..."
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 12, opacity: 0.8, fontSize: 14 }}>
        Prefer magic link? You can still request one from Supabase later if needed.
      </p>

      {msg ? <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{msg}</p> : null}
    </main>
  );
}

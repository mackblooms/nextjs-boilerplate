"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [msg, setMsg] = useState("");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }

    setStatus("sent");
    setMsg("Magic link sent! Check your email.");
  }

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Sign in
      </h1>
      <p style={{ marginBottom: 24 }}>
        Enter your email to receive a magic link.
      </p>

      <form onSubmit={sendMagicLink}>
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
          {status === "sending" ? "Sending..." : "Send magic link"}
        </button>
      </form>

      {msg ? (
        <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{msg}</p>
      ) : null}
    </main>
  );
}

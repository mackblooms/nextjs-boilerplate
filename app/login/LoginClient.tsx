"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const MAGIC_LINK_COOLDOWN_SECONDS = 60;

function getRateLimitMessage() {
  return "We just sent you a magic link. Please wait about a minute before requesting another one.";
}

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [msg, setMsg] = useState("");
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  const secondsRemaining =
    cooldownEndsAt === null
      ? 0
      : Math.max(0, Math.ceil((cooldownEndsAt - now) / 1000));

  useEffect(() => {
    if (!cooldownEndsAt) return;

    const interval = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - currentTime) / 1000));
      if (remaining <= 0) {
        setCooldownEndsAt(null);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [cooldownEndsAt]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();

    if (secondsRemaining > 0) {
      setStatus("error");
      setMsg(getRateLimitMessage());
      return;
    }

    setStatus("sending");
    setMsg("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(new URLSearchParams(window.location.search).get("next") || "/")}`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setStatus("error");
      if (error.message.toLowerCase().includes("rate limit")) {
        setMsg(getRateLimitMessage());
      } else {
        setMsg(error.message);
      }
      return;
    }

    setStatus("sent");
    setMsg("Magic link sent! Check your email.");
    setCooldownEndsAt(Date.now() + MAGIC_LINK_COOLDOWN_SECONDS * 1000);
    setNow(Date.now());
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
          disabled={status === "sending" || secondsRemaining > 0}
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
            ? "Sending..."
            : secondsRemaining > 0
              ? `Try again in ${secondsRemaining}s`
              : "Send magic link"}
        </button>
      </form>
      {msg ? <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{msg}</p> : null}
    </main>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { resolveInvitePoolId } from "../../lib/poolInvite";

type Mode = "sign-in" | "sign-up";

export default function LoginClient() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "sending" | "error" | "success"
  >("idle");
  const [msg, setMsg] = useState("");

  const next =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("next") || "/pools"
      : "/pools";

  const invitePoolId =
    typeof window !== "undefined"
      ? resolveInvitePoolId(new URLSearchParams(window.location.search))
      : null;

  const profileSetupNext =
    (() => {
      const params = new URLSearchParams({
        onboarding: "1",
        next,
      });
      if (invitePoolId) params.set("invitePoolId", invitePoolId);
      return `/profile?${params.toString()}`;
    })();

  function buildAuthCallbackUrl(nextPath: string) {
    const params = new URLSearchParams({ next: nextPath });
    if (invitePoolId) params.set("invitePoolId", invitePoolId);
    return `${window.location.origin}/auth/callback?${params.toString()}`;
  }

  async function resendConfirmation() {
    setStatus("sending");
    setMsg("");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: buildAuthCallbackUrl(profileSetupNext),
      },
    });

    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }

    setStatus("success");
    setMsg("Confirmation email sent. Check your inbox and spam folder.");
  }

  async function sendPasswordReset() {
    if (!email) {
      setStatus("error");
      setMsg("Enter your email first, then click Forgot password.");
      return;
    }

    setStatus("sending");
    setMsg("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/reset-password`,
    });

    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }

    setStatus("success");
    setMsg(
      "Password reset email sent. Open the link in your email to set a new password.",
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMsg("");

    if (mode === "sign-up") {
      if (password !== confirmPassword) {
        setStatus("error");
        setMsg("Passwords do not match.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: buildAuthCallbackUrl(profileSetupNext),
        },
      });

      if (error) {
        setStatus("error");
        setMsg(error.message);
        return;
      }

      const hasIdentity = Boolean(
        data.user?.identities && data.user.identities.length > 0,
      );
      const hasSession = Boolean(data.session);

      setStatus("success");
      if (hasSession) {
        setMsg("Account created and signed in. Redirecting...");
        window.location.href = profileSetupNext;
        return;
      }

      if (hasIdentity) {
        setMsg(
          "Account created. We sent a confirmation email. Open it to activate your account.",
        );
      } else {
        setMsg(
          "If an account exists for that email, Supabase may not return details for security reasons. Try signing in, or use 'Resend confirmation'.",
        );
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus("error");
      setMsg(error.message);
      return;
    }

    setStatus("success");
    setMsg("Signed in successfully. Redirecting...");
    window.location.href = profileSetupNext;
  }

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Sign in
      </h1>
      <p style={{ marginBottom: 24 }}>
        Use email + password so you do not need a magic link every time.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setMode("sign-in")}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background:
              mode === "sign-in" ? "var(--surface-elevated)" : "transparent",
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
            background:
              mode === "sign-up" ? "var(--surface-elevated)" : "transparent",
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
          placeholder={mode === "sign-up" ? "New password" : "Password"}
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

        {mode === "sign-up" ? (
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
        ) : null}

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

      {mode === "sign-in" ? (
        <button
          type="button"
          onClick={sendPasswordReset}
          disabled={status === "sending"}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            cursor: "pointer",
            fontWeight: 600,
            background: "transparent",
          }}
        >
          Forgot password?
        </button>
      ) : null}

      {mode === "sign-up" ? (
        <button
          type="button"
          onClick={resendConfirmation}
          disabled={status === "sending" || !email}
          style={{
            marginTop: 10,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            cursor: "pointer",
            fontWeight: 600,
            background: "transparent",
          }}
        >
          Resend confirmation email
        </button>
      ) : null}

      <p style={{ marginTop: 12, opacity: 0.8, fontSize: 14 }}>
        For confirmation emails and password resets to send, Supabase must have
        Email provider configured and &quot;Confirm email&quot; enabled in Auth
        settings.
      </p>

      {msg ? (
        <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{msg}</p>
      ) : null}
    </main>
  );
}

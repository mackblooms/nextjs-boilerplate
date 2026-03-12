"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { resolveInvitePoolId } from "../../../lib/poolInvite";
import { PASSWORD_MIN_LENGTH, generateStrongPassword } from "../../../lib/accountPassword";

export default function LoginResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("Validating your reset link...");

  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const nextPath = searchParams?.get("next") || "/pools";
  const invitePoolId = searchParams ? resolveInvitePoolId(searchParams) : null;

  useEffect(() => {
    const bootstrapSession = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;

        if (hash) {
          const hashParams = new URLSearchParams(hash);
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");

          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          setMsg(
            "Your reset link is invalid or expired. Request a new password reset email from the login page."
          );
          return;
        }

        setReady(true);
        setMsg("");
      } catch (e: unknown) {
        const detail = e instanceof Error ? e.message : String(e);
        setMsg(`Could not validate reset link: ${detail}`);
      }
    };

    bootstrapSession();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Password updated. Redirecting to login...");
    await supabase.auth.signOut();

    const loginParams = new URLSearchParams({
      next: nextPath.startsWith("/") ? nextPath : "/pools",
    });

    if (invitePoolId) {
      loginParams.set("invitePoolId", invitePoolId);
    }

    router.replace(`/login?${loginParams.toString()}`);
  }

  function onGeneratePassword() {
    const suggestedPassword = generateStrongPassword();
    setPassword(suggestedPassword);
    setConfirmPassword(suggestedPassword);
    setMsg("Strong password generated. You can use it as-is.");
  }

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Reset password</h1>
      <p style={{ marginBottom: 24 }}>Enter your new password below.</p>

      {ready ? (
        <form onSubmit={onSubmit}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
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
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
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
            type="button"
            onClick={onGeneratePassword}
            disabled={saving}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              fontWeight: 600,
              background: "transparent",
              marginBottom: 12,
            }}
          >
            Generate strong password
          </button>

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {saving ? "Saving..." : "Save new password"}
          </button>
        </form>
      ) : null}

      {msg ? <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{msg}</p> : null}
    </main>
  );
}

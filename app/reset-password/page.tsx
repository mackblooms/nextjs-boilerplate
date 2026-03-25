"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { PASSWORD_MIN_LENGTH, generateStrongPassword } from "../../lib/accountPassword";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

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
    router.replace("/login");
  }

  function onGeneratePassword() {
    const suggestedPassword = generateStrongPassword();
    setPassword(suggestedPassword);
    setConfirmPassword(suggestedPassword);
    setMsg("Strong password generated. You can use it as-is.");
  }

  return (
    <main className="page-shell page-shell--stack page-card" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Reset password</h1>
      <p style={{ marginBottom: 24 }}>Enter your new password below.</p>

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
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            marginBottom: 12,
            background: "var(--surface-muted)",
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
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            marginBottom: 12,
            background: "var(--surface-muted)",
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
            border: "1px solid var(--border-color)",
            background: "var(--surface-elevated)",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {saving ? "Saving..." : "Save new password"}
        </button>
      </form>

      {msg ? <p style={{ marginTop: 16 }}>{msg}</p> : null}
    </main>
  );
}



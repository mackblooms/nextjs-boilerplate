"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function LoginResetPasswordPage() {
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

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Reset password</h1>
      <p style={{ marginBottom: 24 }}>Enter your new password below.</p>

      <form onSubmit={onSubmit}>
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
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
          minLength={6}
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

      {msg ? <p style={{ marginTop: 16 }}>{msg}</p> : null}
    </main>
  );
}

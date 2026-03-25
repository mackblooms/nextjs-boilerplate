"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { PASSWORD_MIN_LENGTH, generateStrongPassword } from "../../lib/accountPassword";
import { UiButton, UiInput } from "../components/ui/primitives";

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
        <UiInput
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          required
          style={{ marginBottom: 12 }}
        />

        <UiInput
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          required
          style={{ marginBottom: 12 }}
        />

        <UiButton
          type="button"
          onClick={onGeneratePassword}
          disabled={saving}
          variant="ghost"
          fullWidth
          style={{ marginBottom: 12 }}
        >
          Generate strong password
        </UiButton>

        <UiButton
          type="submit"
          disabled={saving}
          variant="primary"
          size="lg"
          fullWidth
        >
          {saving ? "Saving..." : "Save new password"}
        </UiButton>
      </form>

      {msg ? <p style={{ marginTop: 16 }}>{msg}</p> : null}
    </main>
  );
}



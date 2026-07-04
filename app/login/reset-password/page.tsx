"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { resolveInvitePoolId } from "../../../lib/poolInvite";
import { PASSWORD_MIN_LENGTH, generateStrongPassword } from "../../../lib/accountPassword";
import { UiButton, UiFormField, UiInput, UiStatus } from "../../components/ui/primitives";

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
    <main className="page-shell page-card app-form-card" style={{ maxWidth: 520 }}>
      <h1>Reset password</h1>
      <p className="app-form-note">Enter a new password for your bracketball account.</p>

      {ready ? (
        <form onSubmit={onSubmit} className="app-form">
          <UiFormField
            label="new password"
            htmlFor="reset-password"
            required
            helperText={`minimum ${PASSWORD_MIN_LENGTH} characters.`}
          >
            <UiInput
              id="reset-password"
              type="password"
              placeholder="new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
            />
          </UiFormField>

          <UiFormField
            label="confirm password"
            htmlFor="reset-confirm-password"
            required
            error={confirmPassword && password !== confirmPassword ? "passwords do not match." : undefined}
          >
            <UiInput
              id="reset-confirm-password"
              type="password"
              placeholder="confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
              aria-invalid={Boolean(confirmPassword && password !== confirmPassword)}
            />
          </UiFormField>

          <UiButton
            type="button"
            onClick={onGeneratePassword}
            disabled={saving}
            variant="ghost"
            fullWidth
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
      ) : null}

      {msg ? (
        <UiStatus tone={msg.toLowerCase().includes("error") || msg.toLowerCase().includes("failed") ? "error" : "info"}>
          {msg}
        </UiStatus>
      ) : null}
    </main>
  );
}


"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { resolveInvitePoolId } from "../../lib/poolInvite";
import { PASSWORD_MIN_LENGTH, generateStrongPassword } from "../../lib/accountPassword";

type Mode = "sign-in" | "sign-up";

export default function LoginClient() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [continueSignUpAfterLegal, setContinueSignUpAfterLegal] = useState(false);
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

  useEffect(() => {
    if (!legalModalOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setLegalModalOpen(false);
      setContinueSignUpAfterLegal(false);
    };

    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("keydown", onEscape);
    };
  }, [legalModalOpen]);

  function buildAuthCallbackUrl(nextPath: string) {
    const params = new URLSearchParams({ next: nextPath });
    if (invitePoolId) params.set("invitePoolId", invitePoolId);
    return `${window.location.origin}/auth/callback?${params.toString()}`;
  }

  function openLegalModal(continueAfterAccept: boolean) {
    setLegalModalOpen(true);
    setContinueSignUpAfterLegal(continueAfterAccept);
  }

  function closeLegalModal() {
    setLegalModalOpen(false);
    setContinueSignUpAfterLegal(false);
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

  async function submitSignUp() {
    setStatus("sending");
    setMsg("");

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
  }

  async function submitSignIn() {
    setStatus("sending");
    setMsg("");

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "sign-up") {
      setMsg("");

      if (password !== confirmPassword) {
        setStatus("error");
        setMsg("Passwords do not match.");
        return;
      }
      if (!acceptedLegal) {
        setStatus("idle");
        openLegalModal(true);
        return;
      }

      await submitSignUp();
      return;
    }

    await submitSignIn();
  }

  function onGeneratePassword() {
    const suggestedPassword = generateStrongPassword();
    setPassword(suggestedPassword);
    setConfirmPassword(suggestedPassword);
    setStatus("idle");
    setMsg("Strong password generated. You can use it as-is.");
  }

  function onAgreeToLegal() {
    if (!acceptedLegal) return;

    const shouldContinue = continueSignUpAfterLegal;
    setLegalModalOpen(false);
    setContinueSignUpAfterLegal(false);

    if (shouldContinue) {
      void submitSignUp();
    }
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
          onClick={() => {
            setMode("sign-in");
            closeLegalModal();
            setMsg("");
            setStatus("idle");
          }}
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
          onClick={() => {
            setMode("sign-up");
            closeLegalModal();
            setMsg("");
            setStatus("idle");
          }}
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
          autoComplete="email"
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
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
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
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
            }}
          />
        ) : null}

        {mode === "sign-up" ? (
          <div
            style={{
              display: "grid",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              onClick={onGeneratePassword}
              disabled={status === "sending"}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                cursor: "pointer",
                fontWeight: 600,
                background: "transparent",
              }}
            >
              Generate strong password
            </button>
            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                padding: "10px 12px",
                background: acceptedLegal ? "var(--success-bg)" : "var(--surface-muted)",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {acceptedLegal ? "Legal agreement accepted." : "Legal agreement required."}
              </div>
              <button
                type="button"
                onClick={() => openLegalModal(false)}
                disabled={status === "sending"}
                style={{
                  justifySelf: "start",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {acceptedLegal ? "Review agreement" : "Review and agree"}
              </button>
            </div>
          </div>
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

      {mode === "sign-up" && legalModalOpen ? (
        <div
          role="presentation"
          onClick={closeLegalModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 3000,
            padding: 16,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Accept legal agreement"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              borderRadius: 14,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              boxShadow: "0 20px 42px rgba(0,0,0,0.3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid var(--border-color)",
                background:
                  "linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface) 100%)",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                Before you create your account
              </h2>
              <p style={{ margin: "6px 0 0", fontSize: 14, opacity: 0.82, lineHeight: 1.4 }}>
                Please review and accept the legal terms for using bracketball.
              </p>
            </div>

            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: 12,
                  background: "var(--surface-muted)",
                  fontSize: 14,
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Review documents:</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #2563eb",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontWeight: 800,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    Terms of Service
                  </Link>
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #2563eb",
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontWeight: 800,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    Privacy Policy
                  </Link>
                </div>
                By checking the box below, you agree to these documents.
              </div>

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: acceptedLegal ? "var(--success-bg)" : "var(--surface)",
                }}
              >
                <input
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(event) => setAcceptedLegal(event.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span style={{ fontSize: 14, lineHeight: 1.35 }}>
                  I agree to bracketball&apos;s Terms of Service and Privacy Policy.
                </span>
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closeLegalModal}
                  disabled={status === "sending"}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={onAgreeToLegal}
                  disabled={!acceptedLegal || status === "sending"}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface-elevated)",
                    cursor: !acceptedLegal || status === "sending" ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    opacity: !acceptedLegal || status === "sending" ? 0.65 : 1,
                  }}
                >
                  {continueSignUpAfterLegal ? "Agree and create account" : "Agree"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { resolveInvitePoolId } from "../../lib/poolInvite";
import { PASSWORD_MIN_LENGTH, generateStrongPassword } from "../../lib/accountPassword";
import BackArrowButton from "../components/BackArrowButton";
import { UiButton, UiInput } from "../components/ui/primitives";

type Mode = "sign-in" | "sign-up";

function sanitizeNextPath(nextPath: string | null) {
  if (!nextPath) return "/";
  return nextPath.startsWith("/") ? nextPath : "/";
}

function describeDestination(nextPath: string) {
  if (nextPath === "/") return "home";
  if (/^\/pool\/[^/?#]+\/leaderboard(?:\/|$)/.test(nextPath)) return "the leaderboard";
  if (/^\/pool\/[^/?#]+\/draft(?:\/|$)/.test(nextPath)) return "the draft room";
  if (/^\/pool\/[^/?#]+\/bracket(?:\/|$)/.test(nextPath)) return "the bracket";
  if (/^\/pool\/[^/?#]+(?:\/|$)/.test(nextPath)) return "your pool";
  if (nextPath.startsWith("/pools")) return "your pools";
  if (nextPath.startsWith("/profile")) return "your profile";
  return "your account";
}

export default function LoginClient() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [continueSignUpAfterLegal, setContinueSignUpAfterLegal] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "success">("idle");
  const [msg, setMsg] = useState("");

  const nextPath =
    typeof window !== "undefined"
      ? sanitizeNextPath(new URLSearchParams(window.location.search).get("next"))
      : "/";

  const invitePoolId =
    typeof window !== "undefined"
      ? resolveInvitePoolId(new URLSearchParams(window.location.search))
      : null;

  const destinationLabel = useMemo(() => describeDestination(nextPath), [nextPath]);

  const profileSetupNext = useMemo(() => {
    const params = new URLSearchParams({
      onboarding: "1",
      next: nextPath,
    });
    if (invitePoolId) params.set("invitePoolId", invitePoolId);
    return `/profile?${params.toString()}`;
  }, [invitePoolId, nextPath]);

  const signInNext = invitePoolId ? `/pool/${invitePoolId}` : nextPath;

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

  function buildAuthCallbackUrl(nextTargetPath: string) {
    const params = new URLSearchParams({ next: nextTargetPath });
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

    const hasIdentity = Boolean(data.user?.identities && data.user.identities.length > 0);
    const hasSession = Boolean(data.session);

    setStatus("success");
    if (hasSession) {
      setMsg("Account created and signed in. Redirecting...");
      window.location.href = profileSetupNext;
      return;
    }

    if (hasIdentity) {
      setMsg("Account created. We sent a confirmation email. Open it to activate your account.");
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
    window.location.href = signInNext;
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
    <main className="page-shell login-shell">
      <div className="back-arrow-row login-back-row">
        <BackArrowButton fallbackHref="/" />
      </div>

      <section className="page-surface login-brand-panel">
        <div className="login-brand-mark-wrap">
          <Image
            src="/bracketball-logo-mark.png"
            alt="bracketball logo"
            width={228}
            height={64}
            className="login-brand-mark"
            priority
          />
        </div>
        <h1 className="login-hero-title">draft smarter. climb faster.</h1>
        <p className="login-hero-copy">
          Build private March Madness pools, draft teams by value, and track every score update in
          real time.
        </p>
        <p className="login-hero-copy">
          Can you find the perfect draft strategy? Can you build the best combination of picks for
          upside and consistency? Every draft is a puzzle to optimize, refine, and master.
        </p>

        <div
          className="login-context-card"
          data-tone={invitePoolId ? "invite" : "default"}
        >
          {invitePoolId
            ? "You were invited to a pool. Sign in to join and lock in your bracket."
            : `Sign in to continue to ${destinationLabel}.`}
        </div>

        <ul className="login-feature-list" aria-label="Platform highlights">
          <li className="login-feature-item">Live leaderboard refresh and projected finishes.</li>
          <li className="login-feature-item">
            Draft strategy mode with team value, popularity insight, and optimization-focused prep.
          </li>
          <li className="login-feature-item">Private pool invites with secure account-based access.</li>
        </ul>

        <div className="login-brand-links">
          <Link href="/how-it-works">How it works</Link>
          <span aria-hidden="true">|</span>
          <Link href="/support">Support</Link>
          <span aria-hidden="true">|</span>
          <Link href="/terms">Rules + legal</Link>
        </div>
      </section>

      <section className="page-card login-form-card">
        <h2 className="login-form-title">
          {mode === "sign-up" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="page-subtitle login-form-subtitle">
          {mode === "sign-up"
            ? "Create a password so you can sign in quickly from any device."
            : "Use email + password so you do not need a magic link every time."}
        </p>

        <div className="login-mode-toggle">
          <UiButton
            type="button"
            onClick={() => {
              setMode("sign-in");
              closeLegalModal();
              setMsg("");
              setStatus("idle");
            }}
            variant={mode === "sign-in" ? "primary" : "ghost"}
            fullWidth
          >
            Sign in
          </UiButton>
          <UiButton
            type="button"
            onClick={() => {
              setMode("sign-up");
              closeLegalModal();
              setMsg("");
              setStatus("idle");
            }}
            variant={mode === "sign-up" ? "primary" : "ghost"}
            fullWidth
          >
            Create account
          </UiButton>
        </div>

        <form onSubmit={onSubmit} className="login-form-fields">
          <UiInput
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <UiInput
            type="password"
            placeholder={mode === "sign-up" ? "New password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          />

          {mode === "sign-up" ? (
            <UiInput
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
            />
          ) : null}

          {mode === "sign-up" ? (
            <div className="login-signup-extras">
              <UiButton
                type="button"
                onClick={onGeneratePassword}
                disabled={status === "sending"}
                variant="ghost"
                fullWidth
              >
                Generate strong password
              </UiButton>
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
                <UiButton
                  type="button"
                  onClick={() => openLegalModal(false)}
                  disabled={status === "sending"}
                  size="sm"
                  style={{
                    justifySelf: "start",
                  }}
                >
                  {acceptedLegal ? "Review agreement" : "Review and agree"}
                </UiButton>
              </div>
            </div>
          ) : null}

          <UiButton
            type="submit"
            disabled={status === "sending"}
            variant="primary"
            size="lg"
            fullWidth
          >
            {status === "sending" ? "Working..." : mode === "sign-up" ? "Create account" : "Sign in"}
          </UiButton>
        </form>

        {mode === "sign-in" ? (
          <UiButton
            type="button"
            onClick={sendPasswordReset}
            disabled={status === "sending"}
            variant="ghost"
            fullWidth
            style={{ marginTop: 10 }}
          >
            Forgot password?
          </UiButton>
        ) : null}

        {mode === "sign-up" ? (
          <UiButton
            type="button"
            onClick={resendConfirmation}
            disabled={status === "sending" || !email}
            variant="ghost"
            fullWidth
            style={{ marginTop: 10 }}
          >
            Resend confirmation email
          </UiButton>
        ) : null}

        {process.env.NODE_ENV !== "production" ? (
          <p style={{ marginTop: 12, opacity: 0.78, fontSize: 13 }}>
            Local setup note: configure Supabase Email provider and enable Confirm email.
          </p>
        ) : null}

        {msg ? (
          <p
            className="login-status-message"
            data-tone={status === "error" ? "error" : status === "success" ? "success" : "neutral"}
          >
            {msg}
          </p>
        ) : null}
      </section>

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
                background: "linear-gradient(135deg, var(--surface-elevated) 0%, var(--surface) 100%)",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Before you create your account</h2>
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
                <UiButton type="button" onClick={closeLegalModal} disabled={status === "sending"}>
                  Not now
                </UiButton>
                <UiButton
                  type="button"
                  onClick={onAgreeToLegal}
                  disabled={!acceptedLegal || status === "sending"}
                  variant="primary"
                >
                  {continueSignUpAfterLegal ? "Agree and create account" : "Agree"}
                </UiButton>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

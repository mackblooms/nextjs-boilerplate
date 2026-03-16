"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const GUIDE_VERSION = "2026-03-quickstart-v1";
const GUEST_GUIDE_KEY = `bracketball.quickstart.guest.${GUIDE_VERSION}`;
const USER_GUIDE_KEY_PREFIX = `bracketball.quickstart.user.${GUIDE_VERSION}`;

type GuideStep = {
  title: string;
  detail: string;
  route: string;
  action: string;
};

function userGuideKey(userId: string) {
  return `${USER_GUIDE_KEY_PREFIX}.${userId}`;
}

function hasSeenGuide(userId: string | null) {
  if (typeof window === "undefined") return true;
  const key = userId ? userGuideKey(userId) : GUEST_GUIDE_KEY;
  return window.localStorage.getItem(key) === "1";
}

function markGuideSeen(userId: string | null) {
  if (typeof window === "undefined") return;
  const key = userId ? userGuideKey(userId) : GUEST_GUIDE_KEY;
  window.localStorage.setItem(key, "1");
}

function buildSteps(isAuthed: boolean): GuideStep[] {
  const shared: GuideStep[] = [
    {
      title: "Step 1: Start your profile",
      detail: "Open Profile and save your full name + favorite team. This unlocks the normal flow.",
      route: "/profile",
      action: "Open Profile",
    },
    {
      title: "Step 2: Create your draft",
      detail: "Go to My Drafts and create at least one draft.",
      route: "/drafts",
      action: "Open Drafts",
    },
    {
      title: "Step 3: Build your picks",
      detail: "Open your draft, choose teams, and stay within your draft rules and budget.",
      route: "/drafts",
      action: "Edit Draft",
    },
    {
      title: "Step 4: Add your draft to a pool",
      detail: "Go to Pools, join or create your pool, open that pool, then tap Apply Draft.",
      route: "/pools",
      action: "Open Pools",
    },
  ];

  if (isAuthed) return shared;

  return [
    {
      title: "Step 0: Sign in or create account",
      detail: "Use Login / Sign up first so your profile and drafts are saved to your account.",
      route: "/login",
      action: "Open Login",
    },
    ...shared,
  ];
}

export default function InstructionsModal() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const shouldSuppressModal = useMemo(() => {
    if (!pathname) return false;
    if (pathname.startsWith("/auth/callback")) return true;
    if (pathname.startsWith("/login/reset-password")) return true;
    if (pathname === "/reset-password") return true;
    return false;
  }, [pathname]);

  const tryOpenGuide = useCallback(
    (userId: string | null) => {
      if (shouldSuppressModal) {
        setIsOpen(false);
        return;
      }
      setIsOpen(!hasSeenGuide(userId));
    },
    [shouldSuppressModal]
  );

  useEffect(() => {
    let mounted = true;

    const loadAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;

      const user = data.user ?? null;
      const userId = user?.id ?? null;
      setActiveUserId(userId);
      setIsAuthed(Boolean(user));
      tryOpenGuide(userId);
      setIsReady(true);
    };

    void loadAuth();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const userId = user?.id ?? null;
      setActiveUserId(userId);
      setIsAuthed(Boolean(user));
      tryOpenGuide(userId);
      setIsReady(true);
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [tryOpenGuide]);

  useEffect(() => {
    if (!isOpen) return;
    const existingOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = existingOverflow;
    };
  }, [isOpen]);

  const closeAndRemember = useCallback(() => {
    markGuideSeen(activeUserId);
    setIsOpen(false);
  }, [activeUserId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRemember();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAndRemember, isOpen]);

  if (!isReady || !isOpen || shouldSuppressModal) {
    return null;
  }

  const steps = buildSteps(isAuthed);

  return (
    <div
      role="presentation"
      onClick={closeAndRemember}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2200,
        background: "rgba(0, 0, 0, 0.58)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 14,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="How to start on bracketball"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          borderRadius: 14,
          border: "1px solid var(--border-color)",
          background: "var(--surface)",
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Start Here</h2>
          <p style={{ margin: 0, opacity: 0.88, lineHeight: 1.5 }}>
            Follow this order exactly: <b>Profile</b>{" -> "}
            <b>Drafts</b>{" -> "}
            <b>Pools</b>{" -> "}
            <b>Apply Draft</b>.
          </p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {steps.map((step) => (
            <article
              key={step.title}
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                background: "var(--surface-muted)",
                padding: 12,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>{step.title}</h3>
                <p style={{ margin: 0, lineHeight: 1.4 }}>{step.detail}</p>
                <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
                  Route: <code>{step.route}</code>
                </p>
              </div>
              <div>
                <Link
                  href={step.route}
                  onClick={closeAndRemember}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 40,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    textDecoration: "none",
                    fontWeight: 800,
                    background: "var(--surface)",
                  }}
                >
                  {step.action}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={closeAndRemember}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            I understand
          </button>
          <Link
            href="/how-it-works"
            onClick={closeAndRemember}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              textDecoration: "none",
              background: "var(--surface)",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Read Full Rules
          </Link>
        </div>
      </section>
    </div>
  );
}

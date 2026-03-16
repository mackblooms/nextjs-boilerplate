"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const GUIDE_VERSION = "2026-03-quickstart-v2";
const GUEST_GUIDE_SEEN_KEY = `bracketball.quickstart.guest.seen.${GUIDE_VERSION}`;
const USER_HIDE_ON_LOGIN_KEY_PREFIX = `bracketball.quickstart.user.hide_on_login.${GUIDE_VERSION}`;
const SESSION_SHOWN_KEY_PREFIX = `bracketball.quickstart.session.shown.${GUIDE_VERSION}`;

type GuidePreview = "login" | "profile" | "drafts" | "draft-editor" | "pools";

type GuideStep = {
  id: string;
  title: string;
  detail: string;
  route: string;
  action: string;
  checklist: string[];
  preview: GuidePreview;
};

function userHideOnLoginKey(userId: string) {
  return `${USER_HIDE_ON_LOGIN_KEY_PREFIX}.${userId}`;
}

function sessionShownKey(userId: string | null) {
  return userId ? `${SESSION_SHOWN_KEY_PREFIX}.user.${userId}` : `${SESSION_SHOWN_KEY_PREFIX}.guest`;
}

function hasShownGuideThisSession(userId: string | null) {
  if (typeof window === "undefined") return true;
  return window.sessionStorage.getItem(sessionShownKey(userId)) === "1";
}

function markGuideShownThisSession(userId: string | null) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(sessionShownKey(userId), "1");
}

function hasGuestSeenGuide() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(GUEST_GUIDE_SEEN_KEY) === "1";
}

function markGuestGuideSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_GUIDE_SEEN_KEY, "1");
}

function isUserHideOnLoginEnabled(userId: string | null) {
  if (!userId || typeof window === "undefined") return false;
  return window.localStorage.getItem(userHideOnLoginKey(userId)) === "1";
}

function setUserHideOnLogin(userId: string | null, enabled: boolean) {
  if (!userId || typeof window === "undefined") return;
  const key = userHideOnLoginKey(userId);
  if (enabled) {
    window.localStorage.setItem(key, "1");
    return;
  }
  window.localStorage.removeItem(key);
}

function PreviewShell({
  title,
  path,
  children,
}: {
  title: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={`${title} example`}
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid var(--border-color)",
          background: "var(--surface-muted)",
          padding: "8px 10px",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: "var(--border-color)",
              display: "inline-block",
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: "var(--border-color)",
              display: "inline-block",
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: "var(--border-color)",
              display: "inline-block",
            }}
          />
        </div>
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            background: "var(--surface)",
            padding: "6px 8px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {path}
        </div>
      </div>
      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        {children}
      </div>
    </section>
  );
}

function MockField({
  text,
  subtle = false,
}: {
  text: string;
  subtle?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        padding: "8px 9px",
        background: "var(--surface)",
        fontWeight: 700,
        fontSize: 12,
        opacity: subtle ? 0.72 : 1,
      }}
    >
      {text}
    </div>
  );
}

function MockButton({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 8,
        padding: "8px 10px",
        background: "var(--surface-elevated)",
        fontWeight: 900,
        fontSize: 12,
        width: "fit-content",
      }}
    >
      {text}
    </div>
  );
}

function ScreenPreview({ type }: { type: GuidePreview }) {
  if (type === "login") {
    return (
      <PreviewShell title="Sign in" path="/login">
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <MockField text="Sign in" />
            <MockField text="Create account" subtle />
          </div>
          <MockField text="you@example.com" subtle />
          <MockField text="Password" subtle />
          <MockButton text="Sign in" />
        </div>
      </PreviewShell>
    );
  }

  if (type === "profile") {
    return (
      <PreviewShell title="Set up your profile" path="/profile">
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 9999,
                border: "1px solid var(--border-color)",
                background: "var(--surface-elevated)",
              }}
            />
            <MockField text="Avatar picker" subtle />
          </div>
          <MockField text="Full name (first + last)" subtle />
          <MockField text="Favorite college team" subtle />
          <MockButton text="Save and continue" />
        </div>
      </PreviewShell>
    );
  }

  if (type === "drafts") {
    return (
      <PreviewShell title="My Drafts" path="/drafts">
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <MockField text="New draft name" subtle />
            <MockButton text="Create Draft" />
          </div>
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              background: "var(--surface)",
              padding: 8,
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 12 }}>My Draft 1</div>
            <div style={{ display: "flex", gap: 6 }}>
              <MockButton text="Edit" />
              <MockButton text="Join Pool(s)" />
            </div>
          </div>
        </div>
      </PreviewShell>
    );
  }

  if (type === "draft-editor") {
    return (
      <PreviewShell title="Draft editor" path="/drafts/[draftId]">
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <MockField text="Draft name" subtle />
            <MockButton text="Save Draft" />
            <MockButton text="Open Pools" />
          </div>
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              background: "var(--surface)",
              padding: 8,
              display: "grid",
              gap: 6,
            }}
          >
            <MockField text="[ ] (1) Team A - Cost 22" subtle />
            <MockField text="[x] (8) Team B - Cost 6" />
            <MockField text="[x] (12) Team C - Cost 4" />
          </div>
          <MockField text="Summary: 14 teams selected | 98/100 budget | valid" />
        </div>
      </PreviewShell>
    );
  }

  return (
    <PreviewShell title="Pools" path="/pools -> /pool/[id]/draft">
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <MockField text="My Pools" />
          <MockField text="Discover & Join" subtle />
        </div>
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            background: "var(--surface)",
            padding: 8,
            display: "grid",
            gap: 6,
          }}
        >
          <MockField text="Pool card: March Madness League" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <MockButton text="Open details" />
            <MockButton text="Join pool" />
            <MockButton text="Apply Draft" />
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function buildSteps(isAuthed: boolean): GuideStep[] {
  const shared: GuideStep[] = [
    {
      id: "profile",
      title: "Step 1: Start your profile",
      detail: "Open Profile and save your full name + favorite team. This unlocks the normal flow.",
      route: "/profile",
      action: "Open Profile",
      checklist: [
        "Enter first and last name.",
        "Enter favorite college team.",
        "Tap Save and continue.",
      ],
      preview: "profile",
    },
    {
      id: "drafts",
      title: "Step 2: Create your draft",
      detail: "Go to My Drafts and create at least one draft.",
      route: "/drafts",
      action: "Open Drafts",
      checklist: [
        "Create a draft name.",
        "Tap Create Draft.",
        "Open your new draft with Edit.",
      ],
      preview: "drafts",
    },
    {
      id: "draft-editor",
      title: "Step 3: Build your picks",
      detail: "Open your draft, choose teams, and stay within your draft rules and budget.",
      route: "/drafts",
      action: "Edit Draft",
      checklist: [
        "Select teams in your draft editor.",
        "Keep your budget/rules valid.",
        "Tap Save Draft.",
      ],
      preview: "draft-editor",
    },
    {
      id: "pools",
      title: "Step 4: Add your draft to a pool",
      detail: "Go to Pools, join or create your pool, open that pool, then tap Apply Draft.",
      route: "/pools",
      action: "Open Pools",
      checklist: [
        "Join/create the pool.",
        "Open that pool.",
        "Go to Apply Draft and submit your saved draft.",
      ],
      preview: "pools",
    },
  ];

  if (isAuthed) return shared;

  return [
    {
      id: "login",
      title: "Step 0: Sign in or create account",
      detail: "Use Login / Sign up first so your profile and drafts are saved to your account.",
      route: "/login",
      action: "Open Login",
      checklist: [
        "Sign in with email + password.",
        "If new, create account and verify email.",
        "Return to this guide after login.",
      ],
      preview: "login",
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
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hideOnLoginChecked, setHideOnLoginChecked] = useState(false);

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

      if (userId) {
        const disabledForLogin = isUserHideOnLoginEnabled(userId);
        if (disabledForLogin || hasShownGuideThisSession(userId)) {
          setIsOpen(false);
          return;
        }
        setHideOnLoginChecked(false);
        setIsOpen(true);
        markGuideShownThisSession(userId);
        setCurrentStepIndex(0);
        return;
      }

      const shouldOpenGuest = !hasGuestSeenGuide() && !hasShownGuideThisSession(null);
      setIsOpen(shouldOpenGuest);
      if (shouldOpenGuest) {
        markGuideShownThisSession(null);
        setCurrentStepIndex(0);
      }
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

  const closeGuide = useCallback(() => {
    if (activeUserId) {
      setUserHideOnLogin(activeUserId, hideOnLoginChecked);
    } else {
      markGuestGuideSeen();
    }
    setIsOpen(false);
  }, [activeUserId, hideOnLoginChecked]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeGuide();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeGuide, isOpen]);

  if (!isReady || !isOpen || shouldSuppressModal) {
    return null;
  }

  const steps = buildSteps(isAuthed);
  const boundedStepIndex = Math.min(currentStepIndex, Math.max(steps.length - 1, 0));
  const currentStep = steps[boundedStepIndex];
  const isFirstStep = boundedStepIndex === 0;
  const isLastStep = boundedStepIndex === steps.length - 1;
  const progressPercent =
    steps.length <= 1 ? 100 : Math.round((boundedStepIndex / (steps.length - 1)) * 100);

  function nextStep() {
    if (isLastStep) {
      closeGuide();
      return;
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }

  function previousStep() {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }

  return (
    <div
      role="presentation"
      onClick={closeGuide}
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
            Step-by-step tutorial. Use Next to move through each screen.
          </p>
          <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>
            Step {boundedStepIndex + 1} of {steps.length}
          </p>
        </div>

        <div
          aria-hidden="true"
          style={{
            height: 8,
            borderRadius: 9999,
            border: "1px solid var(--border-color)",
            background: "var(--surface-muted)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: "var(--foreground)",
              opacity: 0.25,
              transition: "width 180ms ease",
            }}
          />
        </div>

        <article
          key={currentStep.id}
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            background: "var(--surface-muted)",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{currentStep.title}</h3>
            <p style={{ margin: 0, lineHeight: 1.45 }}>{currentStep.detail}</p>
            <p style={{ margin: 0, opacity: 0.75, fontSize: 13 }}>
              Route: <code>{currentStep.route}</code>
            </p>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {currentStep.checklist.map((item) => (
              <div
                key={item}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "var(--surface)",
                  fontWeight: 700,
                }}
              >
                {item}
              </div>
            ))}
          </div>

          <ScreenPreview type={currentStep.preview} />
        </article>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setCurrentStepIndex(index)}
              aria-label={`Go to ${step.title}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9999,
                border: "1px solid var(--border-color)",
                background:
                  index === boundedStepIndex ? "var(--surface-elevated)" : "var(--surface)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={previousStep}
            disabled={isFirstStep}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 800,
              cursor: isFirstStep ? "not-allowed" : "pointer",
              opacity: isFirstStep ? 0.55 : 1,
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={nextStep}
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
            {isLastStep ? "Finish" : "Next"}
          </button>
          <Link
            href={currentStep.route}
            onClick={closeGuide}
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
            {currentStep.action}
          </Link>
          <button
            type="button"
            onClick={closeGuide}
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
            Skip tutorial
          </button>
          <Link
            href="/how-it-works"
            onClick={closeGuide}
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

        {isAuthed ? (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={hideOnLoginChecked}
              onChange={(event) => setHideOnLoginChecked(event.target.checked)}
            />
            Stop showing this when I log in
          </label>
        ) : null}
      </section>
    </div>
  );
}

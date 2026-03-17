"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const TUTORIAL_OPT_OUT_KEY = "bracketball.tutorial.opt_out.v1";

type TargetBox = {
  top: string;
  left: string;
  width: string;
  height: string;
};

type GuideStep = {
  id: string;
  stepNumber: number;
  title: string;
  detail: string;
  route: string;
  action: string;
  previewPath: string;
  targetHint: string;
  targetBox: TargetBox;
};

function readTutorialOptOut() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(TUTORIAL_OPT_OUT_KEY) === "1";
}

function writeTutorialOptOut(enabled: boolean) {
  if (typeof window === "undefined") return;
  if (enabled) {
    window.localStorage.setItem(TUTORIAL_OPT_OUT_KEY, "1");
    return;
  }
  window.localStorage.removeItem(TUTORIAL_OPT_OUT_KEY);
}

function buildSteps(isAuthed: boolean): GuideStep[] {
  const shared: GuideStep[] = [
    {
      id: "profile",
      stepNumber: 1,
      title: "Set up your profile",
      detail: "Add your name and favorite team, then save.",
      route: "/profile",
      action: "Open Profile",
      previewPath: "/profile",
      targetHint: "Tap Save or Save and continue",
      targetBox: { top: "72%", left: "62%", width: "32%", height: "12%" },
    },
    {
      id: "drafts",
      stepNumber: 2,
      title: "Create your draft",
      detail: "Go to My Drafts, name a draft, then create it.",
      route: "/drafts",
      action: "Open Drafts",
      previewPath: "/drafts",
      targetHint: "Tap Create Draft",
      targetBox: { top: "24%", left: "64%", width: "28%", height: "11%" },
    },
    {
      id: "draft-build",
      stepNumber: 3,
      title: "Build your picks",
      detail: "Open your draft, choose teams, and save your draft.",
      route: "/drafts",
      action: "Open Drafts",
      previewPath: "/drafts",
      targetHint: "Tap Edit on one draft card",
      targetBox: { top: "48%", left: "67%", width: "20%", height: "11%" },
    },
    {
      id: "pools",
      stepNumber: 4,
      title: "Add draft to a pool",
      detail: "Open Pools, join or open your pool, then apply your draft.",
      route: "/pools",
      action: "Open Pools",
      previewPath: "/pools",
      targetHint: "Tap Join pool or Open details",
      targetBox: { top: "53%", left: "59%", width: "34%", height: "12%" },
    },
  ];

  if (isAuthed) return shared;

  return [
    {
      id: "login",
      stepNumber: 0,
      title: "Log in or create account",
      detail: "Use email and password to start and save your progress.",
      route: "/login",
      action: "Open Login",
      previewPath: "/login",
      targetHint: "Tap Sign in or Create account",
      targetBox: { top: "20%", left: "16%", width: "68%", height: "10%" },
    },
    ...shared,
  ];
}

function LiveScreenPreview({
  step,
  done,
  onTargetClick,
}: {
  step: GuideStep;
  done: boolean;
  onTargetClick: () => void;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 10px",
          background: "var(--surface-muted)",
          borderBottom: "1px solid var(--border-color)",
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        Live screen preview: <code>{step.previewPath}</code>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "16 / 10",
          background: "var(--surface)",
          overflow: "hidden",
        }}
      >
        <iframe
          src={step.previewPath}
          title={`Preview of ${step.previewPath}`}
          loading="lazy"
          style={{
            position: "absolute",
            inset: 0,
            width: "160%",
            height: "160%",
            transform: "scale(0.625)",
            transformOrigin: "top left",
            border: 0,
            pointerEvents: "none",
            background: "var(--surface)",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: step.targetBox.top,
            left: step.targetBox.left,
            width: step.targetBox.width,
            height: step.targetBox.height,
            borderRadius: 8,
            border: done ? "2px solid #16a34a" : "2px solid #f59e0b",
            boxShadow: done ? "0 0 0 2px rgba(22,163,74,0.22)" : "0 0 0 2px rgba(245,158,11,0.22)",
            background: done ? "rgba(22,163,74,0.14)" : "rgba(245,158,11,0.16)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <button
            type="button"
            onClick={onTargetClick}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 999,
              padding: "6px 10px",
              fontWeight: 900,
              fontSize: 12,
              background: "var(--surface)",
              cursor: "pointer",
            }}
          >
            {done ? "Done" : "Tap Target"}
          </button>
        </div>
      </div>

      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid var(--border-color)",
          fontSize: 13,
          fontWeight: 700,
          opacity: 0.9,
        }}
      >
        {step.targetHint}
      </div>
    </section>
  );
}

export default function InstructionsModal() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());

  const shouldSuppressModal = useMemo(() => {
    if (!pathname) return false;
    if (pathname.startsWith("/auth/callback")) return true;
    if (pathname.startsWith("/login/reset-password")) return true;
    if (pathname === "/reset-password") return true;
    return false;
  }, [pathname]);

  const isLandingPage = pathname === "/";
  const isPostLoginPrompt = searchParams.get("onboarding") === "1";
  const shouldForceOpen = isLandingPage || isPostLoginPrompt;

  useEffect(() => {
    let mounted = true;

    const loadAuth = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setIsAuthed(Boolean(data.user));
      setIsReady(true);
    };

    void loadAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setIsAuthed(Boolean(session?.user));
      setIsReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const timeout = window.setTimeout(() => {
      if (shouldSuppressModal) {
        setIsOpen(false);
        return;
      }

      if (!shouldForceOpen) return;
      if (readTutorialOptOut()) {
        setIsOpen(false);
        return;
      }

      setDontShowAgain(readTutorialOptOut());
      setCompletedStepIds(new Set());
      setCurrentStepIndex(0);
      setIsOpen(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isReady, shouldForceOpen, shouldSuppressModal]);

  useEffect(() => {
    if (!isOpen) return;
    const existingOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = existingOverflow;
    };
  }, [isOpen]);

  const closeGuide = useCallback(() => {
    writeTutorialOptOut(dontShowAgain);
    setIsOpen(false);
  }, [dontShowAgain]);

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
  const safeIndex = Math.min(currentStepIndex, Math.max(steps.length - 1, 0));
  const step = steps[safeIndex];
  const isFirstStep = safeIndex === 0;
  const isLastStep = safeIndex === steps.length - 1;
  const currentStepDone = completedStepIds.has(step.id);

  const progressPercent =
    steps.length <= 1 ? 100 : Math.round((safeIndex / (steps.length - 1)) * 100);

  function markCurrentStepDone() {
    setCompletedStepIds((prev) => {
      const next = new Set(prev);
      next.add(step.id);
      return next;
    });

    if (!isLastStep) {
      window.setTimeout(() => {
        setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
      }, 140);
    }
  }

  function nextStep() {
    if (!currentStepDone) return;
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
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 14,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Bracketball tutorial"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(900px, 100%)",
          maxHeight: "92vh",
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
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
            Step {step.stepNumber} of {steps[steps.length - 1]?.stepNumber ?? steps.length}: {step.title}
          </h2>
          <p style={{ margin: 0, opacity: 0.88 }}>{step.detail}</p>
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

        <LiveScreenPreview step={step} done={currentStepDone} onTargetClick={markCurrentStepDone} />

        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
          Interactive mode: tap the highlighted target in the preview to complete this step.
        </p>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
          />
          Don&apos;t show me this tutorial again
        </label>

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
              opacity: isFirstStep ? 0.6 : 1,
            }}
          >
            Back
          </button>

          <button
            type="button"
            onClick={nextStep}
            disabled={!currentStepDone}
            style={{
              minHeight: 44,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 900,
              cursor: currentStepDone ? "pointer" : "not-allowed",
              opacity: currentStepDone ? 1 : 0.6,
            }}
          >
            {isLastStep ? "Finish" : "Next"}
          </button>

          <Link
            href={step.route}
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
            {step.action}
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
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Skip
          </button>
        </div>
      </section>
    </div>
  );
}

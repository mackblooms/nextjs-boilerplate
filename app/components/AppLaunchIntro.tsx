"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type LaunchIntroPhase = "hidden" | "mark" | "wordmark" | "exit";

const LAUNCH_INTRO_MARK_MS = 1050;
const LAUNCH_INTRO_WORDMARK_MS = 1200;
const LAUNCH_INTRO_EXIT_MS = 560;

export default function AppLaunchIntro() {
  const [phase, setPhase] = useState<LaunchIntroPhase>("mark");

  useEffect(() => {
    if (phase === "hidden" || typeof window === "undefined") return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion && phase === "mark") {
      const timer = window.setTimeout(() => {
        setPhase("wordmark");
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(() => {
      if (phase === "mark") {
        setPhase("wordmark");
        return;
      }
      if (phase === "wordmark") {
        setPhase("exit");
        return;
      }
      setPhase("hidden");
    }, phase === "mark" ? LAUNCH_INTRO_MARK_MS : phase === "wordmark" ? LAUNCH_INTRO_WORDMARK_MS : LAUNCH_INTRO_EXIT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    document.body.classList.toggle("app-launch-active", phase !== "hidden");

    return () => {
      document.body.classList.remove("app-launch-active");
    };
  }, [phase]);

  if (phase === "hidden") return null;

  const showMark = phase === "mark";
  const showWordmark = phase === "wordmark" || phase === "exit";

  return (
    <div className="landing-intro-overlay" data-phase={phase} aria-hidden="true">
      <div className="landing-intro-stage">
        <Image
          src="/bracketball-logo-mark.png"
          alt=""
          width={120}
          height={120}
          className="landing-intro-mark"
          data-visible={showMark}
          priority
        />
        <span className="landing-intro-wordmark" data-visible={showWordmark}>
          bracketball
        </span>
      </div>
    </div>
  );
}

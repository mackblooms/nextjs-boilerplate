"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

type LaunchIntroPhase = "hidden" | "mark" | "wordmark" | "exit";

const LAUNCH_INTRO_MARK_MS = 1050;
const LAUNCH_INTRO_WORDMARK_MS = 1200;
const LAUNCH_INTRO_EXIT_MS = 560;

export default function AppLaunchIntro() {
  const [phase, setPhase] = useState<LaunchIntroPhase>("mark");
  const wasBackgroundedRef = useRef(false);

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let removeNativeListener: (() => void) | undefined;

    const restartIntro = () => {
      if (!wasBackgroundedRef.current) return;
      wasBackgroundedRef.current = false;
      setPhase("mark");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasBackgroundedRef.current = true;
        return;
      }

      if (document.visibilityState === "visible") restartIntro();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const setupNativeListener = async () => {
      if (!Capacitor.isNativePlatform()) return;

      const listener = await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (!isActive) {
          wasBackgroundedRef.current = true;
          return;
        }

        restartIntro();
      });

      removeNativeListener = () => {
        void listener.remove();
      };
    };

    void setupNativeListener();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      removeNativeListener?.();
    };
  }, []);

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

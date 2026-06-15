"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

const HAPTIC_TARGET_SELECTOR = [
  "button",
  '[role="button"]',
  "a.ui-btn",
  "[data-haptic='tap']",
].join(",");

const HAPTIC_OPT_OUT_SELECTOR = "[data-haptic='off']";
const VIBRATION_FALLBACK_MS = 10;

function canReceiveHaptics(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.closest(HAPTIC_OPT_OUT_SELECTOR)) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;

  if (element instanceof HTMLButtonElement) return !element.disabled;
  if (element instanceof HTMLAnchorElement) return Boolean(element.href);

  return true;
}

function vibrateFallback() {
  if (!("vibrate" in navigator)) return;
  navigator.vibrate(VIBRATION_FALLBACK_MS);
}

function triggerLightHaptic() {
  if (!Capacitor.isNativePlatform()) {
    vibrateFallback();
    return;
  }

  void Haptics.impact({ style: ImpactStyle.Light }).catch(vibrateFallback);
}

export default function AppHaptics() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const hapticTarget = target.closest(HAPTIC_TARGET_SELECTOR);
      if (!hapticTarget || !canReceiveHaptics(hapticTarget)) return;

      triggerLightHaptic();
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  return null;
}

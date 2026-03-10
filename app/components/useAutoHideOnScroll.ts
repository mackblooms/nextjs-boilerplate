"use client";

import { useEffect, useRef, useState } from "react";

type AutoHideOptions = {
  scrollDelta?: number;
  showAtTop?: number;
  hideAfter?: number;
};

export function useAutoHideOnScroll({
  scrollDelta = 8,
  showAtTop = 64,
  hideAfter = 120,
}: AutoHideOptions = {}) {
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      const lastY = lastScrollYRef.current;
      const diff = currentY - lastY;

      if (currentY <= showAtTop) {
        setIsHidden(false);
        lastScrollYRef.current = currentY;
        return;
      }

      if (currentY > hideAfter && diff > scrollDelta) {
        setIsHidden(true);
      } else if (diff < -scrollDelta) {
        setIsHidden(false);
      }

      lastScrollYRef.current = currentY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hideAfter, scrollDelta, showAtTop]);

  return isHidden;
}

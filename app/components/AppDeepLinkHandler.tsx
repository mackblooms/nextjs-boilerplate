"use client";

import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "next/navigation";
import { setStoredActivePoolId } from "@/lib/activePool";
import { resolveDeepLinkPath } from "@/lib/deepLinks";

function getPoolIdFromPath(path: string): string | null {
  const match = path.match(/^\/pool\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default function AppDeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    let removeListener: (() => void) | null = null;
    let lastHandledPath: string | null = null;

    const navigateToDeepLink = (url: string) => {
      const nextPath = resolveDeepLinkPath(url);
      if (!nextPath) return;
      if (nextPath === lastHandledPath) return;
      lastHandledPath = nextPath;

      const poolId = getPoolIdFromPath(nextPath);
      if (poolId) setStoredActivePoolId(poolId);

      // Router navigation is preferred, but a hard redirect keeps the app from
      // getting stranded on the custom scheme if startup timing is awkward.
      router.push(nextPath);
      window.setTimeout(() => {
        if (window.location.pathname !== nextPath) {
          window.location.replace(nextPath);
        }
      }, 120);
    };

    const setup = async () => {
      if (!Capacitor.isNativePlatform()) return;

      const listener = await CapacitorApp.addListener("appUrlOpen", ({ url }) => {
        navigateToDeepLink(url);
      });
      removeListener = () => {
        void listener.remove();
      };

      const launch = await CapacitorApp.getLaunchUrl().catch(() => null);
      if (launch?.url) navigateToDeepLink(launch.url);
    };

    void setup();

    return () => {
      removeListener?.();
    };
  }, [router]);

  return null;
}

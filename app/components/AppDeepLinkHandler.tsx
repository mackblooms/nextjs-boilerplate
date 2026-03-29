"use client";

import { useEffect } from "react";
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

    const navigateToDeepLink = (url: string) => {
      const nextPath = resolveDeepLinkPath(url);
      if (!nextPath) return;

      const poolId = getPoolIdFromPath(nextPath);
      if (poolId) setStoredActivePoolId(poolId);
      router.push(nextPath);
    };

    const setup = async () => {
      if (typeof window === "undefined") return;

      const capacitor = (window as Window & {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          Plugins?: {
            App?: {
              addListener?: (
                eventName: string,
                listenerFunc: (event: { url: string }) => void,
              ) => Promise<{ remove: () => Promise<void> } | { remove: () => void }>;
              getLaunchUrl?: () => Promise<{ url?: string | null }>;
            };
          };
        };
      }).Capacitor;

      if (!capacitor?.isNativePlatform?.()) return;

      const appPlugin = capacitor.Plugins?.App;
      if (!appPlugin?.addListener) return;

      const listener = await appPlugin.addListener("appUrlOpen", ({ url }) => {
        navigateToDeepLink(url);
      });

      removeListener = () => {
        const result = listener.remove();
        if (result && typeof (result as Promise<void>).then === "function") {
          void result;
        }
      };

      if (appPlugin.getLaunchUrl) {
        const launch = await appPlugin.getLaunchUrl().catch(() => null);
        if (launch?.url) navigateToDeepLink(launch.url);
      }
    };

    void setup();

    return () => {
      removeListener?.();
    };
  }, [router]);

  return null;
}

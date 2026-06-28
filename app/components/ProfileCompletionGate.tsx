"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  isProfileComplete,
  PROFILE_COMPLETION_COLUMNS,
  type ProfileCompletionRow,
} from "../../lib/profileCompletion";

type GateStatus = "checking" | "allowed" | "blocked";

const PROFILE_COMPLETED_EVENT = "bb:profile-completed";

function getProfileRedirect(pathname: string, queryString: string) {
  const currentQuery = queryString;
  const currentPath = `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
  const params = new URLSearchParams({ onboarding: "1" });

  if (currentPath !== "/") {
    params.set("next", currentPath);
  }

  return `/profile?${params.toString()}`;
}

export function notifyProfileCompleted() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PROFILE_COMPLETED_EVENT));
}

export default function ProfileCompletionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<GateStatus>("checking");
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const hasCheckedRef = useRef(false);

  const isProfileRoute = pathname === "/profile";
  const isHomeRoute = pathname === "/";
  const queryString = searchParams.toString();
  const redirectTarget = useMemo(
    () => getProfileRedirect(pathname, queryString),
    [pathname, queryString],
  );
  const effectiveStatus: GateStatus =
    !isProfileRoute && !isHomeRoute && profileComplete === false ? "blocked" : status;

  useEffect(() => {
    let canceled = false;

    async function checkProfile(showChecking = false) {
      if (showChecking && !hasCheckedRef.current) {
        setStatus("checking");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (canceled) return;
      hasCheckedRef.current = true;

      const userId = sessionData.session?.user.id;
      if (!userId) {
        setProfileComplete(null);
        setStatus("allowed");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_COMPLETION_COLUMNS.join(","))
        .eq("user_id", userId)
        .maybeSingle();

      if (canceled) return;

      if (error) {
        setProfileComplete(false);
        setStatus(isProfileRoute || isHomeRoute ? "allowed" : "blocked");
        return;
      }

      const complete = isProfileComplete((data as ProfileCompletionRow | null) ?? null);
      setProfileComplete(complete);

      if (complete) {
        setStatus("allowed");
        return;
      }

      setStatus(isProfileRoute || isHomeRoute ? "allowed" : "blocked");
    }

    void checkProfile(true);

    const { data: authSubscription } = supabase.auth.onAuthStateChange(() => {
      void checkProfile();
    });

    const onProfileCompleted = () => {
      setProfileComplete(true);
      setStatus("allowed");
    };
    window.addEventListener(PROFILE_COMPLETED_EVENT, onProfileCompleted);

    return () => {
      canceled = true;
      authSubscription.subscription.unsubscribe();
      window.removeEventListener(PROFILE_COMPLETED_EVENT, onProfileCompleted);
    };
  }, [isHomeRoute, isProfileRoute, pathname, queryString]);

  useEffect(() => {
    if (effectiveStatus !== "blocked" || isProfileRoute) return;
    router.replace(redirectTarget);
  }, [effectiveStatus, isProfileRoute, redirectTarget, router]);

  if (effectiveStatus === "checking" || (effectiveStatus === "blocked" && !isProfileRoute)) {
    return (
      <main className="page-shell page-shell--stack" style={{ maxWidth: 620 }}>
        <section className="page-surface" style={{ padding: 16, display: "grid", gap: 8 }}>
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
            Checking your profile
          </h1>
          <p className="page-subtitle" style={{ maxWidth: 520 }}>
            Before you jump in, we need your account details saved.
          </p>
        </section>
      </main>
    );
  }

  return <>{children}</>;
}

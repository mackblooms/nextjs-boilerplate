"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ACTIVE_POOL_CHANGED_EVENT,
  getStoredActivePoolId,
  setStoredActivePoolId,
} from "../../lib/activePool";
import { withAvatarFallback } from "../../lib/avatar";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

type Pool = { id: string; name: string; created_by: string };
type Theme = "light" | "dark";

const COMPACT_NAV_QUERY = "(max-width: 780px)";
const DOCK_HOLD_DELAY_MS = 130;

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M3 10.5 12 3l9 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 9.8V20h13V9.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.6 20v-5.5h4.8V20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChecklistIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m7.4 9.1 1.5 1.7 2.5-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.8 8.7h3.8M12.8 12.3h3.8M7.4 15.1l1.5 1.7 2.5-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GroupIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="9" cy="9" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.2" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.8 18.4c.5-2.7 2.7-4.4 5.4-4.4s4.9 1.7 5.4 4.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14.2 18.4c.4-1.9 2-3.2 4-3.2.5 0 1 0 1.5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BracketIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M3.8 4.5h5.2v6.1h5.9v2.8H9v6.1H3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.2 4.5H15v6.1H9.1v2.8H15v6.1h5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PodiumIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M3.5 19.8h17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="9.3" y="9" width="5.4" height="10.8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.8" y="12.3" width="4.1" height="7.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.1" y="13.6" width="4.1" height="6.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.8 7.2h2.4M5 10.6h1.6M17.3 12h1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function AppTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [homeHref, setHomeHref] = useState("/");
  const [activePoolId, setActivePoolId] = useState<string | null>(null);
  const [activePool, setActivePool] = useState<Pool | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const [isCompact, setIsCompact] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [dockExpanded, setDockExpanded] = useState(false);
  const [scrubActive, setScrubActive] = useState(false);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const isAutoHidden = useAutoHideOnScroll({
    scrollDelta: isCompact ? 11 : 14,
    showAtTop: 72,
    hideAfter: isCompact ? 110 : 146,
  });

  const holdTimerRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const activePointerTypeRef = useRef<string | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);
  const drawerPanelRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);

  const poolIdFromPath = useMemo(() => {
    const match = pathname.match(/^\/pool\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  useEffect(() => {
    let canceled = false;

    const resetNav = () => {
      if (canceled) return;
      setUserId(null);
      setHomeHref("/");
      setActivePoolId(null);
      setActivePool(null);
      setProfileAvatarUrl(null);
    };

    const syncAuth = async () => {
      if (!supabase) {
        resetNav();
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        resetNav();
        return;
      }

      if (canceled) return;
      setUserId(user.id);
      setHomeHref("/");
    };

    void syncAuth();

    if (!supabase) {
      return () => {
        canceled = true;
      };
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        resetNav();
        return;
      }

      if (canceled) return;
      setUserId(session.user.id);
      setHomeHref("/");
    });

    return () => {
      canceled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_NAV_QUERY);
    const syncCompact = () => setIsCompact(media.matches);
    syncCompact();

    const onChange = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    let canceled = false;

    const loadAvatar = async () => {
      if (!supabase || !userId) {
        if (!canceled) setProfileAvatarUrl(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", userId)
        .maybeSingle();

      if (canceled) return;

      if (error) {
        setProfileAvatarUrl(withAvatarFallback(userId, null));
        return;
      }

      const row = (data as { avatar_url: string | null } | null) ?? null;
      setProfileAvatarUrl(withAvatarFallback(userId, row?.avatar_url ?? null));
    };

    void loadAvatar();

    return () => {
      canceled = true;
    };
  }, [supabase, userId]);

  useEffect(() => {
    let canceled = false;

    const loadPoolContext = async () => {
      if (!supabase || !userId) {
        if (!canceled) {
          setActivePoolId(null);
          setActivePool(null);
        }
        return;
      }

      const { data: memberships } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true });

      if (canceled) return;

      const membershipPoolIds = (memberships ?? []).map((m) => m.pool_id);
      const storedPoolId = getStoredActivePoolId();
      const selectedPoolId =
        poolIdFromPath ??
        (storedPoolId && membershipPoolIds.includes(storedPoolId) ? storedPoolId : null) ??
        membershipPoolIds[0] ??
        null;

      setActivePoolId(selectedPoolId);
      setStoredActivePoolId(selectedPoolId);

      if (!selectedPoolId) {
        setActivePool(null);
        return;
      }

      const { data: poolData } = await supabase
        .from("pools")
        .select("id,name,created_by")
        .eq("id", selectedPoolId)
        .single();

      if (canceled) return;
      setActivePool(poolData ?? null);
    };

    void loadPoolContext();

    return () => {
      canceled = true;
    };
  }, [poolIdFromPath, supabase, userId]);

  useEffect(() => {
    if (poolIdFromPath || !supabase || !userId) return;

    let canceled = false;

    const onActivePoolChanged = async (event: Event) => {
      const customEvent = event as CustomEvent<{ poolId?: string | null }>;
      const nextPoolId = customEvent.detail?.poolId?.trim() ?? null;

      if (canceled) return;
      setActivePoolId(nextPoolId);

      if (!nextPoolId) {
        setActivePool(null);
        return;
      }

      const { data: poolData } = await supabase
        .from("pools")
        .select("id,name,created_by")
        .eq("id", nextPoolId)
        .single();

      if (canceled) return;
      setActivePool(poolData ?? null);
    };

    window.addEventListener(ACTIVE_POOL_CHANGED_EVENT, onActivePoolChanged as EventListener);

    return () => {
      canceled = true;
      window.removeEventListener(ACTIVE_POOL_CHANGED_EVENT, onActivePoolChanged as EventListener);
    };
  }, [poolIdFromPath, supabase, userId]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDrawerOpen(false);
      setHelpOpen(false);
      setDockExpanded(false);
      setScrubActive(false);
      setScrubIndex(null);
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!drawerOpen) return;
      if (!drawerPanelRef.current) return;
      if (drawerPanelRef.current.contains(event.target as Node)) return;
      setDrawerOpen(false);
    };

    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!userId) return;

    document.body.classList.add("has-app-shell");
    return () => {
      document.body.classList.remove("has-app-shell");
    };
  }, [userId]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, []);

  function clearHoldTimer() {
    if (!holdTimerRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }

  function pickDockIndex(clientX: number) {
    if (!dockRef.current) return null;

    const rect = dockRef.current.getBoundingClientRect();
    if (!rect.width) return null;

    const relativeX = clamp(clientX - rect.left, 0, rect.width - 0.001);
    const rawIndex = Math.floor((relativeX / rect.width) * 5);
    return clamp(rawIndex, 0, 4);
  }

  function navigateDockItem(index: number | null, dockItems: { href: string }[]) {
    if (index === null) return;

    const selectedItem = dockItems[index];
    if (!selectedItem) return;
    if (selectedItem.href === pathname) return;

    router.push(selectedItem.href);
  }

  async function signOut() {
    setUserId(null);
    setActivePoolId(null);
    setActivePool(null);
    setProfileAvatarUrl(null);
    setDrawerOpen(false);
    setHelpOpen(false);
    setStoredActivePoolId(null);

    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Keep redirect behavior even if revoke request fails.
      }
    }

    router.replace("/");
    router.refresh();
  }

  function openHowItWorksModal() {
    setDrawerOpen(false);
    setHelpOpen(false);
    window.dispatchEvent(new CustomEvent("bb:open-how-it-works"));
  }

  if (!userId) return null;

  const resolvedAvatarUrl = withAvatarFallback(userId, profileAvatarUrl);
  const activePoolPathId = poolIdFromPath ?? activePoolId;
  const activePoolBasePath = activePoolPathId ? `/pool/${activePoolPathId}` : null;

  const isHomeActive = pathname === "/";
  const isDraftsActive = pathname === "/drafts" || pathname.startsWith("/drafts/");
  const isPoolsActive = pathname === "/pools" || pathname.startsWith("/pools/");
  const isLeaderboardActive = activePoolBasePath
    ? pathname === `${activePoolBasePath}/leaderboard` ||
      pathname.startsWith(`${activePoolBasePath}/leaderboard/`)
    : false;
  const isAdminActive = activePoolBasePath
    ? pathname === `${activePoolBasePath}/admin` ||
      pathname.startsWith(`${activePoolBasePath}/admin/`)
    : false;
  const isBracketActive = activePoolBasePath
    ? (pathname === activePoolBasePath || pathname.startsWith(`${activePoolBasePath}/`)) &&
      !isLeaderboardActive &&
      !isAdminActive
    : false;

  const dockItems = [
    { key: "home", label: "Home", href: homeHref, isActive: isHomeActive, Icon: HomeIcon },
    {
      key: "drafts",
      label: "Drafts",
      href: "/drafts",
      isActive: isDraftsActive,
      Icon: ChecklistIcon,
    },
    { key: "pools", label: "Pools", href: "/pools", isActive: isPoolsActive, Icon: GroupIcon },
    {
      key: "bracket",
      label: "Bracket",
      href: activePoolBasePath ? `${activePoolBasePath}/bracket` : "/pools",
      isActive: isBracketActive,
      Icon: BracketIcon,
    },
    {
      key: "leaderboard",
      label: "Leaderboard",
      href: activePoolBasePath ? `${activePoolBasePath}/leaderboard` : "/pools",
      isActive: isLeaderboardActive,
      Icon: PodiumIcon,
    },
  ];

  const settledActiveIndex = Math.max(0, dockItems.findIndex((item) => item.isActive));
  const emphasizedIndex = scrubActive && scrubIndex !== null ? scrubIndex : settledActiveIndex;
  const isChromeHidden = isAutoHidden && !drawerOpen && !helpOpen && !dockExpanded && !scrubActive;

  function handleDockPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;

    activePointerIdRef.current = event.pointerId;
    activePointerTypeRef.current = event.pointerType;
    event.currentTarget.setPointerCapture(event.pointerId);

    const pointerIndex = pickDockIndex(event.clientX);
    setScrubIndex(pointerIndex);

    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      setDockExpanded(true);
      setScrubActive(true);
    }, DOCK_HOLD_DELAY_MS);
  }

  function handleDockPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (!scrubActive) return;

    const pointerIndex = pickDockIndex(event.clientX);
    setScrubIndex(pointerIndex);
  }

  function stopScrub(pointerId: number, shouldNavigate: boolean) {
    if (activePointerIdRef.current !== pointerId) return;

    clearHoldTimer();

    const shouldNavigateFromClick =
      shouldNavigate && !scrubActive && activePointerTypeRef.current === "mouse";

    if ((scrubActive && shouldNavigate) || shouldNavigateFromClick) {
      suppressClickRef.current = true;
      navigateDockItem(scrubIndex, dockItems);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 220);
    }

    setDockExpanded(false);
    setScrubActive(false);
    setScrubIndex(null);
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;
  }

  const topBarButtonStyle: CSSProperties = {
    width: isCompact ? 40 : 44,
    height: isCompact ? 40 : 44,
    borderRadius: 9999,
    border: "1px solid var(--border-color)",
    background: "var(--surface)",
    boxShadow: "var(--top-nav-pill-shadow, var(--shadow-sm))",
    display: "grid",
    placeItems: "center",
    padding: 0,
    color: "var(--foreground)",
    cursor: "pointer",
    textDecoration: "none",
    transform: "var(--top-nav-pill-transform, translateY(0) scale(1))",
    transition:
      "transform 140ms ease, box-shadow 160ms ease, border-color 140ms ease, background-color 140ms ease, color 140ms ease",
  };

  const drawerActionStyle: CSSProperties = {
    width: "100%",
    border: "1px solid var(--border-color)",
    borderRadius: 12,
    background: "var(--surface)",
    color: "var(--foreground)",
    padding: "11px 12px",
    textAlign: "left",
    textDecoration: "none",
    fontWeight: 800,
    letterSpacing: "0.01em",
    cursor: "pointer",
  };

  return (
    <>
      <header
        aria-label="App top navigation"
        style={{
          position: "fixed",
          top: "max(10px, env(safe-area-inset-top))",
          left: 0,
          right: 0,
          zIndex: 1200,
          paddingInline: isCompact ? 10 : 18,
          pointerEvents: "none",
          transform: isChromeHidden ? "translateY(calc(-100% - 14px))" : "translateY(0)",
          opacity: isChromeHidden ? 0.12 : 1,
          transition:
            "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
        }}
      >
        <div
          className="page-surface"
          style={{
            maxWidth: 980,
            margin: "0 auto",
            minHeight: isCompact ? 58 : 64,
            borderRadius: 18,
            padding: isCompact ? "8px 10px" : "9px 12px",
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 8,
            pointerEvents: "auto",
            backdropFilter: "blur(12px) saturate(130%)",
          }}
        >
          <button
            className="app-top-nav-pill"
            type="button"
            aria-label="Open app menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
            style={topBarButtonStyle}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}>
              <path
                d="M5 7.2h14M5 12h14M5 16.8h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <Link
            href={homeHref}
            aria-label="Go to bracketball home"
            style={{
              justifySelf: "center",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 120,
              minHeight: isCompact ? 40 : 44,
              paddingInline: 10,
            }}
          >
            <img
              src="/bracketball-logo-mark.png"
              alt="bracketball logo"
              style={{
                width: isCompact ? 102 : 114,
                height: "auto",
                objectFit: "contain",
                filter: "var(--logo-filter)",
              }}
            />
          </Link>

          <Link
            className="app-top-nav-pill"
            href="/profile"
            aria-label="Open profile"
            style={topBarButtonStyle}
          >
            <img
              src={resolvedAvatarUrl}
              alt="Profile"
              width={isCompact ? 40 : 44}
              height={isCompact ? 40 : 44}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
            />
          </Link>
        </div>
      </header>

      <div
        ref={dockRef}
        role="tablist"
        aria-label="Main navigation"
        onPointerDown={handleDockPointerDown}
        onPointerMove={handleDockPointerMove}
        onPointerUp={(event) => stopScrub(event.pointerId, true)}
        onPointerCancel={(event) => stopScrub(event.pointerId, false)}
        style={{
          position: "fixed",
          left: "max(10px, env(safe-area-inset-left))",
          right: "max(10px, env(safe-area-inset-right))",
          bottom: "max(10px, env(safe-area-inset-bottom))",
          zIndex: 1250,
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: isCompact ? 4 : 6,
          maxWidth: 720,
          marginInline: "auto",
          border: "1px solid var(--border-color)",
          borderRadius: 999,
          padding: isCompact ? "7px 8px" : "8px 9px",
          background: "var(--surface-glass)",
          boxShadow: dockExpanded ? "var(--shadow-lg)" : "var(--shadow-md)",
          backdropFilter: "blur(14px) saturate(145%)",
          transform: `translateY(${isChromeHidden ? 108 : 0}%) scale(${dockExpanded ? 1.04 : 1})`,
          opacity: isChromeHidden ? 0.08 : 1,
          transition:
            "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease, box-shadow 180ms ease",
          touchAction: "none",
          userSelect: "none",
          pointerEvents: isChromeHidden ? "none" : "auto",
        }}
      >
        {dockItems.map((item, index) => {
          const distanceFromEmphasis = Math.abs(index - emphasizedIndex);
          const shouldMagnify = scrubActive || dockExpanded;
          const scale = !shouldMagnify
            ? item.isActive
              ? 1.06
              : 1
            : distanceFromEmphasis === 0
              ? 1.22
              : distanceFromEmphasis === 1
                ? 1.1
                : 0.98;

          const isCurrent = scrubActive ? index === emphasizedIndex : item.isActive;

          return (
            <button
              className="app-dock-pill"
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              aria-current={item.isActive ? "page" : undefined}
              onClick={(event) => {
                if (suppressClickRef.current || scrubActive) {
                  event.preventDefault();
                  return;
                }

                navigateDockItem(index, dockItems);
              }}
              style={{
                border: "none",
                borderRadius: 999,
                padding: isCompact ? "8px 4px 7px" : "9px 6px 8px",
                minHeight: isCompact ? 58 : 62,
                background: isCurrent ? "var(--surface)" : "transparent",
                boxShadow: `var(--dock-pill-hover-shadow, ${isCurrent ? "var(--shadow-sm)" : "none"})`,
                color: isCurrent ? "var(--focus-ring)" : "var(--foreground)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                gap: 3,
                transform: `translateY(${isCurrent ? -4 : 0}px) scale(calc(${scale} * var(--dock-pill-hover-scale, 1)))`,
                transition:
                  "transform 130ms ease, color 120ms ease, background-color 120ms ease, box-shadow 130ms ease",
              }}
            >
              <item.Icon className="app-shell-dock-icon" />
              <span
                style={{
                  fontSize: isCompact ? 10 : 11,
                  fontWeight: 800,
                  letterSpacing: "0.02em",
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {drawerOpen ? (
        <div
          role="presentation"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1300,
            background: "rgba(4, 10, 22, 0.44)",
            backdropFilter: "blur(2px)",
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <aside
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="App menu"
            onClick={(event) => event.stopPropagation()}
            className="page-surface"
            style={{
              width: "min(360px, calc(100vw - 26px))",
              minHeight: "100%",
              borderRadius: 0,
              borderTop: "none",
              borderBottom: "none",
              borderLeft: "none",
              padding: "16px 14px max(24px, env(safe-area-inset-bottom))",
              display: "grid",
              gap: 14,
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ display: "grid", gap: 3 }}>
                <strong style={{ fontSize: 18, letterSpacing: "0.02em" }}>Menu</strong>
                <span style={{ fontSize: 12, opacity: 0.74 }}>
                  {activePool
                    ? `active pool: ${activePool.name}`
                    : "select a pool to unlock bracket + leaderboard"}
                </span>
              </div>
              <button
                className="app-top-nav-pill"
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                style={{
                  ...topBarButtonStyle,
                  width: 34,
                  height: 34,
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16 }}>
                  <path
                    d="m6.7 6.7 10.6 10.6M17.3 6.7 6.7 17.3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <section style={{ display: "grid", gap: 8 }} aria-label="Primary navigation">
              <h2 style={{ margin: 0, fontSize: 13, letterSpacing: "0.04em", opacity: 0.72 }}>
                Navigate
              </h2>
              <Link href={homeHref} onClick={() => setDrawerOpen(false)} style={drawerActionStyle}>
                Home
              </Link>
              <Link href="/drafts" onClick={() => setDrawerOpen(false)} style={drawerActionStyle}>
                Drafts
              </Link>
              <Link href="/pools" onClick={() => setDrawerOpen(false)} style={drawerActionStyle}>
                Pools
              </Link>
              <Link
                href={activePoolBasePath ? `${activePoolBasePath}/bracket` : "/pools"}
                onClick={() => setDrawerOpen(false)}
                style={drawerActionStyle}
              >
                Bracket
              </Link>
              <Link
                href={activePoolBasePath ? `${activePoolBasePath}/leaderboard` : "/pools"}
                onClick={() => setDrawerOpen(false)}
                style={drawerActionStyle}
              >
                Leaderboard
              </Link>
              {activePoolId && activePool?.created_by === userId ? (
                <Link
                  href={`/pool/${activePoolId}/admin`}
                  onClick={() => setDrawerOpen(false)}
                  style={drawerActionStyle}
                >
                  Admin
                </Link>
              ) : null}
            </section>

            <section style={{ display: "grid", gap: 8 }} aria-label="Account options">
              <h2 style={{ margin: 0, fontSize: 13, letterSpacing: "0.04em", opacity: 0.72 }}>
                Account
              </h2>
              <Link href="/profile" onClick={() => setDrawerOpen(false)} style={drawerActionStyle}>
                Profile
              </Link>
              <button type="button" onClick={signOut} style={drawerActionStyle}>
                Log out
              </button>
            </section>

            <section style={{ display: "grid", gap: 8 }} aria-label="Help and support">
              <h2 style={{ margin: 0, fontSize: 13, letterSpacing: "0.04em", opacity: 0.72 }}>
                Support
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setHelpOpen(true);
                }}
                style={drawerActionStyle}
              >
                Help Center
              </button>
              <button type="button" onClick={openHowItWorksModal} style={drawerActionStyle}>
                How it works
              </button>
              <a href="mailto:mack@bracketball.io" style={drawerActionStyle}>
                Contact support
              </a>
            </section>

            <section style={{ display: "grid", gap: 8 }} aria-label="Legal links">
              <h2 style={{ margin: 0, fontSize: 13, letterSpacing: "0.04em", opacity: 0.72 }}>
                Legal
              </h2>
              <Link href="/terms" onClick={() => setDrawerOpen(false)} style={drawerActionStyle}>
                Terms of service
              </Link>
              <Link href="/privacy" onClick={() => setDrawerOpen(false)} style={drawerActionStyle}>
                Privacy policy
              </Link>
            </section>

            <section
              aria-label="Theme toggle"
              style={{
                marginTop: "auto",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                background: "var(--surface)",
                padding: "11px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <strong style={{ fontSize: 13, letterSpacing: "0.03em" }}>Dark mode</strong>
                <span style={{ fontSize: 12, opacity: 0.74 }}>
                  Toggle app appearance
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                role="switch"
                aria-checked={theme === "dark"}
                style={{
                  width: 64,
                  height: 34,
                  borderRadius: 9999,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                  cursor: "pointer",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: theme === "dark" ? 33 : 3,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    border: "1px solid var(--border-color)",
                    background: "var(--surface-elevated)",
                    transition: "left 150ms ease",
                  }}
                />
              </button>
            </section>
          </aside>
        </div>
      ) : null}

      {helpOpen ? (
        <div
          role="presentation"
          onClick={() => setHelpOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.56)",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Help"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              border: "1px solid var(--border-color)",
              borderRadius: 14,
              background: "var(--surface)",
              padding: 16,
              display: "grid",
              gap: 12,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Help & Support</h2>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  padding: "6px 9px",
                  background: "transparent",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>

            <p style={{ margin: 0, lineHeight: 1.5, opacity: 0.9 }}>
              For now, please send all questions, bug reports, and support requests to{" "}
              <a href="mailto:mack@bracketball.io" style={{ fontWeight: 800, color: "var(--foreground)" }}>
                mack@bracketball.io
              </a>
              . Including your pool name, device, and a screenshot helps us resolve issues faster.
            </p>

            <p style={{ margin: 0, lineHeight: 1.5, opacity: 0.82 }}>
              A full help center with FAQs and troubleshooting guides is on the roadmap.
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}

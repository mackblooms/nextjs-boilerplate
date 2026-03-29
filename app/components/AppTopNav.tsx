"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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

function getPageTitle(pathname: string, activePoolName: string | null) {
  if (pathname === "/") return "Home";
  if (pathname === "/drafts") return "My Drafts";
  if (pathname.startsWith("/drafts/")) return "Draft Editor";
  if (pathname === "/pools") return "Pools";
  if (pathname === "/pools/new") return "Create Pool";
  if (pathname === "/profile") return "Profile";
  if (pathname.startsWith("/login")) return "Login";
  if (pathname.startsWith("/pool/") && pathname.endsWith("/leaderboard")) return "Leaderboard";
  if (pathname.startsWith("/pool/") && pathname.endsWith("/admin")) return "Pool Admin";
  if (pathname.startsWith("/pool/") && pathname.endsWith("/draft")) return "Pool Draft";
  if (pathname.startsWith("/pool/") && pathname.includes("/picks/")) return "Entry Picks";
  if (pathname.startsWith("/pool/") && pathname.includes("/bracket")) return "Bracket";
  if (pathname.startsWith("/pool/")) return activePoolName ?? "Pool";
  if (pathname === "/terms") return "Terms";
  if (pathname === "/privacy") return "Privacy";
  return "bracketball";
}

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

export default function AppTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [homeHref, setHomeHref] = useState("/");
  const [activePoolId, setActivePoolId] = useState<string | null>(null);
  const [activePool, setActivePool] = useState<Pool | null>(null);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [homeButtonHovered, setHomeButtonHovered] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const [isCompact, setIsCompact] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isHidden = useAutoHideOnScroll();
  const isDark = theme === "dark";

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
      setIsSiteAdmin(false);
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
    let canceled = false;

    const loadAdminStatus = async () => {
      if (!supabase || !userId) {
        if (!canceled) setIsSiteAdmin(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        if (!canceled) setIsSiteAdmin(false);
        return;
      }

      const res = await fetch("/api/admin/me", {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      }).catch(() => null);

      if (canceled || !res?.ok) {
        if (!canceled) setIsSiteAdmin(false);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as { isSiteAdmin?: boolean };
      if (!canceled) {
        setIsSiteAdmin(Boolean(json.isSiteAdmin));
      }
    };

    void loadAdminStatus();

    return () => {
      canceled = true;
    };
  }, [supabase, userId]);

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
    if (!menuOpen && !settingsOpen && !helpOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuOpen) return;
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSettingsOpen(false);
        setHelpOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [helpOpen, menuOpen, settingsOpen]);

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
    const onHomeButtonHover = (event: Event) => {
      const customEvent = event as CustomEvent<{ hovered?: boolean }>;
      setHomeButtonHovered(Boolean(customEvent.detail?.hovered));
    };

    window.addEventListener("bb:home-button-hover", onHomeButtonHover as EventListener);
    return () => {
      window.removeEventListener("bb:home-button-hover", onHomeButtonHover as EventListener);
    };
  }, []);

  async function signOut() {
    // Hide authed nav immediately, then clear auth/session.
    setUserId(null);
    setActivePoolId(null);
    setActivePool(null);
    setProfileAvatarUrl(null);
    setIsSiteAdmin(false);
    setMenuOpen(false);
    setSettingsOpen(false);
    setHelpOpen(false);

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

  if (!userId) return null;

  const avatarSize = isCompact ? 38 : 42;
  const pillStyle: CSSProperties = {
    padding: isCompact ? "8px 10px" : "8px 12px",
    border: "none",
    borderRadius: 9999,
    textDecoration: "none",
    color: "var(--foreground)",
    fontWeight: 800,
    fontSize: isCompact ? 12 : 13,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    background: "var(--surface)",
    minHeight: isCompact ? 36 : 38,
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
  };
  const resolvedAvatarUrl = withAvatarFallback(userId, profileAvatarUrl);
  const shouldDeemphasizeNavPills = homeButtonHovered || menuOpen;
  const activePoolPathId = poolIdFromPath ?? activePoolId;
  const activePoolBasePath = activePoolPathId ? `/pool/${activePoolPathId}` : null;
  const pageTitle = getPageTitle(pathname, activePool?.name ?? null);

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

  const getNavPillStyle = (isActive: boolean): CSSProperties => {
    if (!isActive) return pillStyle;

    return {
      ...pillStyle,
      background: "var(--surface-elevated)",
      boxShadow: "var(--shadow-sm)",
      color: "var(--focus-ring)",
      fontWeight: 900,
    };
  };

  const mobileNavItems: Array<
    | { kind: "link"; href: string; label: string; active: boolean }
    | { kind: "button"; label: string; active: boolean; onClick: () => void }
  > = [
    { kind: "link", href: homeHref, label: "home", active: isHomeActive },
    { kind: "link", href: "/drafts", label: "drafts", active: isDraftsActive },
    { kind: "link", href: "/pools", label: "pools", active: isPoolsActive },
    ...(activePoolId
      ? [
          {
            kind: "link" as const,
            href: `/pool/${activePoolId}/bracket`,
            label: "bracket",
            active: isBracketActive,
          },
          {
            kind: "link" as const,
            href: `/pool/${activePoolId}/leaderboard`,
            label: "leaderboard",
            active: isLeaderboardActive,
          },
        ]
      : []),
    { kind: "link", href: "/profile", label: "profile", active: pathname === "/profile" },
    ...(activePoolId && isSiteAdmin
      ? [
          {
            kind: "link" as const,
            href: `/pool/${activePoolId}/admin`,
            label: "admin",
            active: isAdminActive,
          },
        ]
      : []),
    {
      kind: "button",
      label: "how it works",
      active: false,
      onClick: openHowItWorksModal,
    },
  ];

  function openHowItWorksModal() {
    setMenuOpen(false);
    setSettingsOpen(false);
    setHelpOpen(false);
    window.dispatchEvent(new CustomEvent("bb:open-how-it-works"));
  }

  return (
    <>
      {isCompact ? (
        <>
          <div
            className="app-mobile-topbar"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1100,
              padding: `calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px`,
              pointerEvents: "none",
              transform: isHidden ? "translateY(-140%)" : "translateY(0)",
              opacity: isHidden ? 0 : 1,
              transition: "transform 180ms ease, opacity 180ms ease",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 12,
                alignItems: "center",
                padding: "10px 12px",
                background: "var(--surface-glass)",
                border: "1px solid var(--border-color)",
                borderRadius: 18,
                boxShadow: "var(--shadow-sm)",
                pointerEvents: "auto",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: "0.04em",
                    color: "var(--focus-ring)",
                  }}
                >
                  bracketball
                </div>
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 18,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {pageTitle}
                </div>
                {activePool?.name ? (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 12,
                      opacity: 0.74,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {activePool.name}
                  </div>
                ) : null}
              </div>

              <div
                ref={menuRef}
                style={{ display: "flex", alignItems: "center", justifySelf: "end" }}
              >
                <button
                  type="button"
                  className="app-top-nav-avatar-button"
                  aria-label="Open profile menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  style={{
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: 9999,
                    border: "1px solid var(--border-color)",
                    overflow: "hidden",
                    background: "var(--surface)",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                    boxShadow: "var(--shadow-sm)",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={resolvedAvatarUrl}
                    alt="Profile"
                    width={avatarSize}
                    height={avatarSize}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </button>
              </div>
            </div>
          </div>

          {menuOpen ? (
            <div
              role="presentation"
              onClick={() => setMenuOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1190,
                background: "rgba(10, 18, 32, 0.34)",
              }}
            />
          ) : null}

          {menuOpen ? (
            <section
              role="menu"
              aria-label="Profile quick menu"
              className="app-mobile-sheet"
              style={{
                position: "fixed",
                left: 12,
                right: 12,
                bottom: `calc(env(safe-area-inset-bottom, 0px) + 94px)`,
                zIndex: 1200,
                border: "1px solid var(--border-color)",
                borderRadius: 18,
                background: "var(--surface-glass)",
                padding: 12,
                boxShadow: "var(--shadow-lg)",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  className="app-mobile-sheet-action"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/");
                  }}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    background: "var(--surface)",
                    padding: "12px 14px",
                    textAlign: "left",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Scores
                </button>
                <button
                  type="button"
                  className="app-mobile-sheet-action"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/drafts");
                  }}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    background: "var(--surface)",
                    padding: "12px 14px",
                    textAlign: "left",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Drafts
                </button>
                <button
                  type="button"
                  className="app-mobile-sheet-action"
                  onClick={() => {
                    setMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    background: "var(--surface)",
                    padding: "12px 14px",
                    textAlign: "left",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className="app-mobile-sheet-action"
                  onClick={() => {
                    setMenuOpen(false);
                    setHelpOpen(true);
                  }}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    background: "var(--surface)",
                    padding: "12px 14px",
                    textAlign: "left",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Help
                </button>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="app-mobile-sheet-action"
                  style={{
                    flex: 1,
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    padding: "11px 14px",
                    textDecoration: "none",
                    fontWeight: 800,
                    color: "var(--foreground)",
                    background: "var(--surface)",
                  }}
                >
                  Profile
                </Link>
                <button
                  type="button"
                  className="app-mobile-sheet-action"
                  onClick={signOut}
                  style={{
                    flex: 1,
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    padding: "11px 14px",
                    background: "var(--surface)",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Log out
                </button>
              </div>
            </section>
          ) : null}

          <nav
            aria-label="Primary"
            className="app-mobile-tabbar"
            style={{
              position: "fixed",
              left: 12,
              right: 12,
              bottom: `calc(env(safe-area-inset-bottom, 0px) + 10px)`,
              zIndex: 1100,
              display: "flex",
              gap: 8,
              padding: 8,
              border: "1px solid var(--border-color)",
              borderRadius: 20,
              background: "var(--surface-glass)",
              boxShadow: "var(--shadow-md)",
              overflowX: "auto",
              scrollbarWidth: "none",
            }}
          >
            {mobileNavItems.map((item) => (
              item.kind === "link" ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className="app-mobile-tabbar-link"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 14px",
                    borderRadius: 14,
                    fontSize: 12,
                    fontWeight: item.active ? 900 : 800,
                    background: item.active ? "var(--surface-elevated)" : "transparent",
                    color: item.active ? "var(--focus-ring)" : "var(--foreground)",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                  }}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="app-mobile-tabbar-link"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 14px",
                    borderRadius: 14,
                    fontSize: 12,
                    fontWeight: 800,
                    background: "transparent",
                    color: "var(--foreground)",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              )
            ))}
          </nav>
        </>
      ) : (
        <>
          <div
            style={{
              position: "fixed",
              top: 14,
              right: "env(safe-area-inset-right)",
              zIndex: 1205,
              pointerEvents: "auto",
            }}
          >
            <button
              type="button"
              className="app-top-nav-how-it-works-button"
              onClick={openHowItWorksModal}
              aria-haspopup="dialog"
              aria-label="Open how it works details"
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 9999,
                background: "var(--surface-glass)",
                color: "var(--foreground)",
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: "0.02em",
                minHeight: 32,
                padding: "6px 12px",
                boxShadow: "var(--shadow-sm)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              How it works
            </button>
          </div>

          <div
            style={{
              position: "fixed",
              top: 62,
              left: 0,
              right: 0,
              zIndex: 999,
              display: "flex",
              justifyContent: "center",
              padding: "8px 18px",
              pointerEvents: "none",
              transform: isHidden ? "translateY(-140%)" : "translateY(0)",
              opacity: isHidden ? 0 : 1,
              transition: "transform 180ms ease, opacity 180ms ease",
            }}
          >
            <div
              className={`app-top-nav-pills${shouldDeemphasizeNavPills ? " app-top-nav-pills--deemphasized" : ""}`}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "center",
                background: "var(--surface-glass)",
                border: "1px solid var(--border-color)",
                borderRadius: 9999,
                padding: 8,
                boxShadow: "var(--shadow-sm)",
                pointerEvents: "auto",
                maxWidth: "min(980px, calc(100vw - 170px))",
              }}
            >
              <Link href={homeHref} className="app-top-nav-link" aria-current={isHomeActive ? "page" : undefined} style={getNavPillStyle(isHomeActive)}>Home</Link>
              <Link href="/drafts" className="app-top-nav-link" aria-current={isDraftsActive ? "page" : undefined} style={getNavPillStyle(isDraftsActive)}>Drafts</Link>
              <Link href="/pools" className="app-top-nav-link" aria-current={isPoolsActive ? "page" : undefined} style={getNavPillStyle(isPoolsActive)}>Pools</Link>
              {activePoolId ? <Link href={`/pool/${activePoolId}/bracket`} className="app-top-nav-link" aria-current={isBracketActive ? "page" : undefined} style={getNavPillStyle(isBracketActive)}>Bracket</Link> : null}
              {activePoolId ? <Link href={`/pool/${activePoolId}/leaderboard`} className="app-top-nav-link" aria-current={isLeaderboardActive ? "page" : undefined} style={getNavPillStyle(isLeaderboardActive)}>Leaderboard</Link> : null}
              {activePoolId && isSiteAdmin ? (
                <Link href={`/pool/${activePoolId}/admin`} className="app-top-nav-link" aria-current={isAdminActive ? "page" : undefined} style={getNavPillStyle(isAdminActive)}>Admin</Link>
              ) : null}
            </div>

            <div
              ref={menuRef}
              style={{
                position: "absolute",
                right: 16,
                top: 7,
                display: "grid",
                justifyItems: "end",
                pointerEvents: "auto",
              }}
            >
              <div
                onMouseEnter={() => setMenuOpen(true)}
                onMouseLeave={() => {
                  if (!settingsOpen && !helpOpen) {
                    setMenuOpen(false);
                  }
                }}
                style={{ display: "grid", justifyItems: "end" }}
              >
                <button
                  type="button"
                  className="app-top-nav-avatar-button"
                  aria-label="Open profile menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  style={{
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: 9999,
                    border: "1px solid var(--border-color)",
                    overflow: "hidden",
                    background: "var(--surface-glass)",
                    display: "grid",
                    placeItems: "center",
                    padding: 0,
                    boxShadow: "var(--shadow-sm)",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={resolvedAvatarUrl}
                    alt="Profile"
                    width={avatarSize}
                    height={avatarSize}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </button>

                {menuOpen ? (
                  <section
                    role="menu"
                    aria-label="Profile quick menu"
                    style={{
                      marginTop: 10,
                      width: "min(360px, calc(100vw - 28px))",
                      border: "1px solid var(--border-color)",
                      borderRadius: 14,
                      background: "var(--surface-glass)",
                      padding: 10,
                      boxShadow: "var(--shadow-lg)",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/");
                        }}
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          background: "var(--surface-elevated)",
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Scores
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/drafts");
                        }}
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          background: "var(--surface-elevated)",
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Drafts
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setSettingsOpen(true);
                        }}
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          background: "var(--surface-elevated)",
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Settings
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setHelpOpen(true);
                        }}
                        style={{
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          background: "var(--surface-elevated)",
                          padding: "10px 12px",
                          textAlign: "left",
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        Help
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <Link
                        href="/profile"
                        onClick={() => setMenuOpen(false)}
                        style={{
                          flex: 1,
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "9px 12px",
                          textDecoration: "none",
                          fontWeight: 800,
                          color: "var(--foreground)",
                          background: "var(--surface-elevated)",
                        }}
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        onClick={signOut}
                        style={{
                          flex: 1,
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "9px 12px",
                          background: "var(--surface-elevated)",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        Log out
                      </button>
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </>
      )}

      {settingsOpen ? (
        <div
          role="presentation"
          onClick={() => setSettingsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 16,
            pointerEvents: "auto",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(420px, 100%)",
              border: "1px solid var(--border-color)",
              borderRadius: 14,
              background: "var(--surface)",
              padding: 14,
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
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Settings</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
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

            <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-elevated)",
                  padding: 12,
                  display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>Dark Mode</div>
                <div style={{ fontSize: 13, opacity: 0.76 }}>
                  Toggle the app theme for this device.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                role="switch"
                aria-checked={isDark}
                style={{
                  width: 64,
                  height: 34,
                  borderRadius: 9999,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: isDark ? 33 : 3,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    border: "1px solid var(--border-color)",
                    background: "var(--surface-elevated)",
                    transition: "left 150ms ease",
                  }}
                />
              </button>
            </div>

            <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-elevated)",
                  padding: 12,
                  display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 900 }}>Legal</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link
                  href="/terms"
                  onClick={() => setSettingsOpen(false)}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    textDecoration: "none",
                    color: "var(--foreground)",
                    fontWeight: 700,
                    background: "var(--surface)",
                  }}
                >
                  Terms of Service
                </Link>
                <Link
                  href="/privacy"
                  onClick={() => setSettingsOpen(false)}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    textDecoration: "none",
                    color: "var(--foreground)",
                    fontWeight: 700,
                    background: "var(--surface)",
                  }}
                >
                  Privacy Policy
                </Link>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 13, opacity: 0.72 }}>
              More settings options will be added here next.
            </p>
          </section>
        </div>
      ) : null}

      {helpOpen ? (
        <div
          role="presentation"
          onClick={() => setHelpOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 16,
            pointerEvents: "auto",
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
              For now, please direct all questions, bug reports, and support requests
              to{" "}
              <a
                href="mailto:mack@bracketball.io"
                style={{ fontWeight: 800, color: "var(--foreground)" }}
              >
                mack@bracketball.io
              </a>
              . If possible, include your pool name, device, and a screenshot so issues
              can be diagnosed quickly.
            </p>

            <p style={{ margin: 0, lineHeight: 1.5, opacity: 0.82 }}>
              A more comprehensive Help Center is planned, including FAQs,
              troubleshooting guides, and in-app support resources as bracketball
              continues to grow.
            </p>

            <Link
              href="/support"
              onClick={() => setHelpOpen(false)}
              style={{
                display: "inline-flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 42,
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                padding: "10px 12px",
                textDecoration: "none",
                fontWeight: 800,
                color: "var(--foreground)",
                background: "var(--surface-elevated)",
              }}
            >
              Open support page
            </Link>
          </section>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { withAvatarFallback } from "../../lib/avatar";
import { useAutoHideOnScroll } from "./useAutoHideOnScroll";

type Pool = { id: string; name: string; created_by: string };
type Theme = "light" | "dark";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [homeButtonHovered, setHomeButtonHovered] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
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
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

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
      const selectedPoolId = poolIdFromPath ?? membershipPoolIds[0] ?? null;
      setActivePoolId(selectedPoolId);

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
    setMenuOpen(false);
    setSettingsOpen(false);

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

  const pillStyle: CSSProperties = {
    padding: "8px 12px",
    border: "1px solid var(--border-color)",
    borderRadius: 9999,
    textDecoration: "none",
    color: "var(--foreground)",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
    background: "var(--surface)",
  };
  const resolvedAvatarUrl = withAvatarFallback(userId, profileAvatarUrl);
  const shouldDeemphasizeNavPills = homeButtonHovered || menuOpen;

  return (
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
        }}
      >
        <Link href={homeHref} className="app-top-nav-link" style={pillStyle}>Home</Link>
        <Link href="/how-it-works" className="app-top-nav-link" style={pillStyle}>How it works</Link>
        <Link href="/drafts" className="app-top-nav-link" style={pillStyle}>Drafts</Link>
        <Link href="/pools" className="app-top-nav-link" style={pillStyle}>Pools</Link>
        {activePoolId ? <Link href={`/pool/${activePoolId}/bracket`} className="app-top-nav-link" style={pillStyle}>Bracket</Link> : null}
        {activePoolId && activePool?.created_by === userId ? (
          <Link href={`/pool/${activePoolId}/admin`} className="app-top-nav-link" style={pillStyle}>Admin</Link>
        ) : null}
      </div>
      <div
        ref={menuRef}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => {
          if (!settingsOpen) {
            setMenuOpen(false);
          }
        }}
        style={{
          position: "absolute",
          right: 16,
          top: 7,
          display: "grid",
          justifyItems: "end",
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          className="app-top-nav-avatar-button"
          aria-label="Open profile menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          style={{
            width: 42,
            height: 42,
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
            width={42}
            height={42}
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
                  gridColumn: 2,
                  gridRow: "1 / span 2",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-elevated)",
                  padding: "10px 12px",
                  textAlign: "center",
                  fontWeight: 900,
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
    </div>
  );
}

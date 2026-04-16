import { Capacitor } from "@capacitor/core";
import { resolveDeepLinkPath } from "./deepLinks";

const PUSH_INSTALLATION_STORAGE_KEY = "bracketball.push.installation-id";

export type PushPlatform = "ios" | "android" | "web";
export type PushPermissionState =
  | "prompt"
  | "prompt-with-rationale"
  | "granted"
  | "denied"
  | "unknown";

function generateInstallationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `push-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getPushInstallationId() {
  if (typeof window === "undefined") return "server";

  const existing = window.localStorage.getItem(PUSH_INSTALLATION_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const next = generateInstallationId();
  window.localStorage.setItem(PUSH_INSTALLATION_STORAGE_KEY, next);
  return next;
}

export function getPushPlatform(): PushPlatform {
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") return platform;
  return "web";
}

export function normalizePushPermissionState(value: string | null | undefined): PushPermissionState {
  if (
    value === "prompt" ||
    value === "prompt-with-rationale" ||
    value === "granted" ||
    value === "denied"
  ) {
    return value;
  }

  return "unknown";
}

function normalizeNotificationPath(path: string | null | undefined) {
  const trimmed = (path ?? "").trim();
  if (!trimmed) return null;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function resolvePushNotificationPath(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const payload = data as Record<string, unknown>;
  const directPath = normalizeNotificationPath(
    typeof payload.path === "string" ? payload.path : null,
  );
  if (directPath) return directPath;

  const linkValue =
    typeof payload.link === "string"
      ? payload.link
      : typeof payload.url === "string"
        ? payload.url
        : null;
  if (linkValue) {
    const resolved = resolveDeepLinkPath(linkValue);
    if (resolved) return resolved;
  }

  const poolId =
    typeof payload.poolId === "string"
      ? payload.poolId.trim()
      : typeof payload.pool_id === "string"
        ? payload.pool_id.trim()
        : "";
  if (!poolId) return null;

  const destination =
    typeof payload.destination === "string"
      ? payload.destination.trim().toLowerCase()
      : typeof payload.screen === "string"
        ? payload.screen.trim().toLowerCase()
        : "leaderboard";

  if (destination === "bracket") return `/pool/${encodeURIComponent(poolId)}/bracket`;
  if (destination === "draft") return `/pool/${encodeURIComponent(poolId)}/draft`;
  if (destination === "pool") return `/pool/${encodeURIComponent(poolId)}`;
  return `/pool/${encodeURIComponent(poolId)}/leaderboard`;
}


export type AnalyticsMetadata = Record<string, string | number | boolean | null>;

export type TrackEventInput = {
  eventName: string;
  userId?: string | null;
  poolId?: string | null;
  entryId?: string | null;
  path?: string;
  metadata?: AnalyticsMetadata;
};

const SESSION_STORAGE_KEY = "bracketball.analytics.session_id";

function safeRandomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `sid-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getSessionId() {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;

    const next = safeRandomId();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return safeRandomId();
  }
}

export function trackEvent(input: TrackEventInput) {
  if (typeof window === "undefined") return;

  const eventName = input.eventName.trim();
  if (!eventName) return;

  const payload = {
    eventName,
    userId: input.userId ?? null,
    poolId: input.poolId ?? null,
    entryId: input.entryId ?? null,
    path: input.path ?? window.location.pathname,
    metadata: input.metadata ?? {},
    sessionId: getSessionId(),
  };

  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const queued = navigator.sendBeacon("/api/analytics/track", blob);
      if (queued) return;
    }
  } catch {
    // Ignore beacon issues and fall back to fetch.
  }

  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

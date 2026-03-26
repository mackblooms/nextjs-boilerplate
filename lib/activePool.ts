const ACTIVE_POOL_STORAGE_KEY = "bb:active-pool-id";
const ACTIVE_POOL_CHANGED_EVENT = "bb:active-pool-changed";

function normalizePoolId(poolId: string | null | undefined) {
  const normalized = (poolId ?? "").trim();
  return normalized || null;
}

export { ACTIVE_POOL_STORAGE_KEY, ACTIVE_POOL_CHANGED_EVENT };

export function getStoredActivePoolId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    return normalizePoolId(window.localStorage.getItem(ACTIVE_POOL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setStoredActivePoolId(poolId: string | null | undefined) {
  if (typeof window === "undefined") return;

  const normalized = normalizePoolId(poolId);
  let previous: string | null = null;

  try {
    previous = normalizePoolId(window.localStorage.getItem(ACTIVE_POOL_STORAGE_KEY));

    if (normalized) {
      window.localStorage.setItem(ACTIVE_POOL_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(ACTIVE_POOL_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }

  if (previous === normalized) return;

  window.dispatchEvent(
    new CustomEvent<{ poolId: string | null }>(ACTIVE_POOL_CHANGED_EVENT, {
      detail: { poolId: normalized },
    }),
  );
}

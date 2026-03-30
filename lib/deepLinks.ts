const DIRECT_PATH_PREFIXES = ["/drafts", "/pools", "/profile", "/support"] as const;

function normalizePoolId(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return value.length > 0 ? value : null;
}

function buildPoolPath(poolId: string, rest: string[]): string {
  const suffix = rest.length > 0 ? `/${rest.join("/")}` : "";
  return `/pool/${encodeURIComponent(poolId)}${suffix}`;
}

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function resolveDeepLinkPath(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const invitePoolId = normalizePoolId(parsed.searchParams.get("invite"));
  if (invitePoolId) {
    return buildPoolPath(invitePoolId, []);
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  const host = parsed.host.toLowerCase();
  const pathSegments = parsed.pathname.split("/").filter(Boolean);

  if (scheme === "bracketball" || scheme === "com.mackbloom.bracketball") {
    if ((host === "invite" || host === "pool" || host === "pools") && pathSegments.length > 0) {
      const [poolId, ...rest] = pathSegments;
      if (host === "invite") return buildPoolPath(poolId, []);
      return buildPoolPath(poolId, rest);
    }

    if (host === "drafts" || host === "pools" || host === "profile" || host === "support") {
      return `/${host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
    }

    if (host === "pool" && pathSegments.length === 0) return "/pools";
  }

  if (host === "bracketball.io" || host === "www.bracketball.io" || host === "localhost:3000") {
    const pathname = normalizePathname(parsed.pathname);
    if (pathname.startsWith("/pool/")) {
      return `${pathname}${parsed.search}`;
    }

    if (pathname === "/") return invitePoolId ? buildPoolPath(invitePoolId, []) : "/";

    if (DIRECT_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return `${pathname}${parsed.search}`;
    }
  }

  return null;
}

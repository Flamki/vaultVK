function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
const rawWsBase = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim() ?? "";

const apiBase = rawApiBase ? trimTrailingSlash(rawApiBase) : "";
const wsBase = rawWsBase ? trimTrailingSlash(rawWsBase) : "";

export function apiUrl(path: string): string {
  const normalizedPath = ensureLeadingSlash(path);
  if (!apiBase) {
    return normalizedPath;
  }
  return `${apiBase}${normalizedPath}`;
}

export function wsUrl(path: string): string {
  const normalizedPath = ensureLeadingSlash(path);
  if (wsBase) {
    return `${wsBase}${normalizedPath}`;
  }
  if (apiBase) {
    try {
      const parsed = new URL(apiBase);
      const wsProto = parsed.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProto}//${parsed.host}${normalizedPath}`;
    } catch {
      // Fall through to same-origin fallback if API base is invalid.
    }
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${normalizedPath}`;
}

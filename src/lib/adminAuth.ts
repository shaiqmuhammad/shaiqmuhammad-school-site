export const ADMIN_SESSION_KEY = "sm_admin_authenticated";
export const ADMIN_PREVIEW_KEY = "sm_admin_preview_data";
/** Signed admin session from the Worker (12 h since last use, 7 days max; see lib/adminServer.ts). */
export const ADMIN_SERVER_SESSION_KEY = "sm_admin_server_session";

/**
 * The admin password is checked only by the school server (workers/assessment-session/src/admin.ts):
 * nothing about it — not even a hash — is shipped in the website code.
 */
export function isAdminConfigured(): boolean {
  return true;
}

/** Upper bound for the local "signed in" flag; the server session itself lasts 12 h since last use (7 days max). */
export const ADMIN_SESSION_DAYS = 7;

export function isAdminAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (raw) {
      const exp = Number(JSON.parse(raw)?.exp) || 0;
      if (exp > Date.now() && hasServerToken()) return true;
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
    // Sign-in from an older build (per-tab sessionStorage): upgrade it to the device session.
    if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1" && hasServerToken()) {
      setAdminAuthenticated(true);
      return true;
    }
  } catch {
    // storage unavailable or malformed — treat as signed out
  }
  return false;
}

export function setAdminAuthenticated(ok: boolean): void {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (ok) localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ exp: Date.now() + ADMIN_SESSION_DAYS * 864e5 }));
    else {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SERVER_SESSION_KEY);
    }
  } catch {
    // storage unavailable
  }
}

/** A server session (signed, unexpired) is stored on this device. */
function hasServerToken(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_SERVER_SESSION_KEY) || "null") as { token?: string; exp?: number } | null;
    return Boolean(s?.token && Number(s.exp) > Date.now() && isCurrentTokenFormat(s.token));
  } catch {
    return false;
  }
}

/** Sessions from before the security update (no version stamp) are no longer accepted by the server. */
export function isCurrentTokenFormat(token: string): boolean {
  try {
    const p = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(atob(p + "===".slice((p.length + 3) % 4))) as { v?: number };
    return d.v === 2;
  } catch {
    return false;
  }
}

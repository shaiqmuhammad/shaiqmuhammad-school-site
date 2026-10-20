/** The signed-in STUDENT's LMS token (or null), read without importing lib/lms (avoids an import cycle with groupSession). */
export function studentLoginToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = localStorage.getItem("sm_lms_session_v1");
    if (!raw) { const m = document.cookie.match(/(?:^|; )sm_lms_s=([^;]*)/); raw = m ? decodeURIComponent(m[1]) : null; }
    const s = raw ? (JSON.parse(raw) as { token?: string; exp?: number; user?: { role?: string } }) : null;
    return s?.token && (s.exp || 0) > Date.now() && s.user?.role === "student" ? s.token : null;
  } catch {
    return null;
  }
}

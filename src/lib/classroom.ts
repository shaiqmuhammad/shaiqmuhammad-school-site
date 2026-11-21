/** Standalone live classroom (no LMS/admin/site shell). */

export type ClassroomOpenOpts = {
  room?: string;
  guest?: boolean;
  token?: string;
  asAdmin?: boolean;
  debug?: boolean;
};

export const CLASSROOM_PATH = "/classroom";
export const CLASSROOM_JOIN_PATH = "/classroom/join";

/** sessionStorage key used to ignore repeat opens of the same classroom href. */
export const CLASSROOM_OPEN_GUARD_KEY = "sm-classroom-open";
export const CLASSROOM_OPEN_GUARD_MS = 4000;

export function isClassroomPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === CLASSROOM_PATH || pathname.startsWith(`${CLASSROOM_PATH}/`);
}

export function classroomHref(opts: ClassroomOpenOpts = {}): string {
  const path = opts.token && !opts.room ? CLASSROOM_JOIN_PATH : CLASSROOM_PATH;
  const q = new URLSearchParams();
  if (opts.room) q.set("room", opts.room);
  if (opts.guest) q.set("guest", "1");
  if (opts.token) q.set("t", opts.token);
  if (opts.asAdmin) q.set("as", "admin");
  const debug = opts.debug ?? (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1");
  if (debug) q.set("debug", "1");
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export function classroomJoinHref(token: string): string {
  return `${CLASSROOM_JOIN_PATH}?t=${encodeURIComponent(token)}`;
}

export function classroomJoinUrl(token: string, origin?: string): string {
  const o = origin || (typeof window !== "undefined" ? window.location.origin : "https://www.shaiqmuhammad.com");
  return `${o}${classroomJoinHref(token)}`;
}

function onClassroomPage(): boolean {
  return typeof window !== "undefined" && isClassroomPath(window.location.pathname);
}

function rememberOpen(href: string): boolean {
  /* true = this href was opened very recently in this tab; skip a repeat. */
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(CLASSROOM_OPEN_GUARD_KEY);
    if (raw) {
      const prev = JSON.parse(raw) as { href?: string; at?: number };
      if (prev.href === href && typeof prev.at === "number" && Date.now() - prev.at < CLASSROOM_OPEN_GUARD_MS) {
        return true;
      }
    }
    sessionStorage.setItem(CLASSROOM_OPEN_GUARD_KEY, JSON.stringify({ href, at: Date.now() }));
  } catch {
    /* private mode */
  }
  return false;
}

export type ClassroomTabHandle = {
  go: (opts: ClassroomOpenOpts) => boolean;
  cancel: () => void;
};

/**
 * Open the classroom in a new tab so the LMS/admin/student area stays exactly where it is.
 * Call only from a user click (or use prepareClassroomTab before an await).
 * Never opens another tab from /classroom, and never navigates the current page
 * (Safari often returns null from window.open with noopener, which used to
 * location.assign and reload-loop).
 */
export function openClassroomTab(opts: ClassroomOpenOpts = {}): boolean {
  if (typeof window === "undefined" || onClassroomPage()) return false;
  const href = classroomHref(opts);
  if (rememberOpen(href)) return false;
  const w = window.open(href, "_blank");
  if (w) {
    try { w.opener = null; } catch { /* ignore */ }
    return true;
  }
  return false;
}

/**
 * Open a blank tab synchronously during a click, then point it at the classroom
 * after an async start/join. If start fails, call cancel() so the blank tab closes.
 * Does nothing when already on /classroom, and never changes the current page.
 */
export function prepareClassroomTab(): ClassroomTabHandle {
  const noop: ClassroomTabHandle = { go: () => false, cancel: () => undefined };
  if (typeof window === "undefined" || onClassroomPage()) return noop;
  // Keep the window reference until go() navigates it. Clearing opener first
  // stops WebKit/Safari from allowing location.replace on the placeholder.
  const w = window.open("about:blank", "_blank");
  let used = false;
  const dropOpener = () => {
    if (w) {
      try { w.opener = null; } catch { /* ignore */ }
    }
  };
  return {
    go(opts) {
      if (used) return false;
      used = true;
      if (onClassroomPage()) {
        if (w && !w.closed) w.close();
        return false;
      }
      const href = classroomHref(opts);
      rememberOpen(href);
      if (w && !w.closed) {
        try {
          w.location.replace(href);
          dropOpener();
          return true;
        } catch {
          try { w.close(); } catch { /* ignore */ }
        }
      }
      const again = window.open(href, "_blank");
      if (again) {
        try { again.opener = null; } catch { /* ignore */ }
        return true;
      }
      return false;
    },
    cancel() {
      if (used) return;
      used = true;
      if (w && !w.closed) {
        try { w.close(); } catch { /* ignore */ }
      }
    },
  };
}

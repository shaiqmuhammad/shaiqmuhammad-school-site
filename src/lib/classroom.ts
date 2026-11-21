/** Standalone live classroom (no LMS/admin/site shell). */

export type ClassroomOpenOpts = {
  room?: string;
  guest?: boolean;
  token?: string;
  asAdmin?: boolean;
};

export const CLASSROOM_PATH = "/classroom";
export const CLASSROOM_JOIN_PATH = "/classroom/join";

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

/** Open the classroom in a new tab so the LMS/admin area stays usable. Falls back to same-tab if a popup is blocked. */
export function openClassroomTab(opts: ClassroomOpenOpts): void {
  if (typeof window === "undefined") return;
  const href = classroomHref(opts);
  const w = window.open(href, "_blank", "noopener,noreferrer");
  if (!w) window.location.assign(href);
}

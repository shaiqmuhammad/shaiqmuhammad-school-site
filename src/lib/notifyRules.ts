/**
 * Which in-app notes pop up (toast + sound) for which role, and how "new since last time" is decided.
 * Pure functions (no browser APIs) so they are unit-tested from workers/assessment-session/test.
 */
export type AlertRole = "admin" | "teacher" | "student";
export type NoteLike = { id: string; kind: string; created: number; read?: boolean };

/** Students: new homework, feedback and grades. Never revision reminders (kind "revise"), nor timed reminders. */
const KINDS: Record<AlertRole, ReadonlySet<string>> = {
  student: new Set(["hw_new", "hw_shared", "feedback", "feedback_audio", "graded", "approved", "returned", "mistakes", "lp_feedback", "announcement", "message"]),
  teacher: new Set(["sub_new", "message", "announcement", "tt_observe_req", "tt_observe_reply", "tt_cover"]),
  admin: new Set(["sub_new", "message"]),
};
const NEVER_FOR_STUDENTS = new Set(["revise"]);

export const alertsFor = (role: AlertRole, kind: string) => KINDS[role].has(kind) && !(role === "student" && NEVER_FOR_STUDENTS.has(kind));

export const MAX_AGE_MS = 15 * 60_000;
export const MAX_TOASTS = 3;

/**
 * lastSeen null = first visit on this browser: remember the newest note, show nothing.
 * Otherwise: unread, allowed-kind notes newer than lastSeen and not older than 15 minutes, oldest first, newest 3 kept.
 */
export function pickAlerts<T extends NoteLike>(items: T[], role: AlertRole, lastSeen: number | null, now: number): { fresh: T[]; more: number; lastSeen: number } {
  const newest = items.reduce((m, n) => Math.max(m, n.created || 0), 0);
  if (lastSeen === null) return { fresh: [], more: 0, lastSeen: newest || now };
  const all = items
    .filter((n) => !n.read && n.created > lastSeen && now - n.created <= MAX_AGE_MS && alertsFor(role, n.kind))
    .sort((a, b) => a.created - b.created);
  return { fresh: all.slice(-MAX_TOASTS), more: Math.max(0, all.length - MAX_TOASTS), lastSeen: Math.max(lastSeen, newest) };
}

/** Counters (unread email, enquiries, forum posts waiting): returns how many were added since the stored value; null stored = baseline. */
export function countIncrease(prev: number | null | undefined, next: number): number {
  if (prev === null || prev === undefined) return 0;
  return next > prev ? next - prev : 0;
}

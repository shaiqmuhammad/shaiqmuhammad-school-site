import { ADMIN_SERVER_SESSION_KEY } from "@/lib/adminAuth";
import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

/**
 * Server-side publishing: the admin signs in once per device (30 days) and the Worker
 * (workers/assessment-session/src/admin.ts) commits to GitHub with a key kept as a Worker secret.
 * Nothing secret is stored in the browser — only a signed, expiring session token.
 */
const ADMIN_API = `${ASSESSMENT_API_BASE}/api/admin`;

type ServerSession = { token: string; exp: number };

export function getServerSession(): ServerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_SERVER_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ServerSession;
    if (s?.token && Number(s.exp) > Date.now()) return s;
    localStorage.removeItem(ADMIN_SERVER_SESSION_KEY);
  } catch {
    // storage unavailable or malformed
  }
  return null;
}

export function clearServerSession(): void {
  try {
    localStorage.removeItem(ADMIN_SERVER_SESSION_KEY);
  } catch {
    // storage unavailable
  }
}

export type ServerLoginResult = { ok: true } | { ok: false; reason: "wrong_password" | "too_many_attempts" | "unreachable" | "error"; retryAfter?: number };

/** Exchange the admin password for a 30-day publishing session (stored on this device). */
export async function serverLogin(password: string): Promise<ServerLoginResult> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  const data = (await res.json().catch(() => ({}))) as { token?: string; exp?: number; retryAfter?: number };
  if (res.ok && data.token && data.exp) {
    localStorage.setItem(ADMIN_SERVER_SESSION_KEY, JSON.stringify({ token: data.token, exp: data.exp }));
    localStorage.setItem("sm_admin_login_at", String(Date.now()));
    return { ok: true };
  }
  if (res.status === 401) return { ok: false, reason: "wrong_password" };
  if (res.status === 429) return { ok: false, reason: "too_many_attempts", retryAfter: data.retryAfter };
  return { ok: false, reason: "error" };
}

/** True when the Worker answers (used to offer the "own key" fallback only when it is down). */
export async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${ADMIN_API}/ping`, { cache: "no-store" });
    const data = (await res.json()) as { configured?: boolean };
    return res.ok && Boolean(data.configured);
  } catch {
    return false;
  }
}

export type ServerFile = { path: string; content: string; encoding?: "base64" | "utf-8"; delete?: boolean };
export type ServerPublishResult =
  | { ok: true; commitSha: string; htmlUrl?: string; unchanged?: boolean }
  | { ok: false; error: string; status?: number };

/** Commit one or more files in a single commit through the Worker. Identical files are skipped. */
export async function serverPublish(files: ServerFile[], message: string): Promise<ServerPublishResult> {
  const session = getServerSession();
  if (!session) return { ok: false, status: 401, error: "Publishing isn't connected on this device. Sign out and sign in again." };
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ files, message }),
    });
  } catch {
    return { ok: false, error: "Could not reach the publishing server. Check your connection and try again." };
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; commitSha?: string; htmlUrl?: string; unchanged?: boolean; error?: string; path?: string };
  if (res.ok && data.ok) {
    return data.unchanged ? { ok: true, commitSha: "unchanged", unchanged: true } : { ok: true, commitSha: data.commitSha || "ok", htmlUrl: data.htmlUrl };
  }
  if (res.status === 401) {
    clearServerSession();
    return { ok: false, status: 401, error: "Your publishing session has expired. Sign out and sign in again." };
  }
  return { ok: false, status: res.status, error: `Publish failed (${res.status}): ${data.error || "error"}${data.path ? ` — ${data.path}` : ""}` };
}

/* ---------- Forum moderation (admin) ---------- */

export type PendingForumPost = {
  id: string;
  kind: "thread" | "reply";
  threadId?: string;
  author: string;
  title?: string;
  body: string;
  createdAt: string;
};

async function forumAdmin<T>(action: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const session = getServerSession();
  if (!session) return { ok: false, status: 401, data: {} as T };
  try {
    const res = await fetch(`${ASSESSMENT_API_BASE}/api/forum/${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${session.token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (res.status === 401) clearServerSession();
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as T };
  } catch {
    return { ok: false, status: 0, data: {} as T };
  }
}

/** Number of posts waiting for approval, or null when it can't be checked. */
export async function forumPendingCount(): Promise<number | null> {
  const r = await forumAdmin<{ count?: number }>("count");
  return r.ok && typeof r.data.count === "number" ? r.data.count : null;
}

export async function forumPendingList(): Promise<PendingForumPost[] | null> {
  const r = await forumAdmin<{ items?: PendingForumPost[] }>("pending");
  return r.ok && Array.isArray(r.data.items) ? r.data.items : null;
}

export async function forumApprove(
  id: string,
  edits?: { author?: string; title?: string; body?: string },
): Promise<{ ok: true; forum: unknown; htmlUrl?: string } | { ok: false; error: string }> {
  const r = await forumAdmin<{ forum?: unknown; htmlUrl?: string; error?: string }>("approve", { id, edits });
  if (r.ok && r.data.forum) return { ok: true, forum: r.data.forum, htmlUrl: r.data.htmlUrl };
  return { ok: false, error: r.data.error || (r.status === 0 ? "network" : `error_${r.status}`) };
}

export async function forumReject(id: string): Promise<boolean> {
  return (await forumAdmin<{ ok?: boolean }>("reject", { id })).ok;
}

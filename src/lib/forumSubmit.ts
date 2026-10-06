import { ASSESSMENT_API_BASE } from "@/lib/groupSession";

/** Student forum posts go to the moderation queue on the Worker; the teacher approves them in Admin → Forum. */
export type ForumSubmission = {
  kind: "thread" | "reply";
  threadId?: string;
  author: string;
  title?: string;
  body: string;
  /** Honeypot: must stay empty (hidden field). */
  website?: string;
  /** How long the form was open (very fast submissions are treated as bots). */
  elapsedMs?: number;
};

export type ForumSubmitResult = { ok: true } | { ok: false; error: string };

export async function submitForumPost(post: ForumSubmission): Promise<ForumSubmitResult> {
  try {
    const res = await fetch(`${ASSESSMENT_API_BASE}/api/forum/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reason?: string };
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.reason || data.error || `error_${res.status}` };
  } catch {
    return { ok: false, error: "network" };
  }
}

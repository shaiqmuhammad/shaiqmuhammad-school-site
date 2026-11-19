/** Homework / Quran / lesson-pack submit cap.
 *  0 = multiple, until the teacher approves. 1 = one submit; sending it back or commenting after submit allows one more.
 *  Any other number is that many submits in total. A missing value is one attempt, so older homework keeps today's rule.
 *  Older submitted rows have no nsubmit yet; a cap of 1 still treats them as already handed in.
 */
export type AttemptSub = { status?: string; nsubmit?: number; comments?: { at?: number }[]; submittedAt?: number };

export function commentList(raw: unknown): { at?: number }[] {
  try {
    const p = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function attemptGate(data: { attemptLimit?: unknown } | null | undefined, sub: AttemptSub | null | undefined): { open: boolean; code: "already_submitted" | "attempts_used" } {
  if (sub?.status === "approved") return { open: false, code: "already_submitted" };
  const raw = data?.attemptLimit;
  if (raw === 0 || raw === "0") return { open: true, code: "attempts_used" };
  const cap = Math.max(1, Math.min(30, Math.floor(Number(raw ?? 1)) || 1));
  const used = Number(sub?.nsubmit || 0);
  const replied = !!(sub && (sub.comments || []).some((c) => Number(c.at || 0) > Number(sub.submittedAt || 0)));
  if (cap === 1 && sub?.status === "submitted" && !replied) return { open: false, code: "already_submitted" };
  if (used < cap) return { open: true, code: "attempts_used" };
  if (cap === 1 && (sub?.status === "returned" || replied)) return { open: true, code: "attempts_used" };
  return { open: false, code: "attempts_used" };
}

/** Decide whether the host (or admin) may remove this attendee from a live room. */
export function liveRemoveCheck(opts: {
  live: boolean;
  teacherId: string;
  hostId: string;
  userId: string;
  memberIds: string[];
}): { ok: true } | { ok: false; error: "ended" | "forbidden" | "not_found" } {
  if (!opts.live) return { ok: false, error: "ended" };
  if (opts.hostId !== opts.teacherId && opts.hostId !== "admin") return { ok: false, error: "forbidden" };
  if (!opts.userId || opts.userId === opts.teacherId) return { ok: false, error: "forbidden" };
  if (!opts.memberIds.includes(opts.userId)) return { ok: false, error: "not_found" };
  return { ok: true };
}

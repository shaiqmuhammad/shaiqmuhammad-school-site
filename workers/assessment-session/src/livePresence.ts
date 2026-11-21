/** Presence sweep: drop attendees who closed the socket or missed heartbeats. */

export const HEARTBEAT_MS = 15_000;
/** Wait after the last socket closes so a quick reconnect is not treated as a leave. */
export const GRACE_MS = 20_000;
/** Drop a client that opened a socket and started pinging, then went silent (zombie connection). */
export const STALE_MS = 45_000;
export const SWEEP_MS = 15_000;

export type PresenceMember = { id: string; present: boolean; seenAt?: number; hb?: boolean };
export type PresenceAction = "keep" | "offline" | "drop";

export function memberAge(m: Pick<PresenceMember, "seenAt">, now: number): number {
  const seen = m.seenAt ?? now;
  return Math.max(0, now - seen);
}

/** Decide whether a member should stay, go offline (host), or be removed (attendee). */
export function shouldDropMember(
  m: PresenceMember,
  opts: { now: number; sockets: number; isHost: boolean },
): PresenceAction {
  const age = memberAge(m, opts.now);
  let stale = false;
  if (opts.sockets > 0) {
    // Only time out an open socket after that client has sent a heartbeat ping,
    // so meetings still on an older page (no ping) are not dropped while idle.
    stale = !!m.hb && age >= STALE_MS;
  } else {
    stale = age >= GRACE_MS;
  }
  if (!stale) return "keep";
  return opts.isHost ? "offline" : "drop";
}

export function nextAlarmAt(now: number, endsAt: number, sweepMs = SWEEP_MS): number {
  const end = Number.isFinite(endsAt) ? endsAt : now + sweepMs;
  return Math.max(now + 1_000, Math.min(now + sweepMs, end));
}

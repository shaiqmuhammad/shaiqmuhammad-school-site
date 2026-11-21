/** Host-driven YouTube (and later other media) play/pause/seek cursor for a live classroom. */

export type LiveMediaSync = {
  src: string;
  playing: boolean;
  t: number;
  at: number;
};

export const MEDIA_SEEK_SLACK_S = 1.25;

export function normalizeMediaSync(raw: unknown, fallbackSrc = "", at = Date.now()): LiveMediaSync | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const src = String(o.src || fallbackSrc || "").trim().slice(0, 80);
  if (!src) return undefined;
  const t = Math.max(0, Math.min(12 * 3600, Number(o.t) || 0));
  const stamp = Math.max(0, Math.trunc(Number(o.at) || at));
  return { src, playing: o.playing === true, t, at: stamp };
}

/** Media time that a follower should be at, given when the host last reported. */
export function expectedMediaTime(m: Pick<LiveMediaSync, "playing" | "t" | "at">, now = Date.now()): number {
  const elapsed = m.playing ? Math.max(0, (now - m.at) / 1000) : 0;
  return m.t + elapsed;
}

export function shouldSeek(localTime: number, expected: number, slack = MEDIA_SEEK_SLACK_S): boolean {
  return Math.abs((Number(localTime) || 0) - expected) > slack;
}

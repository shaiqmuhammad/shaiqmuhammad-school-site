/** Sanitize client media timing logs. No names, no ICE credentials. */

export const LIVE_DEBUG_EVENTS = [
  "join", "ws_open", "ws_close",
  "gum_start", "gum_ok", "gum_fail",
  "ice_servers", "sfu_session_pub", "sfu_session_recv",
  "tracks_new_push", "tracks_new_pull",
  "ice_gather", "ice_connected", "ice_failed", "ice_restart",
  "pub_announce", "first_remote_track", "first_remote_frame",
  "ready", "error", "retry",
  "sfu_error", "sfu_sub_fail", "sfu_sub_retry", "pub_rebuild",
] as const;

export type LiveDebugEvent = { t: number; ev: string; detail?: string };
export type LiveDebugBlob = { clientId: string; at: number; t0: number; events: LiveDebugEvent[] };

const MAX_EVENTS = 80;
const MAX_DETAIL = 160;
const MAX_BLOBS = 8;
const TTL_MS = 6 * 3600 * 1000;
const ALLOWED = new Set<string>(LIVE_DEBUG_EVENTS);

function str(v: unknown, n: number) {
  return String(v ?? "").trim().slice(0, n);
}

export function sanitizeLiveDebug(body: Record<string, unknown>, clientId: string): LiveDebugBlob | null {
  const id = str(clientId || body.clientId, 24);
  if (!id) return null;
  const raw = Array.isArray(body.events) ? body.events : [];
  const events: LiveDebugEvent[] = [];
  for (const row of raw.slice(0, MAX_EVENTS)) {
    if (!row || typeof row !== "object") continue;
    const ev = str((row as LiveDebugEvent).ev, 40);
    if (!ev || (!ALLOWED.has(ev) && !/^[a-z][a-z0-9_]{1,39}$/.test(ev))) continue;
    const t = Math.max(0, Math.min(3_600_000, Math.trunc(Number((row as LiveDebugEvent).t) || 0)));
    const detail = str((row as LiveDebugEvent).detail, MAX_DETAIL);
    events.push(detail ? { t, ev, detail } : { t, ev });
  }
  if (!events.length) return null;
  return {
    clientId: id,
    at: Date.now(),
    t0: Math.trunc(Number(body.t0) || Date.now()),
    events,
  };
}

export function keepDebugLogs(list: LiveDebugBlob[], next: LiveDebugBlob, now = Date.now()): LiveDebugBlob[] {
  const fresh = list.filter((x) => now - x.at < TTL_MS && x.clientId !== next.clientId);
  return [...fresh, next].slice(-MAX_BLOBS);
}

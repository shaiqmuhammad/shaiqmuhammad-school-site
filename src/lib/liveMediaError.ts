/** Precise, name-free detail from SFU / WebRTC / LMS errors for the classroom banner. */

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
}

function text(v: unknown, max = 160): string {
  if (v == null || v === "") return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
}

type TrackErr = { trackName?: unknown; errorCode?: unknown; errorDescription?: unknown; mid?: unknown };

/** Build a short diagnostic from a Cloudflare Realtime / live-sfu JSON body. */
export function sfuResponseDetail(data: Record<string, unknown> | undefined | null): string {
  if (!data) return "";
  const topCode = text(data.errorCode, 80);
  const topErr = text(data.error, 80);
  const code = topCode || (topErr && topErr !== "error" && topErr !== "sfu_error" ? topErr : "");
  const topDesc = text(data.errorDescription || data.detail || (typeof data.message === "string" && data.message !== code ? data.message : ""), 160);
  const tracks = Array.isArray(data.tracks) ? data.tracks as TrackErr[] : [];
  const trackParts: string[] = [];
  for (const t of tracks) {
    const tCode = text(t.errorCode, 80);
    if (!tCode) continue;
    const name = text(t.trackName || t.mid, 24);
    const desc = text(t.errorDescription, 120);
    trackParts.push([name, tCode, desc].filter(Boolean).join(": "));
  }
  const top = code && topDesc && !topDesc.includes(code) ? `${code}: ${topDesc}` : (topDesc || code);
  return [...new Set([top, ...trackParts].filter(Boolean))].join("; ").slice(0, 200);
}

function errorData(e: unknown): Record<string, unknown> | undefined {
  const rec = asRecord(e);
  if (!rec) return undefined;
  if (asRecord(rec.data)) return rec.data as Record<string, unknown>;
  if (rec.errorCode != null || rec.errorDescription != null || rec.detail != null || Array.isArray(rec.tracks)) return rec;
  return undefined;
}

/** Best human-readable cause for a media or LMS failure (no student names). */
export function mediaErrorDetail(e: unknown): string {
  const fromData = sfuResponseDetail(errorData(e));
  const rec = asRecord(e);
  const name = rec ? text(rec.name, 80) : "";
  const isDom = !!name && name.endsWith("Error") && name !== "Error" && name !== "LmsError";
  if (isDom) {
    const msg = text(rec?.message, 140);
    const core = msg && msg !== name ? `${name}: ${msg}` : name;
    return fromData && !core.includes(fromData) ? `${core}; ${fromData}` : core;
  }
  if (fromData) return fromData;
  if (e instanceof Error) {
    const msg = text(e.message, 160);
    if (msg && msg !== "error") return msg;
  }
  if (typeof e === "string") return text(e, 160);
  return "";
}

export type RemoteTrackRow = { mid?: string | number | null; sessionId?: string; trackName?: string; errorCode?: string; errorDescription?: string };

/** Pick the tracks/new result row that belongs to a remote subscription. */
export function matchRemoteTrack(
  tracks: RemoteTrackRow[],
  item: { name: string; sessionId: string },
  used: Set<string>,
  index?: number,
): RemoteTrackRow | undefined {
  const midOf = (t: RemoteTrackRow) => (t.mid != null && String(t.mid) !== "" ? String(t.mid) : "");
  const named = tracks.find((t) => {
    const mid = midOf(t);
    if (!mid || used.has(mid)) return false;
    return t.trackName === item.name && (!t.sessionId || t.sessionId === item.sessionId);
  });
  if (named) return named;
  const loose = tracks.find((t) => {
    const mid = midOf(t);
    if (!mid || used.has(mid)) return false;
    if (t.sessionId && t.sessionId !== item.sessionId) return false;
    if (t.trackName && t.trackName !== item.name) return false;
    return true;
  });
  if (loose) return loose;
  if (index != null && tracks[index]) {
    const t = tracks[index]!;
    const mid = midOf(t);
    if (mid && !used.has(mid) && (!t.trackName || t.trackName === item.name)) return t;
  }
  return undefined;
}

export function isRetryableSubError(detail: string): boolean {
  return /empty_track_error|not_found_track_error|retryable_transient_error|temporarily_unavailable_error|transport_unavailable_error/i.test(detail);
}


/** Append a precise cause to an already-friendly message, without repeating it. */
export function withErrorDetail(base: string, detail: string): string {
  const d = (detail || "").replace(/\s+/g, " ").trim();
  if (!d || d === "error" || !base || base.includes(d)) return base;
  return `${base} (${d})`;
}

export function genericErrorBanner(
  label: string,
  detail: string,
  phrases: {
    both: (label: string, detail: string) => string;
    detailOnly: (detail: string) => string;
    labelOnly: (label: string) => string;
    none: string;
  },
): string {
  const d = (detail || "").replace(/\s+/g, " ").trim();
  const clean = d && d !== "error" ? d : "";
  const l = (label || "").trim();
  if (clean && l) return phrases.both(l, clean);
  if (clean) return phrases.detailOnly(clean);
  if (l) return phrases.labelOnly(l);
  return phrases.none;
}

export function isSessionDisconnectError(e: unknown): boolean {
  const rec = asRecord(e);
  const msg = [
    mediaErrorDetail(e),
    e instanceof Error ? e.message : "",
    typeof e === "string" ? e : "",
    rec ? text(rec.errorCode, 80) : "",
    rec ? text(rec.errorDescription, 160) : "",
  ].join(" ").toLowerCase();
  return /session_error/.test(msg) && /disconnect/.test(msg);
}

/** Friendlier live-classroom lead-in; the precise SFU/WebRTC detail stays in parentheses. */
export function friendlyMediaPhrases(tr: (en: string, ar: string) => string): {
  both: (label: string, detail: string) => string;
  detailOnly: (detail: string) => string;
  labelOnly: (label: string) => string;
  none: string;
} {
  return {
    both: (l, d) => tr(`Couldn't connect your ${l}. (${d})`, `تعذّر توصيل ${l}. (${d})`),
    detailOnly: (d) => tr(`The call didn't connect. (${d})`, `لم يتصل البث. (${d})`),
    labelOnly: (l) => tr(`Couldn't connect your ${l}. Try again.`, `تعذّر توصيل ${l}. حاول مرة أخرى.`),
    none: tr("The call didn't connect. Try again.", "لم يتصل البث. حاول مرة أخرى."),
  };
}

export type LivePtrLike = { userId?: string; on?: boolean; name?: string };

/** Keep the latest pointer per user and drop empty or off entries. */
export function dedupeLivePtrs<T extends LivePtrLike>(list: T[]): T[] {
  const by = new Map<string, T>();
  for (const p of list || []) {
    const id = String(p.userId || "").trim();
    if (!id) continue;
    if (p.on === false) {
      by.delete(id);
      continue;
    }
    by.set(id, p);
  }
  return [...by.values()];
}

/** Drop pointers for people who have left (and dedupe by userId). */
export function pruneLivePtrs<T extends LivePtrLike>(list: T[], memberIds: Iterable<string>, extraKeep: Iterable<string> = []): T[] {
  const keep = new Set([...memberIds, ...extraKeep].map((id) => String(id)));
  return dedupeLivePtrs(list).filter((p) => keep.has(String(p.userId)));
}

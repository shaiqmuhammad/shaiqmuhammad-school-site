/** Normalize Cloudflare Realtime error JSON so the classroom client always gets a string `error` + `detail`. */

function text(v: unknown, max = 160): string {
  if (v == null || v === "") return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
}

type TrackErr = { trackName?: unknown; errorCode?: unknown; errorDescription?: unknown; mid?: unknown };

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

/** Ensure a non-2xx SFU response has `error` and `detail` strings the LMS client can show. */
export function normalizeSfuReply(status: number, json: Record<string, unknown> | undefined | null): { status: number; json: Record<string, unknown> } {
  const body = json && typeof json === "object" ? { ...json } : {};
  const failed = status < 200 || status >= 300;
  const detail = sfuResponseDetail(body);
  if (failed) {
    const err = text(body.error, 80) || text(body.errorCode, 80) || "sfu_error";
    body.error = err;
    if (detail) body.detail = detail;
  } else if (detail && !text(body.detail)) {
    body.detail = detail;
  }
  return { status, json: body };
}

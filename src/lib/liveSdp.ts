/** Keep SDP valid for RTCPeerConnection({ bundlePolicy: "max-bundle" }).
 * Chrome throws ERROR_CONTENT "max-bundle configured" on createOffer/setRemoteDescription
 * when the current description has m-lines but no a=group:BUNDLE, or the BUNDLE group
 * is missing a mid. Cloudflare Realtime answers must be applied with a complete group. */
export function ensureBundleSdp(sdp: string): string {
  if (!sdp) return sdp;
  const nl = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r?\n/);
  const mids: string[] = [];
  for (const line of lines) {
    const m = /^a=mid:(.+)/.exec(line);
    if (m) mids.push(m[1].trim());
  }
  if (!mids.length) return sdp;
  const bundle = `a=group:BUNDLE ${mids.join(" ")}`;
  const idx = lines.findIndex((l) => /^a=group:BUNDLE\b/.test(l));
  if (idx >= 0) {
    const existing = lines[idx].replace(/^a=group:BUNDLE\s*/, "").split(/\s+/).filter(Boolean);
    const merged = [...existing];
    for (const mid of mids) if (!merged.includes(mid)) merged.push(mid);
    lines[idx] = `a=group:BUNDLE ${merged.join(" ")}`;
    return lines.join(nl);
  }
  const t = lines.findIndex((l) => l.startsWith("t="));
  const firstM = lines.findIndex((l) => l.startsWith("m="));
  const at = t >= 0 ? t + 1 : firstM >= 0 ? firstM : lines.length;
  lines.splice(at, 0, bundle);
  return lines.join(nl);
}

export function sdpDesc(desc: unknown, fallback: RTCSdpType): RTCSessionDescriptionInit | null {
  if (!desc || typeof desc !== "object") return null;
  const d = desc as { type?: string; sdp?: string };
  if (!d.sdp) return null;
  const type: RTCSdpType = d.type === "offer" || d.type === "answer" || d.type === "pranswer" || d.type === "rollback" ? d.type : fallback;
  return { type, sdp: ensureBundleSdp(d.sdp) };
}

export function isMaxBundleError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /max-bundle|ERROR_CONTENT/i.test(m);
}

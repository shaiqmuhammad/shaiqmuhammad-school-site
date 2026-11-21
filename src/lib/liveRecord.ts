/** Host-side classroom recorder: mix camera or screen with classroom audio, upload modest WebM chunks. */

export const REC_TIMESLICE_MS = 8000;
export const MAX_REC_MS = 45 * 60 * 1000;

export function pickRecMime(): string {
  const types = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "audio/webm;codecs=opus"];
  if (typeof MediaRecorder === "undefined") return "video/webm";
  for (const t of types) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch { /* ignore */ }
  }
  return "video/webm";
}

export function mixRecStream(opts: { camera?: MediaStream | null; share?: MediaStream | null; remotes?: Record<string, MediaStream> }): { stream: MediaStream; close: () => void } | null {
  const video = opts.share?.getVideoTracks().find((t) => t.readyState !== "ended")
    || opts.camera?.getVideoTracks().find((t) => t.readyState !== "ended");
  const audios: MediaStreamTrack[] = [];
  for (const s of [opts.share, opts.camera]) {
    if (!s) continue;
    for (const t of s.getAudioTracks()) if (t.readyState !== "ended") audios.push(t);
  }
  if (opts.remotes) {
    for (const s of Object.values(opts.remotes)) {
      for (const t of s.getAudioTracks()) if (t.readyState !== "ended") audios.push(t);
    }
  }
  if (!video && !audios.length) return null;
  const stream = new MediaStream();
  if (video) stream.addTrack(video);
  if (audios.length <= 1) {
    audios.forEach((t) => stream.addTrack(t));
    return { stream, close: () => undefined };
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) {
    audios.slice(0, 1).forEach((t) => stream.addTrack(t));
    return { stream, close: () => undefined };
  }
  const ctx = new AC();
  const dest = ctx.createMediaStreamDestination();
  for (const t of audios) {
    try { ctx.createMediaStreamSource(new MediaStream([t])).connect(dest); } catch { /* ended track */ }
  }
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  return {
    stream,
    close: () => { try { void ctx.close(); } catch { /* ignore */ } },
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < buf.length; i += step) s += String.fromCharCode(...buf.subarray(i, i + step));
  return btoa(s);
}

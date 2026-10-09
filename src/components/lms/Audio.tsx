"use client";

import { useEffect, useRef, useState } from "react";
import { lmsApi, lmsErrorText } from "@/lib/lms";
import { smallBtn, useTr } from "@/components/lms/useLms";

const MAX_SECONDS = 180;
/** Opus in WebM (Chrome/Android/Firefox), MP4/AAC on Safari/iPhone. */
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return "";
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Record (max 3 min, ~24 kbps mono), listen back, then save. `onSave` uploads the blob. */
export function AudioRecorder({ label, onSave, testId = "rec" }: { label: string; onSave: (b: Blob) => Promise<void>; testId?: string }) {
  const { tr } = useTr();
  const [state, setState] = useState<"idle" | "rec" | "done" | "saving">("idle");
  const [secs, setSecs] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stream = useRef<MediaStream | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); stream.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const stop = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  const start = async () => {
    setErr("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setErr(tr("Recording isn't supported in this browser.", "التسجيل غير مدعوم في هذا المتصفح.")); return; }
    try {
      // Only the student's voice: stop/mute the reciter and any other audio before the mic opens.
      window.dispatchEvent(new Event("lms-rec-start"));
      document.querySelectorAll("audio").forEach((el) => { el.pause(); el.muted = true; });
      const s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const mime = pickMime();
      const r = new MediaRecorder(s, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
      const parts: Blob[] = [];
      r.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      r.onstop = () => {
        window.dispatchEvent(new Event("lms-rec-stop"));
        document.querySelectorAll("audio").forEach((el) => { el.muted = false; });
        if (timer.current) clearInterval(timer.current);
        s.getTracks().forEach((t) => t.stop());
        const b = new Blob(parts, { type: (r.mimeType || mime || "audio/webm").split(";")[0] });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState("done");
      };
      rec.current = r;
      r.start(1000);
      setSecs(0);
      setState("rec");
      const t0 = Date.now();
      timer.current = setInterval(() => {
        const sec = (Date.now() - t0) / 1000;
        setSecs(sec);
        if (sec >= MAX_SECONDS) stop();
      }, 250);
    } catch {
      window.dispatchEvent(new Event("lms-rec-stop"));
      document.querySelectorAll("audio").forEach((el) => { el.muted = false; });
      setErr(tr("Microphone permission is needed to record.", "يلزم السماح باستخدام الميكروفون للتسجيل."));
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-black/20 p-3 dark:border-white/25" data-testid={testId}>
      <p className="text-sm font-semibold">🎙️ {label}</p>
      {state === "idle" && <button type="button" className={smallBtn} onClick={start} data-testid={`${testId}-start`}>● {tr("Start recording", "ابدأ التسجيل")}</button>}
      {state === "rec" && (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 font-mono font-bold text-rose-600" aria-live="polite"><span className="h-3 w-3 animate-pulse rounded-full bg-rose-600" aria-hidden /> {mmss(secs)} / {mmss(MAX_SECONDS)}</span>
          <button type="button" className={smallBtn} onClick={stop} data-testid={`${testId}-stop`}>■ {tr("Stop", "إيقاف")}</button>
        </div>
      )}
      {(state === "done" || state === "saving") && blob && (
        <div className="space-y-2">
          <audio controls src={url} className="w-full" data-testid={`${testId}-preview`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={smallBtn} disabled={state === "saving"} onClick={async () => { setState("saving"); setErr(""); try { await onSave(blob); setBlob(null); setState("idle"); } catch (e) { setErr(lmsErrorText(e, tr)); setState("done"); } }} data-testid={`${testId}-save`}>
              {state === "saving" ? tr("Saving…", "جارٍ الحفظ…") : "⬆ " + tr("Save recording", "حفظ التسجيل")}
            </button>
            <button type="button" className={smallBtn} disabled={state === "saving"} onClick={() => { setBlob(null); setState("idle"); }} data-testid={`${testId}-redo`}>↺ {tr("Record again", "سجّل مجددًا")}</button>
            <span className="self-center text-xs opacity-60">{mmss(secs)} · {Math.round(blob.size / 1024)} KB</span>
          </div>
        </div>
      )}
      {err && <p className="text-sm text-rose-700 dark:text-rose-300" role="alert">{err}</p>}
    </div>
  );
}

/** Plays a stored recording (fetched with the session token) + download. */
export function AudioClip({ id, asAdmin = false, label, onDelete, testId = "clip" }: { id: string; asAdmin?: boolean; label?: string; onDelete?: () => void; testId?: string }) {
  const { tr } = useTr();
  const [src, setSrc] = useState<{ url: string; type: string } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => () => { if (src) URL.revokeObjectURL(src.url); }, [src]);
  const ext = src?.type.includes("mp4") ? "m4a" : src?.type.includes("ogg") ? "ogg" : "webm";
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      {label && <span className="text-sm font-semibold">{label}</span>}
      {!src ? (
        <button type="button" className={smallBtn} onClick={() => lmsApi.audioUrl(id, asAdmin).then(setSrc).catch((e) => setErr(lmsErrorText(e, tr)))} data-testid={`${testId}-load`}>▶ {tr("Play recording", "تشغيل التسجيل")}</button>
      ) : (
        <>
          <audio controls autoPlay src={src.url} className="h-10 max-w-full" data-testid={`${testId}-audio`} />
          <a className={smallBtn} href={src.url} download={`recording-${id}.${ext}`} data-testid={`${testId}-download`}>⬇ {tr("Download", "تنزيل")}</a>
        </>
      )}
      {onDelete && <button type="button" className={smallBtn + " text-rose-600"} onClick={onDelete} aria-label={tr("Delete recording", "حذف التسجيل")} title={tr("Delete recording", "حذف التسجيل")} data-testid={`${testId}-delete`}>🗑</button>}
      {err && <span className="text-sm text-rose-700">{err}</span>}
    </div>
  );
}

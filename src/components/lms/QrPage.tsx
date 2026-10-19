"use client";

import { FeedbackText, ScoreBadges, TrackerEntries } from "@/components/lms/QuranScores";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GRADE_STYLE, card, gradeLabel, useTr } from "@/components/lms/useLms";
import { lmsApi, quranChapters, type Chapter, type QrView, type QuranData } from "@/lib/lms";

/** Presentable, play-only audio card: big play button, waveform-style seek bar, time. No download (hidden element has nodownload; right-click blocked). */
function AudioCard({ src, title, name, at, testId }: { src: string; title?: string; name: string; at?: number; testId: string }) {
  const { tr, lang } = useTr();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const bars = Array.from({ length: 44 }, (_, i) => { let h = 0; for (const c of src + i) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 28 + (h % 72); });
  const fmt = (x: number) => (Number.isFinite(x) ? `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}` : "0:00");
  const toggle = () => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => { const a = ref.current; if (!a || !dur) return; const r = e.currentTarget.getBoundingClientRect(); const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); a.currentTime = (lang === "ar" ? 1 - f : f) * dur; };
  const frac = dur ? pos / dur : 0;
  return (
    <div className="rounded-3xl bg-gradient-to-br from-header to-[#1f4a73] p-4 text-white shadow-lg" data-testid={testId} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} aria-label={playing ? tr("Pause", "إيقاف مؤقت") : tr("Play", "تشغيل")} className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-sun text-3xl text-[#0b1b2b] shadow-md transition hover:scale-105 active:scale-95" data-testid={`${testId}-play`}>{playing ? "⏸" : "▶"}</button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold" dir="auto">{title || name}</p>
          <p className="truncate text-sm opacity-80" dir="auto">{title ? name : ""}{title && at ? " · " : ""}{at ? new Date(at).toLocaleDateString(lang === "ar" ? "ar" : undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}</p>
        </div>
      </div>
      <div className="mt-3 flex h-14 cursor-pointer items-center gap-[3px]" onClick={seek} role="slider" aria-label={tr("Seek", "تقديم")} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(pos)} data-testid={`${testId}-bar`}>
        {bars.map((h, i) => <span key={i} className={`w-full rounded-full ${i / bars.length < frac ? "bg-sun" : "bg-white/35"}`} style={{ height: `${h}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-xs tabular-nums opacity-80" dir="ltr"><span>{fmt(pos)}</span><span>{fmt(dur)}</span></div>
      <audio ref={ref} src={src} preload="metadata" controlsList="nodownload noplaybackrate" onContextMenu={(e) => e.preventDefault()} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setPos(0); }} onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onDurationChange={(e) => setDur(e.currentTarget.duration)} className="hidden" />
    </div>
  );
}

/**
 * Strictly isolated, read-only QR page: one student + one homework. No header/nav/footer, no links into the platform,
 * no submission. Data comes only from the token-scoped API.
 */
export function QrPage() {
  const { tr, lang } = useTr();
  const t = useSearchParams().get("t") || "";
  const [d, setD] = useState<QrView | null>(null);
  const [bad, setBad] = useState(false);
  const [ch, setCh] = useState<Chapter | undefined>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!t) { setBad(true); return; }
    lmsApi.qrView(t).then((v) => { setD(v); if (v.homework.kind === "quran") quranChapters().then((c) => setCh(c.find((x) => x.id === v.homework.data.surah))).catch(() => undefined); }).catch(() => setBad(true));
  }, [t]);
  const audio = (id: string, label: string, testId: string, at?: number) => <AudioCard key={id} src={lmsApi.qrAudioUrl(t, id)} title={label} name={d?.student || ""} at={at ?? d?.attempts.find((x) => x.audio === id)?.at} testId={testId} />;
  const q = d?.homework.data as QuranData | undefined;
  const verses = (x?: QuranData) => { const n = x?.from && x?.to ? x.to - x.from + 1 : ch?.verses_count || 0; return lang === "ar" ? `${n} ${n === 1 ? "آية" : "آيات"}` : `${n} ${n === 1 ? "verse" : "verses"}`; };
  return (
    <main className="min-h-dvh bg-gradient-to-b from-sky-50 to-white px-3 py-6 text-header dark:from-[#0b1622] dark:to-[#0f1a26] dark:text-white" data-testid="qr-page">
      <div className="mx-auto max-w-3xl space-y-4">
        {bad ? (
          <p className={card + " text-center"} data-testid="qr-invalid">{tr("This QR code is not valid or was turned off. Please ask your teacher for a new card.", "رمز QR هذا غير صالح أو تم إيقافه. اطلب بطاقة جديدة من معلمك.")}</p>
        ) : !d ? (
          <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : (
          <>
            <header className="rounded-3xl bg-header px-5 py-5 text-center text-white shadow-lg">
              <p className="text-sm font-semibold tracking-wide text-sun">{d.homework.kind === "quran" ? tr("Quran homework", "واجب القرآن") : tr("Homework", "واجب")}</p>
              <h1 className="mt-1 text-3xl font-extrabold" dir="auto" data-testid="qr-student">{d.student}</h1>
              <p className="opacity-80">{[d.cls, d.section].filter(Boolean).join(" · ")}</p>
              <p className="mt-2 text-lg font-bold" dir="auto">
                {d.homework.kind === "quran" && ch ? `${lang === "ar" ? `سورة ${ch.name_arabic}` : `Surah ${ch.name_simple}`} · ${verses(q)}` : d.homework.title}
              </p>
              {d.grade ? <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${GRADE_STYLE[d.grade]}`} data-testid="qr-grade">{gradeLabel(d.grade, tr)}</span> : null}
              {d.scores && <div className="mt-3 space-y-2"><ScoreBadges s={d.scores} /><FeedbackText s={d.scores} /></div>}
            </header>
                        <section className={card + " space-y-3"}>
              <h2 className="text-xl font-bold">🎙️ {tr("My recitation", "تلاوتي")}</h2>
              {d.recordings.length ? d.recordings.map((id, i) => audio(id, d.recordings.length > 1 ? tr(`Recording ${i + 1}`, `التسجيل ${i + 1}`) : "", "qr-rec")) : <p className="opacity-70">{tr("No recording yet.", "لا يوجد تسجيل بعد.")}</p>}
            </section>
            <section className={card + " space-y-3"}>
              <h2 className="text-xl font-bold">💬 {tr("Teacher's feedback", "ملاحظات المعلم")}</h2>
              {d.feedback.length ? d.feedback.map((c, i) => (
                <div key={i} className="space-y-1 rounded-2xl bg-sky-50 px-3 py-2 dark:bg-sky-900/30" data-testid="qr-feedback">
                  <p dir="auto"><b>{c.by}:</b> {c.text}</p>
                  {c.audio && audio(c.audio, tr("Voice feedback", "تعليق صوتي"), "qr-fb-audio", c.at)}
                </div>
              )) : <p className="opacity-70">{tr("No feedback yet.", "لا ملاحظات بعد.")}</p>}
            </section>
            {d.homework.kind === "quran" && (
              <section className={card + " space-y-2"}>
                <h2 className="text-xl font-bold">📈 {tr("Tracker", "متابعة الحفظ")}</h2>
                {d.tracker.length ? (
                  <div data-testid="qr-tracker"><TrackerEntries rows={d.tracker} surahName={() => ch?.name_simple || ""} /></div>
                ) : <p className="opacity-70">{tr("Not graded yet.", "لم يُقيّم بعد.")}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

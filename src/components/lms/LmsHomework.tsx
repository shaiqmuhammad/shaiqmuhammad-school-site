"use client";

import { Amiri_Quran } from "next/font/google";


import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { NeedLogin } from "@/components/lms/LmsDashboard";
import { AudioClip, AudioRecorder } from "@/components/lms/Audio";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { studentQrCardsPdf } from "@/components/lms/lmsFiles";
import { GRADE_STYLE, STATUS_STYLE, card, gradeLabel, inputCls, smallBtn, statusLabel, useLmsActor, useTr } from "@/components/lms/useLms";
import { quranExtras, ayahAudio, lmsApi, lmsErrorText, quranChapters, quranVerses, type Chapter, type GeneralData, type QuranData, type Submission, type Attempt, type Mistake, type QrLink, type Catalog, type DashStudent } from "@/lib/lms";

const quranFont = Amiri_Quran({ weight: "400", subsets: ["arabic"], display: "swap" });

type Data = Awaited<ReturnType<typeof lmsApi.homework>>;

export function QuranReader({ data, mistakes = [], onMarkWord }: { data: QuranData; mistakes?: Mistake[]; onMarkWord?: (ayah: number, word: number, text: string) => void }) {
  const { tr, lang } = useTr();
  const [verses, setVerses] = useState<{ n: number; text: string }[] | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  useEffect(() => { quranChapters().then((c) => setChapter(c.find((x) => x.id === data.surah) || null)).catch(() => undefined); }, [data.surah]);
  const [extras, setExtras] = useState<Map<number, { translit: string; translation: string }> | null>(null);
  const wantExtras = !!(data.translit || data.translation);
  useEffect(() => {
    if (wantExtras) quranExtras(data.surah, data.from, data.to, lang === "ar" ? "ar" : "en").then(setExtras).catch(() => setExtras(new Map()));
  }, [wantExtras, data.surah, data.from, data.to, lang]);
  useEffect(() => {
    quranVerses(data.surah, data.from, data.to).then(setVerses).catch(() => setVerses([]));
    return () => audio.current?.pause();
  }, [data.surah, data.from, data.to]);
  // While the student records, the reciter is stopped and can't be started (recording = student's voice only).
  useEffect(() => {
    const on = () => { audio.current?.pause(); setPlaying(null); setAll(false); setRecording(true); };
    const off = () => setRecording(false);
    window.addEventListener("lms-rec-start", on);
    window.addEventListener("lms-rec-stop", off);
    return () => { window.removeEventListener("lms-rec-start", on); window.removeEventListener("lms-rec-stop", off); };
  }, []);
  // Repeat-after-me: each verse plays ×repeat with a short pause to repeat it aloud.
  const [repeat, setRepeat] = useState(1);
  const [hide, setHide] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const play = (n: number, chain: boolean, left = repeat) => {
    audio.current?.pause();
    if (recording) return;
    const a = new Audio(ayahAudio(data.reciter, data.surah, n));
    audio.current = a;
    setPlaying(n);
    a.onended = () => {
      if (left > 1) { setTimeout(() => { if (audio.current === a) play(n, chain, left - 1); }, 1800); return; }
      if (chain && n < data.to) play(n + 1, true);
      else {
        setPlaying(null);
        setAll(false);
      }
    };
    a.play().catch(() => setPlaying(null));
  };
  const perVerse = !!(data.translit || data.translation);
  const words = (v: { n: number; text: string }) =>
    v.text.split(/\s+/).map((w, i) => {
      const key = `${v.n}:${i}`;
      const m = mistakes.find((x) => x.ayah === v.n && x.word === i);
      const hidden = hide && !shown.has(key);
      return (
        <span key={i}>
          <span
            className={`${hidden ? "rounded bg-current/10 blur-[7px] select-none" : ""} ${m ? "mushaf-mistake" : ""} ${onMarkWord ? "cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/40" : ""}`}
            title={m ? `✏️ ${m.note || tr("Check this word", "راجع هذه الكلمة")}` : undefined}
            onClick={(e) => {
              if (onMarkWord) { e.stopPropagation(); onMarkWord(v.n, i, w); }
              else if (hidden) { e.stopPropagation(); setShown((x) => new Set(x).add(key)); }
            }}
            data-testid={m ? "quran-mistake" : hidden ? "quran-hidden-word" : undefined}
          >{w}</span>{" "}
        </span>
      );
    });
  const arNum = (n: number) => n.toLocaleString("ar-EG");
  const showBismillah = data.from === 1 && data.surah !== 1 && data.surah !== 9;
  return (
    <section className="space-y-3" data-testid="quran-reader">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallBtn} onClick={() => { if (all) { audio.current?.pause(); setAll(false); setPlaying(null); } else { setAll(true); play(data.from, true); } }} data-testid="quran-play-all">
          {all ? "⏹ " + tr("Stop", "إيقاف") : "▶ " + tr("Listen to all", "استمع للكل")}
        </button>
        <label className="flex items-center gap-1 text-sm font-semibold">🔁 {tr("Repeat", "كرر")}
          <select className="rounded-full border border-black/15 bg-transparent px-2 py-1 dark:border-white/20" value={repeat} onChange={(e) => { setRepeat(Number(e.target.value)); if (Number(e.target.value) > 1) lmsApi.practice().catch(() => undefined); }} data-testid="quran-repeat" aria-label={tr("Repeat each verse", "كرر كل آية")}>
            <option value={1}>×1</option><option value={3}>×3</option><option value={5}>×5</option>
          </select>
        </label>
        <button type="button" className={smallBtn} aria-pressed={hide} onClick={() => { setHide(!hide); setShown(new Set()); if (!hide) lmsApi.practice().catch(() => undefined); }} data-testid="quran-hide">{hide ? "👁 " + tr("Show words", "أظهر الكلمات") : "🙈 " + tr("Test myself", "اختبر نفسي")}</button>
        <span className="text-sm opacity-70" data-testid="quran-hint">{recording ? "🎙️ " + tr("Recording — the reciter is paused.", "جارٍ التسجيل — القارئ متوقف.") : tr("Tap a verse to hear it.", "اضغط على الآية لسماعها.")}</span>
      </div>
      {/* Mushaf page: cream paper, double gold frame with corner ornaments, surah cartouche, bismillah. */}
      <div className="mushaf relative rounded-[1.25rem] p-2 sm:p-3" data-testid="mushaf">
        <div className="mushaf-frame relative rounded-2xl px-3 py-5 sm:px-8 sm:py-7">
          {["top-1 left-1", "top-1 right-1", "bottom-1 left-1", "bottom-1 right-1"].map((pos) => (
            <span key={pos} aria-hidden className={`mushaf-corner absolute ${pos}`}>❁</span>
          ))}
          <div className="mushaf-cartouche mx-auto mb-4 flex max-w-md items-center justify-center gap-3 rounded-full px-5 py-2" data-testid="mushaf-header">
            <span aria-hidden className="mushaf-gold">۞</span>
            <span className={`${quranFont.className} text-2xl sm:text-3xl`} dir="rtl">سُورَةُ {chapter?.name_arabic || ""}</span>
            <span className="text-xs font-bold uppercase tracking-wider opacity-70">{chapter?.name_simple} · {data.from}–{data.to}</span>
            <span aria-hidden className="mushaf-gold">۞</span>
          </div>
          {showBismillah && <p className={`${quranFont.className} mb-3 text-center text-2xl sm:text-3xl`} dir="rtl" data-testid="mushaf-bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>}
          {!verses ? (
            <p className="text-center opacity-70">{tr("Loading verses…", "جارٍ تحميل الآيات…")}</p>
          ) : verses.length === 0 ? (
            <p className="text-center opacity-70">{tr("Couldn't load the verses — check your connection.", "تعذر تحميل الآيات — تحقق من الاتصال.")}</p>
          ) : perVerse ? (
            <ol className="space-y-3" dir="rtl">
              {verses.map((v) => (
                <li key={v.n} className="border-b border-[color:var(--mushaf-gold)]/30 pb-2 last:border-0">
                  <button type="button" onClick={() => play(v.n, false)} className={`${quranFont.className} w-full rounded-xl px-2 text-right text-[1.7rem] leading-[2.4] transition sm:text-3xl ${playing === v.n ? "mushaf-active" : "hover:bg-black/5 dark:hover:bg-white/5"}`} data-testid="quran-verse">
                    {words(v)}<span className="mushaf-ayah" aria-label={tr(`verse ${v.n}`, `الآية ${v.n}`)}>{arNum(v.n)}</span>
                  </button>
                  {data.translit && extras?.get(v.n)?.translit && <p className="px-2 text-left text-base italic opacity-80" dir="ltr" data-testid="quran-translit">{extras.get(v.n)!.translit}</p>}
                  {data.translation && extras?.get(v.n)?.translation && <p className={`px-2 text-sm opacity-75 ${lang === "ar" ? "text-right" : "text-left"}`} dir={lang === "ar" ? "rtl" : "ltr"} data-testid="quran-translation">{extras.get(v.n)!.translation}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <p className={`${quranFont.className} text-justify text-[1.7rem] leading-[2.5] [text-align-last:center] sm:text-3xl sm:leading-[2.6]`} dir="rtl">
              {verses.map((v) => (
                <span key={v.n} role="button" tabIndex={0} onClick={() => play(v.n, false)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(v.n, false); } }} className={`cursor-pointer rounded-lg px-0.5 transition ${playing === v.n ? "mushaf-active" : "hover:bg-black/5 dark:hover:bg-white/5"}`} data-testid="quran-verse">
                  {words(v)}<span className="mushaf-ayah" aria-label={tr(`verse ${v.n}`, `الآية ${v.n}`)}>{arNum(v.n)}</span>{" "}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Slides({ data }: { data: GeneralData }) {
  const { tr } = useTr();
  const [i, setI] = useState(0);
  const s = data.slides[i];
  if (!data.slides.length) return null;
  return (
    <section className={card} data-testid="hw-slides">
      <div className="flex items-center justify-between text-sm font-bold opacity-70">
        <span>{tr(`Slide ${i + 1} of ${data.slides.length}`, `الشريحة ${i + 1} من ${data.slides.length}`)}</span>
      </div>
      {s.title && <h2 className="mt-2 text-2xl font-bold" dir="auto">{s.title}</h2>}
      {s.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} alt="" className="mt-3 max-h-[50vh] w-full rounded-2xl object-contain" />
      )}
      {s.text && <p className="mt-3 whitespace-pre-wrap text-lg leading-relaxed" dir="auto">{s.text}</p>}
      <div className="mt-4 flex justify-between">
        <button type="button" className={smallBtn} disabled={i === 0} onClick={() => setI(i - 1)} data-testid="slide-prev">← {tr("Back", "السابق")}</button>
        <button type="button" className={smallBtn} disabled={i >= data.slides.length - 1} onClick={() => setI(i + 1)} data-testid="slide-next">{tr("Next", "التالي")} →</button>
      </div>
    </section>
  );
}

function Comments({ sub }: { sub: Submission }) {
  const { tr } = useTr();
  if (!sub.comments.length && !sub.liked) return null;
  return (
    <div className="mt-3 space-y-2">
      {sub.liked && <p className="font-semibold" data-testid="hw-liked">❤️ {tr("Your teacher liked this", "أعجب معلمك بهذا")}</p>}
      {sub.comments.map((c, i) => (
        <div key={i} className="rounded-2xl bg-sky-50 px-3 py-2 dark:bg-sky-900/30" dir="auto" data-testid="hw-comment"><b>{c.by}:</b> {c.text}{c.audio && <AudioClip id={c.audio} label={"🎙️ " + tr("Voice feedback", "تعليق صوتي")} testId="fb-clip" />}</div>
      ))}
    </div>
  );
}

function StudentWork({ hw, sub, reload, chapters = [] }: { hw: Data["homework"]; sub: Submission | null; reload: () => void; chapters?: Chapter[] }) {
  const { tr } = useTr();
  const lockName = (n: number, l: "en" | "ar") => { const c = chapters.find((x) => x.id === n); return c ? (l === "ar" ? c.name_arabic : c.name_simple) : String(n); };
  const [text, setText] = useState(sub?.text || "");
  const [practised, setPractised] = useState(sub?.practised || false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = sub?.status === "approved" || !!hw.locked;
  const again = hw.kind === "quran" && sub?.grade === "red" && sub.status === "returned";
  const save = async (submit: boolean) => {
    setBusy(true);
    setMsg("");
    try {
      await lmsApi.saveSub(hw.id, text, practised, submit);
      setMsg(submit ? tr("Sent to your teacher ✓", "أُرسل إلى معلمك ✓") : tr("Saved ✓", "تم الحفظ ✓"));
      reload();
    } catch (e) {
      setMsg(lmsErrorText(e, tr));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={card + " space-y-3"} data-testid="hw-student-work">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-bold">{tr("My work", "عملي")}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[sub?.status || "none"]}`} data-testid="hw-status">{statusLabel(sub?.status || "none", tr)}</span>
        {sub?.grade && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_STYLE[sub.grade]}`} data-testid="hw-grade">{gradeLabel(sub.grade, tr)}</span>}
      </div>
      {hw.locked && <p className="rounded-2xl bg-black/5 px-3 py-2 font-semibold dark:bg-white/10" data-testid="hw-locked">🔒 {hw.lockedBy ? tr(`Finish Surah ${lockName(hw.lockedBy.surah, "en")} verses ${hw.lockedBy.from}–${hw.lockedBy.to} first — your teacher must pass them (green or yellow).`, `أكمل سورة ${lockName(hw.lockedBy.surah, "ar")} الآيات ${hw.lockedBy.from}–${hw.lockedBy.to} أولًا — يجب أن يجتازها معلمك (أخضر أو أصفر).`) : tr("Finish the earlier verses first — your teacher must pass them (green or yellow).", "أكمل الآيات السابقة أولًا — يجب أن يجتازها معلمك (أخضر أو أصفر).")}</p>}
      {again && <p className="rounded-2xl bg-rose-50 px-3 py-2 font-semibold text-rose-900 dark:bg-rose-900/30 dark:text-rose-100" data-testid="hw-practise-again">🔴 {tr("Practise again: same verses. Listen to your teacher's feedback, practise, then record again and hand in.", "تدرّب مجددًا: نفس الآيات. استمع لتعليق معلمك، تدرّب، ثم سجّل مجددًا وسلّم.")}</p>}
      {sub?.status === "approved" && sub.grade && <p className="rounded-2xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100" data-testid="hw-passed">🎉 {tr("Passed! You can move on to the next verses.", "نجحت! يمكنك الانتقال إلى الآيات التالية.")}</p>}
      {hw.kind === "quran" ? (
        <>
          <label className="flex items-center gap-2 text-lg font-semibold">
            <input type="checkbox" className="h-6 w-6" checked={practised} disabled={locked} onChange={(e) => setPractised(e.target.checked)} data-testid="hw-practised" /> {tr("I have practised these verses", "تدرّبت على هذه الآيات")}
          </label>
          {sub?.audio ? (
            <AudioClip id={sub.audio} label={"🎙️ " + tr("My recitation", "تلاوتي")} testId="my-rec" onDelete={locked ? undefined : async () => { if (confirm(tr("Delete this recording?", "حذف هذا التسجيل؟"))) { await lmsApi.audioDelete(sub.audio!).catch(() => undefined); reload(); } }} />
          ) : null}
{sub?.audio && sub.status === "submitted" && <p className="font-semibold text-emerald-700 dark:text-emerald-300" data-testid="rec-sent">✓ {tr("Sent to teacher", "أُرسل للمعلم")}</p>}
          {!locked && sub?.status !== "approved" && <AudioRecorder label={sub?.audio ? tr("Record again (replaces the old one)", "سجّل مجددًا (يستبدل القديم)") : tr("Record your recitation (up to 3 minutes)", "سجّل تلاوتك (حتى 3 دقائق)")} testId="rec-student" saveLabel={tr("Send to teacher", "أرسل للمعلم")} onSave={async (b) => { await lmsApi.audioUpload({ hw: hw.id }, b); reload(); }} />}
        </>
      ) : (
        <>
          {(hw.data as GeneralData).question && <p className="text-lg font-semibold" dir="auto">{(hw.data as GeneralData).question}</p>}
          {sub?.audio && <AudioClip id={sub.audio} label={"🎙️ " + tr("My audio answer", "إجابتي الصوتية")} testId="my-rec" onDelete={locked ? undefined : async () => { if (confirm(tr("Delete this recording?", "حذف هذا التسجيل؟"))) { await lmsApi.audioDelete(sub.audio!).catch(() => undefined); reload(); } }} />}
{sub?.audio && sub.status === "submitted" && <p className="font-semibold text-emerald-700 dark:text-emerald-300" data-testid="rec-sent">✓ {tr("Sent to teacher", "أُرسل للمعلم")}</p>}
          {!locked && sub?.status !== "approved" && <AudioRecorder label={tr("Audio answer (optional, up to 3 minutes)", "إجابة صوتية (اختياري، حتى 3 دقائق)")} testId="rec-student" saveLabel={tr("Send to teacher", "أرسل للمعلم")} onSave={async (b) => { await lmsApi.audioUpload({ hw: hw.id }, b); reload(); }} />}
        </>
      )}
      <textarea className={inputCls + " min-h-28"} value={text} onChange={(e) => setText(e.target.value)} disabled={locked} maxLength={4000} dir="auto" placeholder={hw.kind === "quran" ? tr("A note for your teacher (optional)", "ملاحظة لمعلمك (اختياري)") : tr("Your answer", "إجابتك")} data-testid="hw-text" />
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} disabled={busy || (hw.kind === "general" ? !text.trim() : !practised)} onClick={() => save(true)} data-testid="hw-submit">{tr("Hand in", "تسليم")}</button>
          <button type="button" className={smallBtn} disabled={busy} onClick={() => save(false)} data-testid="hw-draft">{tr("Save for later", "حفظ لاحقًا")}</button>
        </div>
      )}
      {msg && <p className="font-semibold" role="status" data-testid="hw-msg">{msg}</p>}
      {sub && <Comments sub={sub} />}
      {sub?.attempts && sub.attempts.length > 0 && <Attempts list={sub.attempts} />}
    </section>
  );
}

function Attempts({ list, asAdmin = false }: { list: Attempt[]; asAdmin?: boolean }) {
  const { tr } = useTr();
  return (
    <details className="rounded-2xl bg-black/[0.03] px-3 py-2 dark:bg-white/5" data-testid="hw-attempts">
      <summary className="cursor-pointer text-sm font-bold">{tr(`Attempt history (${list.length})`, `سجل المحاولات (${list.length})`)}</summary>
      <ol className="mt-2 space-y-2">
        {[...list].reverse().map((x) => (
          <li key={x.n} className="flex flex-wrap items-center gap-2 text-sm" data-testid="hw-attempt">
            <b>#{x.n}</b>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${GRADE_STYLE[x.grade]}`}>{gradeLabel(x.grade, tr)}</span>
            <span className="opacity-60">{x.by} · {new Date(x.at).toLocaleDateString()}</span>
            {x.audio && <AudioClip id={x.audio} asAdmin={asAdmin} testId="attempt-clip" />}
          </li>
        ))}
      </ol>
    </details>
  );
}

const PRESETS: [string, string][] = [
  ["MashaAllah, excellent recitation! 🌟", "ما شاء الله، تلاوة ممتازة! 🌟"],
  ["Very good — keep practising daily.", "جيد جدًا — استمر في التدريب يوميًا."],
  ["Please check your tajweed (makharij) and try again.", "يرجى مراجعة التجويد (المخارج) والمحاولة مجددًا."],
  ["Watch the stops (waqf) at the end of each verse.", "انتبه للوقف في نهاية كل آية."],
  ["Recite slowly and clearly.", "اقرأ ببطء ووضوح."],
  ["Great effort! Listen to the reciter again before recording.", "جهد رائع! استمع للقارئ مرة أخرى قبل التسجيل."],
];

function Review({ s, asAdmin, reload, quran, qdata }: { s: NonNullable<Data["subs"]>[number]; asAdmin: boolean; reload: () => void; quran: boolean; qdata?: QuranData }) {
  const { tr } = useTr();
  const [marking, setMarking] = useState(false);
  const [mistakes, setMistakes] = useState<Mistake[]>(s.mistakes || []);
  const toggleWord = async (ayah: number, word: number, text: string) => {
    const exists = mistakes.find((m) => m.ayah === ayah && m.word === word);
    let next: Mistake[];
    if (exists) next = mistakes.filter((m) => m !== exists);
    else {
      const note = window.prompt(tr(`Note for “${text}” (optional)`, `ملاحظة على «${text}» (اختياري)`), "");
      if (note === null) return;
      next = [...mistakes, { ayah, word, text, note }];
    }
    setMistakes(next);
    await lmsApi.saveMistakes(s.id, next, asAdmin).catch(() => undefined);
  };
  const [c, setC] = useState("");
  const act = async (patch: Parameters<typeof lmsApi.review>[1]) => {
    await lmsApi.review(s.id, patch, asAdmin).catch(() => undefined);
    setC("");
    reload();
  };
  return (
    <li className={card + " space-y-2"} data-testid="hw-sub">
      <div className="flex flex-wrap items-center gap-2">
        <b dir="auto">{s.name}</b>
        <span className="text-sm opacity-60">{s.cls}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[s.status]}`} data-testid="hw-sub-status">{statusLabel(s.status, tr)}</span>
        {s.practised && <span className="text-sm">✅ {tr("practised", "تدرّب")}</span>}
        <span className="flex-1" />
        <button type="button" className={smallBtn} onClick={() => act({ like: !s.liked })} aria-pressed={s.liked} data-testid="hw-like">{s.liked ? "❤️" : "🤍"} {tr("Like", "إعجاب")}</button>
        {s.grade && <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_STYLE[s.grade]}`} data-testid="hw-sub-grade">{gradeLabel(s.grade, tr)}</span>}
        {quran ? (
          s.status === "submitted" && (
            <span className="inline-flex flex-wrap gap-1" role="group" aria-label={tr("Grade", "التقييم")}>
              <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-bold ${GRADE_STYLE.green}`} onClick={() => act({ grade: "green" })} title={tr("Memorised perfectly — passed", "محفوظ تمامًا — ناجح")} data-testid="hw-grade-green">🟢 {tr("Green", "أخضر")}</button>
              <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-bold ${GRADE_STYLE.yellow}`} onClick={() => act({ grade: "yellow" })} title={tr("Good, minor improvement — passed", "جيد مع تحسين بسيط — ناجح")} data-testid="hw-grade-yellow">🟡 {tr("Yellow", "أصفر")}</button>
              <button type="button" className={`rounded-full px-3 py-1.5 text-sm font-bold ${GRADE_STYLE.red}`} onClick={() => act({ grade: "red" })} title={tr("Needs practice — back to the student", "يحتاج تدريبًا — يعود للطالب")} data-testid="hw-grade-red">🔴 {tr("Red", "أحمر")}</button>
            </span>
          )
        ) : s.status !== "approved" && <button type="button" className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white" onClick={() => act({ status: "approved" })} data-testid="hw-approve">✓ {tr("Approve", "قبول")}</button>}
        {!quran && s.status !== "returned" && <button type="button" className={smallBtn} onClick={() => act({ status: "returned" })} data-testid="hw-return">↺ {tr("Ask to try again", "اطلب المحاولة مجددًا")}</button>}
      </div>
      {s.text && <p className="whitespace-pre-wrap rounded-2xl bg-white/80 px-3 py-2 dark:bg-white/5" dir="auto">{s.text}</p>}
      {s.audio && <AudioClip id={s.audio} asAdmin={asAdmin} label={"🎙️ " + tr("Student recording", "تسجيل الطالب")} testId="sub-clip" />}
      {s.comments.map((x, i) => (
        <div key={i} className="text-sm" dir="auto"><b>{x.by}:</b> {x.text}{x.audio && <AudioClip id={x.audio} asAdmin={asAdmin} label={"🎙️ " + tr("Voice feedback", "تعليق صوتي")} testId="fb-clip" onDelete={async () => { if (confirm(tr("Delete this voice feedback?", "حذف هذا التعليق الصوتي؟"))) { await lmsApi.audioDelete(x.audio!, asAdmin).catch(() => undefined); reload(); } }} />}</div>
      ))}
      {s.attempts && s.attempts.length > 0 && <Attempts list={s.attempts} asAdmin={asAdmin} />}
      <AudioRecorder label={tr("Record voice feedback (up to 3 minutes)", "سجّل تعليقًا صوتيًا (حتى 3 دقائق)")} testId="rec-teacher" onSave={async (b) => { await lmsApi.audioUpload({ sub: s.id }, b, asAdmin); reload(); }} />
      {quran && qdata && (
        <div className="space-y-2">
          <button type="button" className={smallBtn} aria-pressed={marking} onClick={() => setMarking(!marking)} data-testid="hw-mark-mistakes">✏️ {marking ? tr("Done marking", "إنهاء التحديد") : tr(`Mark mistakes${mistakes.length ? ` (${mistakes.length})` : ""}`, `حدّد الأخطاء${mistakes.length ? ` (${mistakes.length})` : ""}`)}</button>
          {marking && <><p className="text-sm opacity-70">{tr("Tap a word to mark it (tap again to remove).", "اضغط على كلمة لتحديدها (اضغط مجددًا للإزالة).")}</p><QuranReader data={qdata} mistakes={mistakes} onMarkWord={toggleWord} /></>}
          {!marking && mistakes.length > 0 && <ul className="text-sm" dir="auto">{mistakes.map((m, i) => <li key={i}>✏️ {tr("Verse", "آية")} {m.ayah}: <b>{m.text}</b>{m.note ? ` — ${m.note}` : ""}</li>)}</ul>}
        </div>
      )}
      <div className="flex flex-wrap gap-1" data-testid="hw-presets">
        {PRESETS.map(([en, ar]) => <button key={en} type="button" className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold hover:bg-sun/40 dark:bg-white/10" onClick={() => act({ comment: tr(en, ar) })} data-testid="hw-preset">{tr(en, ar)}</button>)}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (c.trim()) act({ comment: c.trim() }); }}>
        <input className={inputCls + " mt-0"} value={c} onChange={(e) => setC(e.target.value)} placeholder={tr("Write a comment…", "اكتب تعليقًا…")} dir="auto" data-testid="hw-comment-input" />
        <button type="submit" className={smallBtn} disabled={!c.trim()}>{tr("Send", "أرسل")}</button>
      </form>
    </li>
  );
}

/** One homework: student does it; teacher sees every submission and reviews. */
export function LmsHomework() {
  const { tr, lang } = useTr();
  const router = useRouter();
  const id = useSearchParams().get("id") || "";
  const { actor, asAdmin, ready, adminElsewhere } = useLmsActor();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [extra, setExtra] = useState<{ classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[] }>({ classes: [], students: [] });
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const load = useCallback(() => {
    lmsApi.homework(id, asAdmin).then(setD).catch((e) => setErr(lmsErrorText(e, tr)));
  }, [id, asAdmin, tr]);
  useEffect(() => {
    if (!ready) return;
    if (!actor) return;
    load();
    quranChapters().then(setChapters);
  }, [ready, actor, id, load, router]);

  const staff = actor?.role === "teacher" || actor?.role === "admin";
  const hw = d?.homework;
  const q = hw?.data as QuranData | undefined;
  const ch = q ? chapters.find((c) => c.id === q.surah) : undefined;
  const subtitle = hw?.kind === "quran" && q ? `${ch?.name_simple || `Surah ${q.surah}`} ${ch?.name_arabic || ""} · ${q.from}–${q.to}` : hw?.cls || "";

  if (ready && !actor) return <NeedLogin adminElsewhere={adminElsewhere} />;

  return (
    <AssessmentShell title={hw?.title || tr("Homework", "واجب")} exitHref="/lms" wide={staff} toolbar={actor ? <LmsStaffToolbar /> : undefined}>
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-3 py-5 sm:px-6" data-testid="lms-homework">
        {err && <p className="rounded-xl bg-rose-100 px-4 py-2 text-rose-800" role="alert">{err}</p>}
        {!hw ? (
          !err && <p className="p-10 text-center opacity-70">{tr("Loading…", "جارٍ التحميل…")}</p>
        ) : (
          <>
            <header className="space-y-1">
              <h1 className="text-3xl font-bold" dir="auto">{hw.title}</h1>
              <p className="opacity-80">
                {subtitle}
                {hw.due ? ` · ${tr("due", "التسليم")} ${new Date(hw.due).toLocaleDateString(lang === "ar" ? "ar" : "en-GB")}` : ""}
              </p>
              {hw.kind === "quran" && q?.notes && <p className="rounded-2xl bg-amber-50 px-3 py-2 dark:bg-amber-900/30" dir="auto">📌 {q.notes}</p>}
            </header>
            {staff && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={smallBtn} onClick={async () => { try { const r = await lmsApi.qrLinks(hw.id, {}, asAdmin); await studentQrCardsPdf(hw, { surahEn: ch?.name_simple, surahAr: ch?.name_arabic, verses: q ? `${tr("verses", "الآيات")} ${q.from}–${q.to}` : "", teacher: r.teacher, links: r.links }); } catch { setErr(tr("Couldn't make the QR cards.", "تعذر إنشاء بطاقات QR.")); } }} data-testid="hw-qr-pdf">🔳 {tr("Student QR cards (PDF)", "بطاقات QR للطلاب (PDF)")}</button>
                <QrLinks hwId={hw.id} asAdmin={asAdmin} />
                {hw.kind === "quran" && <LockList hwId={hw.id} asAdmin={asAdmin} />}
                <button
                  type="button"
                  className={smallBtn}
                  onClick={async () => {
                    const dd = await lmsApi.dashboard(asAdmin).catch(() => null);
                    if (dd) setExtra({ classes: dd.classes || [], students: dd.students || [], catalog: dd.catalog, scope: dd.scope });
                    setEditing(true);
                  }}
                  data-testid="hw-edit"
                >
                  ✏️ {tr("Edit", "تعديل")}
                </button>
                <button
                  type="button"
                  className={smallBtn + " text-rose-600"}
                  onClick={async () => {
                    if (!confirm(tr("Delete this homework and all submissions?", "حذف هذا الواجب وكل التسليمات؟"))) return;
                    await lmsApi.deleteHomework(hw.id, asAdmin).catch(() => undefined);
                    router.push("/lms");
                  }}
                  data-testid="hw-delete"
                >
                  🗑 {tr("Delete", "حذف")}
                </button>
              </div>
            )}
            {editing && <HomeworkEditor initial={hw} classes={extra.classes} students={extra.students} catalog={extra.catalog} scope={extra.scope} asAdmin={asAdmin} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
            {hw.kind === "quran" ? <QuranReader data={hw.data as QuranData} mistakes={(d.sub?.mistakes || [])} /> : <Slides data={hw.data as GeneralData} />}
            {!staff && <StudentWork key={d?.sub?.updated || 0} hw={hw} sub={d?.sub || null} reload={load} chapters={chapters} />}
            {staff && (
              <section className="space-y-3">
                <h2 className="text-xl font-bold">{tr("Submissions", "التسليمات")} ({d?.subs?.length || 0})</h2>
                <ul className="space-y-3">
                  {(d?.subs || []).map((s) => (
                    <Review quran={d.homework.kind === "quran"} qdata={d.homework.kind === "quran" ? (d.homework.data as QuranData) : undefined} key={s.id + s.updated} s={s} asAdmin={asAdmin} reload={load} />
                  ))}
                </ul>
                {(d?.notStarted || []).length > 0 && (
                  <p className="text-sm opacity-75" data-testid="hw-not-started">{tr("Not started:", "لم يبدؤوا:")} {d!.notStarted!.map((n) => n.name).join(", ")}</p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AssessmentShell>
  );
}

/** Per-student QR links (read-only token pages): open, regenerate or turn off. */
function QrLinks({ hwId, asAdmin }: { hwId: string; asAdmin: boolean }) {
  const { tr } = useTr();
  const [links, setLinks] = useState<QrLink[] | null>(null);
  const act = (student: string, o: { reset?: boolean; revoke?: boolean }) => lmsApi.qrLinks(hwId, { student, ...o }, asAdmin).then((r) => setLinks(r.links)).catch(() => undefined);
  return (
    <details className="w-full" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !links) lmsApi.qrLinks(hwId, {}, asAdmin).then((r) => setLinks(r.links)).catch(() => setLinks([])); }} data-testid="hw-qr-links">
      <summary className={smallBtn + " cursor-pointer"}>🔗 {tr("QR links per student", "روابط QR لكل طالب")}</summary>
      {links && (
        <ul className="mt-2 divide-y divide-black/5 rounded-2xl border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
          {links.map((l) => (
            <li key={l.student} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="flex-1 font-semibold" dir="auto">{l.name} <span className="font-normal opacity-60">{l.section}</span></span>
              {l.token ? <a className={smallBtn} href={`/q?t=${l.token}`} target="_blank" rel="noopener" data-testid="qr-open">↗ {tr("Open", "فتح")}</a> : <span className="opacity-60">{tr("Off", "متوقف")}</span>}
              <button type="button" className={smallBtn} onClick={() => act(l.student, { reset: true })} title={tr("New link (old QR stops working)", "رابط جديد (يتوقف القديم)")}>↻</button>
              {l.token && <button type="button" className={smallBtn + " text-rose-600"} onClick={() => act(l.student, { revoke: true })} title={tr("Turn off", "إيقاف")}>⦸</button>}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Staff override for the same-surah lock: see who is waiting on earlier verses and unlock (or re-lock) per student. */
function LockList({ hwId, asAdmin }: { hwId: string; asAdmin: boolean }) {
  const { tr } = useTr();
  type L = Awaited<ReturnType<typeof lmsApi.hwLocks>>["locks"];
  const [locks, setLocks] = useState<L | null>(null);
  const act = (student: string, unlock: boolean) => lmsApi.hwLocks(hwId, { student, unlock }, asAdmin).then((r) => setLocks(r.locks)).catch(() => undefined);
  const shown = (locks || []).filter((l) => l.lockedBy || l.unlocked);
  return (
    <details className="w-full" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !locks) lmsApi.hwLocks(hwId, {}, asAdmin).then((r) => setLocks(r.locks)).catch(() => setLocks([])); }} data-testid="hw-locks">
      <summary className={smallBtn + " cursor-pointer"}>🔒 {tr("Locked students", "الطلاب المقفلون")}</summary>
      {locks && (shown.length === 0 ? <p className="mt-2 text-sm opacity-70">{tr("Nobody is locked on this homework.", "لا يوجد طالب مقفل في هذا الواجب.")}</p> : (
        <ul className="mt-2 divide-y divide-black/5 rounded-2xl border border-black/10 text-sm dark:divide-white/10 dark:border-white/15">
          {shown.map((l) => (
            <li key={l.student} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="flex-1" dir="auto"><b>{l.name}</b> <span className="opacity-60">{l.section}</span><br /><span className="text-xs opacity-70">{l.lockedBy ? tr(`Waiting on Surah ${l.lockedBy.surah}, verses ${l.lockedBy.from}–${l.lockedBy.to}`, `ينتظر سورة ${l.lockedBy.surah}، الآيات ${l.lockedBy.from}–${l.lockedBy.to}`) : tr("Unlocked by staff", "فتحه المعلم")}</span></span>
              {l.lockedBy ? <button type="button" className={smallBtn} onClick={() => act(l.student, true)} data-testid="hw-unlock">🔓 {tr("Unlock", "فتح")}</button>
                : <button type="button" className={smallBtn} onClick={() => act(l.student, false)}>🔒 {tr("Lock again", "أعد القفل")}</button>}
            </li>
          ))}
        </ul>
      ))}
    </details>
  );
}

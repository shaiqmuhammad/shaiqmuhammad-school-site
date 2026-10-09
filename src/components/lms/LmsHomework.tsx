"use client";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LmsStaffToolbar } from "@/components/lms/LmsEntry";
import { AssessmentShell, primaryBtn } from "@/components/assessment/AssessmentShell";
import { HomeworkEditor } from "@/components/lms/HomeworkEditor";
import { homeworkQrPdf } from "@/components/lms/lmsFiles";
import { adminRelogin, STATUS_STYLE, card, inputCls, smallBtn, statusLabel, useLmsActor, useTr } from "@/components/lms/useLms";
import { ayahAudio, lmsApi, lmsErrorText, quranChapters, quranVerses, type Chapter, type GeneralData, type QuranData, type Submission, type Catalog, type DashStudent } from "@/lib/lms";

type Data = Awaited<ReturnType<typeof lmsApi.homework>>;

function QuranReader({ data }: { data: QuranData }) {
  const { tr } = useTr();
  const [verses, setVerses] = useState<{ n: number; text: string }[] | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    quranVerses(data.surah, data.from, data.to).then(setVerses).catch(() => setVerses([]));
    return () => audio.current?.pause();
  }, [data.surah, data.from, data.to]);
  const play = (n: number, chain: boolean) => {
    audio.current?.pause();
    const a = new Audio(ayahAudio(data.reciter, data.surah, n));
    audio.current = a;
    setPlaying(n);
    a.onended = () => {
      if (chain && n < data.to) play(n + 1, true);
      else {
        setPlaying(null);
        setAll(false);
      }
    };
    a.play().catch(() => setPlaying(null));
  };
  return (
    <section className={card} data-testid="quran-reader">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={smallBtn} onClick={() => { if (all) { audio.current?.pause(); setAll(false); setPlaying(null); } else { setAll(true); play(data.from, true); } }} data-testid="quran-play-all">
          {all ? "⏹ " + tr("Stop", "إيقاف") : "▶ " + tr("Listen to all", "استمع للكل")}
        </button>
        <span className="text-sm opacity-70">{tr("Tap a verse to hear it.", "اضغط على الآية لسماعها.")}</span>
      </div>
      {!verses ? (
        <p className="opacity-70">{tr("Loading verses…", "جارٍ تحميل الآيات…")}</p>
      ) : verses.length === 0 ? (
        <p className="opacity-70">{tr("Couldn't load the verses — check your connection.", "تعذر تحميل الآيات — تحقق من الاتصال.")}</p>
      ) : (
        <ol className="space-y-2" dir="rtl">
          {verses.map((v) => (
            <li key={v.n}>
              <button type="button" onClick={() => play(v.n, false)} className={`w-full rounded-2xl px-4 py-3 text-right font-[family-name:var(--font-quran,serif)] text-3xl leading-[2.2] transition ${playing === v.n ? "bg-sun/40" : "hover:bg-black/5 dark:hover:bg-white/5"}`} data-testid="quran-verse">
                {v.text} <span className="mx-1 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-current align-middle text-base font-bold opacity-60">{v.n.toLocaleString("ar-EG")}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
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
        <p key={i} className="rounded-2xl bg-sky-50 px-3 py-2 dark:bg-sky-900/30" dir="auto" data-testid="hw-comment"><b>{c.by}:</b> {c.text}</p>
      ))}
    </div>
  );
}

function StudentWork({ hw, sub, reload }: { hw: Data["homework"]; sub: Submission | null; reload: () => void }) {
  const { tr } = useTr();
  const [text, setText] = useState(sub?.text || "");
  const [practised, setPractised] = useState(sub?.practised || false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const locked = sub?.status === "approved";
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
      </div>
      {hw.kind === "quran" ? (
        <>
          <label className="flex items-center gap-2 text-lg font-semibold">
            <input type="checkbox" className="h-6 w-6" checked={practised} disabled={locked} onChange={(e) => setPractised(e.target.checked)} data-testid="hw-practised" /> {tr("I have practised these verses", "تدرّبت على هذه الآيات")}
          </label>
          <p className="rounded-2xl border border-dashed border-black/20 px-3 py-2 text-sm opacity-80 dark:border-white/25">🎙️ {tr("Recording your recitation will be available soon.", "تسجيل تلاوتك سيتوفر قريبًا.")}</p>
        </>
      ) : (
        (hw.data as GeneralData).question && <p className="text-lg font-semibold" dir="auto">{(hw.data as GeneralData).question}</p>
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
    </section>
  );
}

function Review({ s, asAdmin, reload }: { s: NonNullable<Data["subs"]>[number]; asAdmin: boolean; reload: () => void }) {
  const { tr } = useTr();
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
        {s.status !== "approved" && <button type="button" className="rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white" onClick={() => act({ status: "approved" })} data-testid="hw-approve">✓ {tr("Approve", "قبول")}</button>}
        {s.status !== "returned" && <button type="button" className={smallBtn} onClick={() => act({ status: "returned" })} data-testid="hw-return">↺ {tr("Ask to try again", "اطلب المحاولة مجددًا")}</button>}
      </div>
      {s.text && <p className="whitespace-pre-wrap rounded-2xl bg-white/80 px-3 py-2 dark:bg-white/5" dir="auto">{s.text}</p>}
      {s.comments.map((x, i) => (
        <p key={i} className="text-sm" dir="auto"><b>{x.by}:</b> {x.text}</p>
      ))}
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
  const { actor, asAdmin, ready } = useLmsActor();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(false);
  const [extra, setExtra] = useState<{ classes: { cls: string; students: number }[]; students: DashStudent[]; catalog?: Catalog; scope?: string[] }>({ classes: [], students: [] });
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const load = useCallback(() => {
    lmsApi.homework(id, asAdmin).then(setD).catch((e) => { if (asAdmin && (e as { status?: number }).status === 401) adminRelogin(); else setErr(lmsErrorText(e, tr)); });
  }, [id, asAdmin, tr]);
  useEffect(() => {
    if (!ready) return;
    if (!actor) {
      if (isAdminAuthenticated() && adminRelogin()) return;
      router.replace(`/lms/login?next=${encodeURIComponent(`/lms/homework?id=${id}`)}`);
      return;
    }
    load();
    quranChapters().then(setChapters);
  }, [ready, actor, id, load, router]);

  const staff = actor?.role === "teacher" || actor?.role === "admin";
  const hw = d?.homework;
  const q = hw?.data as QuranData | undefined;
  const ch = q ? chapters.find((c) => c.id === q.surah) : undefined;
  const subtitle = hw?.kind === "quran" && q ? `${ch?.name_simple || `Surah ${q.surah}`} ${ch?.name_arabic || ""} · ${q.from}–${q.to}` : hw?.cls || "";

  return (
    <AssessmentShell title={hw?.title || tr("Homework", "واجب")} exitHref="/lms" wide={staff} toolbar={staff ? <LmsStaffToolbar /> : undefined}>
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
                <button type="button" className={smallBtn} onClick={() => homeworkQrPdf(hw, subtitle).catch(() => setErr(tr("Couldn't make the QR card.", "تعذر إنشاء بطاقة QR.")))} data-testid="hw-qr-pdf">🔳 {tr("QR card (PDF)", "بطاقة QR (PDF)")}</button>
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
            {hw.kind === "quran" ? <QuranReader data={hw.data as QuranData} /> : <Slides data={hw.data as GeneralData} />}
            {!staff && <StudentWork key={d?.sub?.updated || 0} hw={hw} sub={d?.sub || null} reload={load} />}
            {staff && (
              <section className="space-y-3">
                <h2 className="text-xl font-bold">{tr("Submissions", "التسليمات")} ({d?.subs?.length || 0})</h2>
                <ul className="space-y-3">
                  {(d?.subs || []).map((s) => (
                    <Review key={s.id + s.updated} s={s} asAdmin={asAdmin} reload={load} />
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
